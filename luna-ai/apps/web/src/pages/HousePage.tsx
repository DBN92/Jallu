import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Disc3, Lightbulb, Pencil, Plug, Power, RefreshCw, RotateCcw, Settings2, Thermometer, ToggleLeft, Wind, Box, X } from 'lucide-react';
import { DEVICE_CATEGORY_LABELS, type DeviceCategory, type DeviceDto } from '@luna/shared/types';
import { Page } from '../components/Layout';
import { Banner, Button, Card, PageHeader, Spinner, Toggle, inputClass } from '../components/ui';
import { useAuth } from '../stores/auth';
import { useDevices } from '../stores/devices';
import { VacuumControls } from '../components/VacuumCard';

const ICONS: Record<DeviceCategory, typeof Lightbulb> = {
  lighting: Lightbulb,
  switches: ToggleLeft,
  outlets: Plug,
  sensors: Thermometer,
  climate: Wind,
  vacuum: Disc3,
  other: Box,
};
const ORDER: DeviceCategory[] = ['lighting', 'switches', 'outlets', 'climate', 'vacuum', 'sensors', 'other'];

function BrightnessSlider({ device }: { device: DeviceDto }) {
  const brightness = useDevices((s) => s.brightness);
  const [value, setValue] = useState(device.brightness ?? 0);
  useEffect(() => {
    setValue(device.brightness ?? 0);
  }, [device.brightness]);
  return (
    <div className="mt-3 flex items-center gap-3">
      <input
        type="range"
        min={1}
        max={100}
        value={value || 1}
        aria-label={`Brilho de ${device.name}`}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={() => void brightness(device.entityId, value)}
        onKeyUp={() => void brightness(device.entityId, value)}
        className="flex-1"
      />
      <span className="w-10 text-right text-xs text-white/60 tabular-nums">{value}%</span>
    </div>
  );
}

function DeviceCard({ device, manage }: { device: DeviceDto; manage: boolean }) {
  const { toggle, update, busy } = useDevices();
  const isAdmin = useAuth((s) => s.user?.role === 'admin');
  const Icon = ICONS[device.category];
  const [aliases, setAliases] = useState(device.aliases.join(', '));
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(device.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const on = device.isOn === true;

  const saveName = async (value: string | null) => {
    setSaving(true);
    const err = await update(device.entityId, { name: value });
    setSaving(false);
    setRenameError(err);
    if (!err) setEditing(false);
  };

  return (
    <Card className={`transition ${on ? 'border-amber-300/40' : ''} ${device.hidden ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-sm p-2.5 ${on ? 'border border-amber-300/60 bg-amber-400/15 text-amber-200 shadow-[0_0_12px_rgba(255,181,71,0.35)]' : 'bg-white/8 text-white/60'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) void saveName(newName.trim());
              }}
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={60}
                aria-label={`Novo nome para ${device.originalName}`}
                className={`${inputClass} py-1 text-sm`}
                placeholder="Como você chama este dispositivo?"
              />
              <button type="submit" disabled={saving || !newName.trim()} className="rounded-sm p-1.5 text-cyan-200 hover:bg-cyan-400/15" aria-label="Salvar nome">
                {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setRenameError(null);
                  setNewName(device.name);
                }}
                className="rounded-sm p-1.5 text-cyan-100/50 hover:bg-white/10"
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <p className="flex items-center gap-1.5 font-medium">
              <span className="truncate">{device.name}</span>
              {isAdmin && (
                <button
                  onClick={() => {
                    setNewName(device.name);
                    setEditing(true);
                  }}
                  className="shrink-0 rounded-sm p-1 text-cyan-300/50 hover:bg-cyan-400/10 hover:text-cyan-200"
                  aria-label={`Renomear ${device.name}`}
                  title="Renomear (para a Luna entender melhor)"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </p>
          )}
          {device.renamed && !editing && (
            <p className="flex flex-wrap items-center gap-x-1 text-[11px] text-cyan-100/35">
              <span className="min-w-0 truncate">no Home Assistant: {device.originalName}</span>
              {isAdmin && (
                <button onClick={() => void saveName(null)} className="ml-1 inline-flex items-center gap-0.5 text-cyan-300/60 hover:text-cyan-200" title="Voltar ao nome original">
                  <RotateCcw className="h-3 w-3" /> restaurar
                </button>
              )}
            </p>
          )}
          {renameError && <p className="text-[11px] text-rose-300">{renameError}</p>}
          <p className="text-xs text-white/45">
            {!device.available
              ? 'Indisponível'
              : device.vacuum
                ? 'Aspirador robô'
                : device.controllable
                ? on
                  ? device.supportsBrightness && device.brightness !== null
                    ? `Ligado · ${device.brightness}%`
                    : 'Ligado'
                  : 'Desligado'
                : `${device.state}${device.unit ? ` ${device.unit}` : ''}`}
            {device.controllable && device.aiAllowed && <Bot className="ml-1.5 inline h-3 w-3 text-cyan-300" aria-label="Autorizado para a Luna" />}
          </p>
        </div>
        {device.controllable && !device.vacuum && (
          <button
            onClick={() => void toggle(device)}
            disabled={!device.available || busy[device.entityId]}
            aria-label={on ? `Desligar ${device.name}` : `Ligar ${device.name}`}
            className={`rounded-full p-3 transition active:scale-95 disabled:opacity-40 ${on ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50 shadow-[0_0_10px_rgba(0,229,255,0.3)]' : 'bg-white/10 text-white'}`}
          >
            {busy[device.entityId] ? <Spinner className="h-5 w-5" /> : <Power className="h-5 w-5" />}
          </button>
        )}
      </div>
      {device.supportsBrightness && on && device.available && <BrightnessSlider device={device} />}
      {device.vacuum && device.available && (
        <div className="mt-3">
          <VacuumControls device={device} />
        </div>
      )}
      {manage && isAdmin && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm">
          <p className="font-mono text-[11px] text-white/35">{device.entityId}</p>
          {device.controllable && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-white/70">Luna pode controlar</span>
              <Toggle label="Autorizar para a Luna" checked={device.aiAllowed} onChange={(v) => void update(device.entityId, { aiAllowed: v })} />
            </label>
          )}
          <label className="flex items-center justify-between gap-2">
            <span className="text-white/70">Ocultar do painel</span>
            <Toggle label="Ocultar" checked={device.hidden} onChange={(v) => void update(device.entityId, { hidden: v })} />
          </label>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void update(device.entityId, { aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean) });
            }}
          >
            <input className={`${inputClass} py-1.5 text-sm`} value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Apelidos (ex.: abajur, luz da cama)" />
            <Button type="submit" variant="ghost" className="py-1.5">
              Salvar
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}

