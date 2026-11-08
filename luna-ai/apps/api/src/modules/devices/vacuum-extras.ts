import type { VacuumConsumable, VacuumControl, VacuumExtras, VacuumOption } from '@luna/shared';
import type { HaState } from '../../integrations/home-assistant/types';

/**
 * Opções extras do aspirador a partir das entidades “acessórias” do mesmo aparelho.
 * Feito para a integração Xiaomi Home, que nomeia as entidades pelo padrão MIoT:
 *   <aparelho>_<nome>_<p|a|e>_<serviço>_<id>  (p = propriedade, a = ação, e = evento)
 * Só entram controles conhecidos e seguros (lista fechada); o resto é ignorado.
 */

interface Parsed {
  state: HaState;
  domain: string;
  name: string;
  siid: number;
}

const OPTION_LABEL: Record<string, string> = {
  silent: 'Silenciosa',
  quiet: 'Silenciosa',
  basic: 'Básica',
  standard: 'Padrão',
  normal: 'Padrão',
  medium: 'Média',
  strong: 'Forte',
  turbo: 'Turbo',
  'full speed': 'Máxima',
  max: 'Máxima',
  low: 'Baixa',
  high: 'Alta',
};
const optionLabel = (v: string) => OPTION_LABEL[v.toLowerCase()] ?? v;

const CHARGING: Record<string, string> = {
  charging: 'Carregando',
  'not charging': 'Sem carregar',
  'not chargeable': 'Sem carregar',
  charged: 'Carga completa',
  'charging competely': 'Carga completa',
  'charging completely': 'Carga completa',
  'go charging': 'Indo carregar',
};

const num = (s: HaState | undefined) => {
  if (!s) return null;
  const v = Number(s.state);
  return Number.isFinite(v) ? v : null;
};
const unit = (s: HaState | undefined) => String(s?.attributes.unit_of_measurement ?? '').toLowerCase();
/** Converte para horas conforme a unidade informada (padrão: horas). */
const hours = (s: HaState | undefined) => {
  const v = num(s);
  if (v === null) return null;
  const u = unit(s);
  return u.startsWith('min') ? Math.round(v / 60) : u === 's' ? Math.round(v / 3600) : v;
};
/** Converte para minutos conforme a unidade (padrão: minutos). */
const minutes = (s: HaState | undefined) => {
  const v = num(s);
  if (v === null) return null;
  const u = unit(s);
  return u === 'h' ? v * 60 : u === 's' ? Math.round(v / 60) : v;
};

export function parseCompanion(state: HaState, vacuumObjectId: string): Parsed | null {
  const [domain, objectId] = state.entity_id.split('.') as [string, string];
  const rest = objectId.startsWith(`${vacuumObjectId}_`) ? objectId.slice(vacuumObjectId.length + 1) : objectId;
  const m = rest.match(/^(.*?)_([pae])_(\d+)_(\d+)$/);
  if (!m) return null;
  return { state, domain, name: m[1]!, siid: Number(m[3]) };
}

/** Agendamentos no formato da Xiaomi: “id-ativo-HH:MM-1111111-…;…” */
export function parseSchedules(raw: string): string[] {
  const out: string[] = [];
  for (const item of raw.split(';')) {
    const p = item.split('-');
    if (p.length < 4 || p[1] !== '1' || !/^\d{1,2}:\d{2}$/.test(p[2]!)) continue;
    const mask = p[3]!;
    const days = /^[01]{7}$/.test(mask) ? mask.split('').filter((c) => c === '1').length : null;
    out.push(`${p[2]} ${days === 7 ? 'todos os dias' : days ? `em ${days} dias da semana` : ''}`.trim());
  }
  return out.sort();
}

const isOpenClose = (s: HaState) => {
  const opts = (s.attributes.options as string[] | undefined) ?? [];
  return opts.length === 2 && opts.some((o) => /^open$/i.test(o)) && opts.some((o) => /^close$/i.test(o));
};

