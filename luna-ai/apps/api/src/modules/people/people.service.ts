import { EventEmitter } from 'node:events';
import type { PeopleConfigDto, PersonDto } from '@luna/shared';
import type { HomeAssistantRestClient } from '../../integrations/home-assistant/rest-client';
import type { HaState, HaStateChangedEvent } from '../../integrations/home-assistant/types';
import type { Db } from '../../lib/db';
import { badRequest, notFound } from '../../lib/errors';
import { normalize } from '../../lib/text';
import type { DevicesService } from '../devices/devices.service';

const isPerson = (id: string) => id.startsWith('person.');
const listJoin = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} e ${a.at(-1)}` : (a[0] ?? ''));

/**
 * Quem está em casa, pelas pessoas do Home Assistant (person.*). Cada pessoa no HA junta o app do
 * celular, o roteador e outros rastreadores. A Luna só lê; as ações ao chegar/sair são escolhidas
 * nos ajustes (acender uma luz à noite, apagar as luzes quando sai o último, avisar no celular).
 */
export class PeopleService extends EventEmitter {
  /** Aviso no celular (Web Push) — ligado pelo app */
  notify: (title: string, body: string) => void = () => {};
  /** O que ainda está ligado além das luzes (ex.: lava e seca), para o aviso de “todos saíram” */
  extraOn: () => Promise<string[]> = async () => [];

  constructor(
    private readonly db: Db,
    private readonly ha: HomeAssistantRestClient,
    private readonly devices: DevicesService,
    private readonly tz: string,
  ) {
    super();
  }

  private toDto(s: HaState): PersonDto {
    const a = s.attributes ?? {};
    const home = s.state === 'home';
    const place = home ? 'Em casa' : s.state === 'not_home' ? 'Fora' : s.state === 'unknown' || s.state === 'unavailable' ? 'Sem informação' : s.state;
    return {
      id: s.entity_id,
      name: typeof a.friendly_name === 'string' && a.friendly_name ? a.friendly_name : s.entity_id.slice(7),
      home,
      place,
      since: s.last_changed ?? null,
      picture: typeof a.entity_picture === 'string' && a.entity_picture.length > 0,
    };
  }

  async list(): Promise<PersonDto[]> {
    const all = await this.ha.getStates();
    return all.filter((s) => isPerson(s.entity_id)).map((s) => this.toDto(s)).sort((x, y) => Number(y.home) - Number(x.home) || x.name.localeCompare(y.name, 'pt-BR'));
  }

  /** Foto da pessoa (vem do Home Assistant) */
  async photo(id: string): Promise<Response> {
    if (!/^person\.[a-z0-9_]+$/.test(id)) throw notFound('Pessoa não encontrada.');
    const s = await this.ha.getState(id).catch(() => null);
    const pic = s?.attributes?.entity_picture;
    if (typeof pic !== 'string' || !pic.startsWith('/')) throw notFound('Esta pessoa não tem foto no Home Assistant.');
    return this.ha.raw(pic);
  }

  async config(): Promise<PeopleConfigDto> {
    const c = await this.db.peopleConfig.findUnique({ where: { id: 'main' } });
    return { arriveLight: c?.arriveLight ?? null, leaveLightsOff: c?.leaveLightsOff ?? true, leaveNotify: c?.leaveNotify ?? true };
  }

  async setConfig(patch: Partial<PeopleConfigDto>) {
    if (patch.arriveLight) {
      const d = await this.devices.get(patch.arriveLight).catch(() => null);
      if (!d || d.domain !== 'light') throw badRequest('Escolha uma luz que exista no Home Assistant.');
    }
    await this.db.peopleConfig.upsert({ where: { id: 'main' }, create: { id: 'main', ...patch }, update: patch });
    return this.config();
  }

  /** Noite: o sol já se pôs (sun.sun) ou, sem essa informação, entre 18h e 6h */
  private async isNight(): Promise<boolean> {
    const sun = await this.ha.getState('sun.sun').catch(() => null);
    if (sun?.state === 'below_horizon') return true;
    if (sun?.state === 'above_horizon') return false;
    const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: this.tz }).format(new Date()));
    return h >= 18 || h < 6;
  }

  /** Mudança de uma pessoa no Home Assistant: chegou ou saiu */
  async handleStateChanged(evt: HaStateChangedEvent) {
    if (!isPerson(evt.entity_id) || !evt.new_state) return;
    const was = evt.old_state?.state === 'home';
    const now = evt.new_state.state === 'home';
    if (was === now) return;
    this.emit('update');
    const name = this.toDto(evt.new_state).name;
    const cfg = await this.config();
    const actor = { source: 'automation' as const };
    if (now) {
      // Chegou à noite: acende a luz escolhida
      if (cfg.arriveLight && (await this.isNight())) await this.devices.turnOn(cfg.arriveLight, actor).catch(() => undefined);
      return;
    }
    // Saiu: era o último?
    const people = await this.list().catch(() => []);
    if (people.some((p) => p.home)) return;
    let off = 0;
    if (cfg.leaveLightsOff) off = (await this.devices.bulk('light', 'turn_off', actor).catch(() => [])).filter((r) => r.ok).length;
    if (!cfg.leaveNotify) return;
    const still = (await this.devices.list().catch(() => [])).filter((d) => d.isOn && d.controllable && !d.hidden && (d.domain !== 'light' || !cfg.leaveLightsOff)).map((d) => d.name);
    const extra = await this.extraOn().catch(() => []);
    const left = [...still, ...extra];
    const parts = [off ? `Apaguei ${off === 1 ? 'uma luz' : `${off} luzes`}.` : '', left.length ? `Ainda ligado: ${listJoin(left.slice(0, 5))}${left.length > 5 ? ' e mais' : ''}.` : 'Nada ficou ligado.'];
    this.notify('Todos saíram de casa', `${name} saiu por último. ${parts.filter(Boolean).join(' ')}`.trim());
  }

  private hour(iso: string | null) {
    return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: this.tz }) : '';
  }

  /** Respostas por voz: “quem está em casa?”, “o Daniel já chegou?”. null = não é uma pessoa conhecida */
  async voice(name: string | null): Promise<string | null> {
    const people = await this.list();
    if (!people.length) return 'Não encontrei pessoas no Home Assistant. Cadastre cada morador em Configurações › Pessoas, ligado ao app do celular.';
    if (!name) {
      const home = people.filter((p) => p.home).map((p) => p.name);
      const away = people.filter((p) => !p.home).map((p) => (p.place !== 'Fora' && p.place !== 'Sem informação' ? `${p.name} (${p.place})` : p.name));
      if (!home.length) return `Não tem ninguém em casa agora.${away.length ? ` Fora: ${listJoin(away)}.` : ''}`;
      return `Em casa: ${listJoin(home)}.${away.length ? ` Fora: ${listJoin(away)}.` : ''}`;
    }
    const q = normalize(name);
    const p = people.find((x) => normalize(x.name) === q) ?? people.find((x) => normalize(x.name).split(' ')[0] === q.split(' ')[0]);
    if (!p) return null;
    const since = p.since ? ` desde as ${this.hour(p.since)}` : '';
    if (p.home) return `Sim, ${p.name} está em casa${since}.`;
    return p.place === 'Fora' || p.place === 'Sem informação' ? `Não, ${p.name} está fora de casa${since}.` : `Não, ${p.name} está em ${p.place}${since}.`;
  }
}