export default function HousePage() {
  const { devices, load, loading, error, haConnected } = useDevices();
  const isAdmin = useAuth((s) => s.user?.role === 'admin');
  const [manage, setManage] = useState(false);
  const [filter, setFilter] = useState<DeviceCategory | 'all'>(() => {
    const f = new URLSearchParams(window.location.search).get('f');
    return f && ORDER.includes(f as DeviceCategory) ? (f as DeviceCategory) : 'all';
  });

  useEffect(() => {
    void load(true);
  }, [load]);

  const grouped = useMemo(() => {
    const list = Object.values(devices).filter((d) => manage || !d.hidden);
    return ORDER.map((c) => ({ category: c, items: list.filter((d) => d.category === c).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) })).filter(
      (g) => g.items.length && (filter === 'all' || g.category === filter),
    );
  }, [devices, manage, filter]);

  const total = Object.keys(devices).length;
  const onCount = Object.values(devices).filter((d) => d.isOn).length;

  return (
    <Page>
      <PageHeader
        title="Minha casa"
        subtitle={total ? `${total} dispositivos · ${onCount} ligados${haConnected ? ' · tempo real' : ''}` : 'Dispositivos do Home Assistant'}
        action={
          <div className="flex gap-2">
            {isAdmin && (
              <button onClick={() => setManage((m) => !m)} className={`glass rounded-full p-2 ${manage ? 'text-cyan-300' : 'text-white/70'}`} aria-label="Gerenciar autorizações">
                <Settings2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => void load(true)} className="glass rounded-full p-2 text-white/70" aria-label="Atualizar">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />
      {error && <Banner>{error}</Banner>}
      {isAdmin && !manage && (
        <p className="font-hud mb-3 text-xs text-cyan-100/50">
          Dica: toque no <Pencil className="inline h-3 w-3" /> para dar a cada dispositivo o nome que você fala (ex.: “abajur do quarto”). A Luna entende o novo nome e o original.
        </p>
      )}
      {manage && (
        <Banner kind="info">
          Modo de gerenciamento: escolha quais dispositivos a Luna pode controlar por voz/IA. Pelo painel você sempre controla todos os dispositivos controláveis.
        </Banner>
      )}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['all', ...ORDER] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${filter === c ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50 shadow-[0_0_10px_rgba(0,229,255,0.3)]' : 'glass text-white/70'}`}
          >
            {c === 'all' ? 'Todos' : DEVICE_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      {loading && !total ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !total && !error ? (
        <Card className="text-center text-sm text-white/50">Nenhum dispositivo encontrado no Home Assistant.</Card>
      ) : (
        grouped.map((g) => (
          <section key={g.category} className="mb-6">
            <h2 className="mb-2 text-xs font-medium tracking-wider text-white/40 uppercase">{DEVICE_CATEGORY_LABELS[g.category]}</h2>
            <div className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
              {g.items.map((d) => (
                <DeviceCard key={d.entityId} device={d} manage={manage} />
              ))}
            </div>
          </section>
        ))
      )}
    </Page>
  );
}