export function buildExtras(vacuumEntityId: string, companions: HaState[]): VacuumExtras | null {
  const vacuumObjectId = vacuumEntityId.split('.')[1]!;
  const parsed = companions.map((c) => parseCompanion(c, vacuumObjectId)).filter((p): p is Parsed => !!p && !['unavailable'].includes(p.state.state));
  if (!parsed.length) return null;
  const find = (domain: string, name: string) => parsed.filter((p) => p.domain === domain && p.name === name);
  const one = (domain: string, name: string) => find(domain, name)[0];
  const controls: VacuumControl[] = [];

  // Escolhas (select)
  const choice = (name: string, key: string, label: string) => {
    const p = one('select', name);
    if (!p) return;
    const options = ((p.state.attributes.options as string[] | undefined) ?? []).map((v): VacuumOption => ({ value: v, label: optionLabel(v) }));
    if (options.length) controls.push({ id: p.state.entity_id, key, label, kind: 'choice', value: p.state.state, options });
  };
  choice('mode', 'suction', 'Sucção');
  choice('mop_mode', 'water', 'Água do pano');

  // Liga/desliga (select Open/Close ou switch)
  const toggle = (name: string, key: string, label: string, hint?: string) => {
    const p = one('select', name);
    if (p && isOpenClose(p.state)) controls.push({ id: p.state.entity_id, key, label, kind: 'toggle', value: /^open$/i.test(p.state.state), hint });
  };
  const dnd = parsed.find((p) => p.domain === 'switch' && /do.not.disturb|nao perturbe|não perturbe/i.test(String(p.state.attributes.friendly_name ?? '')));
  if (dnd) {
    const start = parsed.find((p) => p.domain === 'text' && p.siid === dnd.siid && p.name === 'start_time')?.state.state;
    const end = parsed.find((p) => p.domain === 'text' && p.siid === dnd.siid && p.name === 'end_time')?.state.state;
    const valid = (t?: string) => !!t && /^\d{1,2}:\d{2}$/.test(t);
    controls.push({ id: dnd.state.entity_id, key: 'dnd', label: 'Não perturbe', kind: 'toggle', value: dnd.state.state === 'on', hint: valid(start) && valid(end) ? `das ${start} às ${end}` : undefined });
  }
  toggle('carpet_press', 'carpet', 'Reforço no tapete', 'aumenta a sucção em tapetes');
  toggle('break_point_restart', 'resume', 'Continuar de onde parou', 'depois de recarregar');
  toggle('child_lock', 'child_lock', 'Trava infantil', 'bloqueia os botões do robô');

  // Ações (botões)
  const action = (name: string, key: string, label: string) => {
    const p = one('button', name);
    if (p) controls.push({ id: p.state.entity_id, key, label, kind: 'action' });
  };
  action('start_mop_wash', 'mop_wash', 'Lavar pano');
  action('start_dry', 'dry_start', 'Secar pano');
  action('stop_dry', 'dry_stop', 'Parar secagem');
  action('start_dust_arrest', 'dust', 'Esvaziar pó');
  if (one('button', 'position')) action('position', 'locate', 'Onde está');
  else action('play_sound', 'locate', 'Tocar som');

  // Peças de desgaste. Escovas: o serviço de número menor é a principal (padrão MIoT dos robôs Xiaomi)
  const consumables: VacuumConsumable[] = [];
  const brushes = find('sensor', 'brush_life_level').sort((a, b) => a.siid - b.siid);
  const part = (key: VacuumConsumable['key'], label: string, life: Parsed | undefined, resetName: string, resetKey: string) => {
    const pct = num(life?.state);
    if (!life || pct === null) return;
    const left = parsed.find((p) => p.domain === 'sensor' && p.siid === life.siid && /_left_time$/.test(p.name));
    const reset = parsed.find((p) => p.domain === 'button' && p.siid === life.siid && p.name === resetName);
    if (reset) controls.push({ id: reset.state.entity_id, key: resetKey, label: `Zerar ${label.toLowerCase()}`, kind: 'action' });
    consumables.push({ key, label, percent: Math.max(0, Math.min(100, Math.round(pct))), hoursLeft: hours(left?.state), resetId: reset?.state.entity_id ?? null });
  };
  if (brushes.length === 1) part('main_brush', 'Escova', brushes[0], 'reset_brush_life', 'reset_main_brush');
  else if (brushes.length > 1) {
    part('main_brush', 'Escova principal', brushes[0], 'reset_brush_life', 'reset_main_brush');
    part('side_brush', 'Escova lateral', brushes[1], 'reset_brush_life', 'reset_side_brush');
  }
  part('filter', 'Filtro', one('sensor', 'filter_life_level'), 'reset_filter_life', 'reset_filter');
  part('mop', 'Pano', one('sensor', 'mop_life_level'), 'reset_mop_life', 'reset_mop');

  const charging = one('sensor', 'charging_state')?.state.state;
  const timer = one('text', 'timer_clean')?.state.state;
  const dry = minutes(one('sensor', 'dry_left_time')?.state);
  return {
    controls,
    consumables,
    stats: {
      lastArea: num(one('sensor', 'cleaning_area')?.state),
      lastMinutes: minutes(one('sensor', 'cleaning_time')?.state),
      totalArea: num(one('sensor', 'total_clean_area')?.state),
      totalCount: num(one('sensor', 'total_clean_times')?.state),
      totalMinutes: minutes(one('sensor', 'total_clean_time')?.state),
    },
    dryingMinutes: dry && dry > 0 ? dry : null,
    charging: charging && !['unknown', 'unavailable'].includes(charging) ? (CHARGING[charging.toLowerCase()] ?? charging) : null,
    schedules: timer && !['unknown', 'unavailable'].includes(timer) ? parseSchedules(timer) : [],
  };
}
