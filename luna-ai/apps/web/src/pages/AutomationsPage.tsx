import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleDashed, PauseCircle, Trash2, TriangleAlert, Workflow } from 'lucide-react';
import type { AutomationRuleDto } from '@luna/shared';
import { Page } from '../components/Layout';
import { Banner, Button, Card, PageHeader, Spinner, Toggle, inputClass } from '../components/ui';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../stores/auth';
import { useDevices } from '../stores/devices';

const STATUS = {
  draft: { label: 'Rascunho — aguardando confirmação', icon: CircleDashed, cls: 'text-amber-300' },
  active: { label: 'Ativa no Home Assistant', icon: CheckCircle2, cls: 'text-emerald-300' },
  disabled: { label: 'Criada, mas desativada', icon: PauseCircle, cls: 'text-white/50' },
  error: { label: 'Erro', icon: TriangleAlert, cls: 'text-rose-300' },
};

type TriggerType = 'time' | 'sunset' | 'sunrise' | 'leave_home' | 'arrive_home';

function NewAutomation({ onCreated }: { onCreated: () => void }) {
  const devices = useDevices((s) => s.devices);
  const load = useDevices((s) => s.load);
  const [persons, setPersons] = useState<{ entityId: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<TriggerType>('time');
  const [at, setAt] = useState('23:00');
  const [offset, setOffset] = useState(0);
  const [person, setPerson] = useState('');
  const [service, setService] = useState<'turn_on' | 'turn_off'>('turn_off');
  const [allLights, setAllLights] = useState(true);
  const [targets, setTargets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Object.keys(devices).length) void load(true);
    api<{ entityId: string; name: string }[]>('/api/automations/persons')
      .then((p) => {
        setPersons(p);
        if (p[0]) setPerson(p[0].entityId);
      })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const authorized = useMemo(() => Object.values(devices).filter((d) => d.controllable && d.aiAllowed), [devices]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const trig =
      trigger === 'time' ? { type: 'time', at } : trigger === 'sunset' || trigger === 'sunrise' ? { type: trigger, offsetMinutes: offset } : { type: trigger, personEntityId: person };
    try {
      await api('/api/automations', { body: { name, trigger: trig, action: { service, target: allLights ? 'all_lights' : targets } } });
      setName('');
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6">
      <h2 className="mb-3 font-medium">Nova automação</h2>
      {error && <Banner>{error}</Banner>}
      <form onSubmit={submit} className="space-y-3 text-sm">
        <input className={inputClass} placeholder="Nome (ex.: Apagar luzes à noite)" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={80} />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-white/60">
            Quando
            <select className={`${inputClass} mt-1`} value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerType)}>
              <option value="time">Em um horário</option>
              <option value="sunset">Ao anoitecer (pôr do sol)</option>
              <option value="sunrise">Ao amanhecer</option>
              <option value="leave_home" disabled={!persons.length}>Quando eu sair de casa</option>
              <option value="arrive_home" disabled={!persons.length}>Quando eu chegar em casa</option>
            </select>
          </label>
          {trigger === 'time' && (
            <label className="text-white/60">
              Horário
              <input type="time" className={`${inputClass} mt-1`} value={at} onChange={(e) => setAt(e.target.value)} required />
            </label>
          )}
          {(trigger === 'sunset' || trigger === 'sunrise') && (
            <label className="text-white/60">
              Ajuste (minutos)
              <input type="number" min={-180} max={180} className={`${inputClass} mt-1`} value={offset} onChange={(e) => setOffset(Number(e.target.value))} />
            </label>
          )}
          {(trigger === 'leave_home' || trigger === 'arrive_home') && (
            <label className="text-white/60">
              Pessoa (Home Assistant)
              <select className={`${inputClass} mt-1`} value={person} onChange={(e) => setPerson(e.target.value)}>
                {persons.map((p) => (
                  <option key={p.entityId} value={p.entityId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="block text-white/60">
          Ação
          <select className={`${inputClass} mt-1`} value={service} onChange={(e) => setService(e.target.value as 'turn_on' | 'turn_off')}>
            <option value="turn_off">Desligar</option>
            <option value="turn_on">Ligar</option>
          </select>
        </label>
        <label className="flex items-center justify-between">
          <span className="text-white/70">Todas as luzes autorizadas</span>
          <Toggle label="Todas as luzes" checked={allLights} onChange={setAllLights} />
        </label>
        {!allLights && (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-sm border border-white/10 p-2">
            {authorized.length === 0 && <p className="text-xs text-white/40">Nenhum dispositivo autorizado. Autorize em “Minha casa”.</p>}
            {authorized.map((d) => (
              <label key={d.entityId} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={targets.includes(d.entityId)}
                  onChange={(e) => setTargets((t) => (e.target.checked ? [...t, d.entityId] : t.filter((x) => x !== d.entityId)))}
                />
                {d.name}
              </label>
            ))}
          </div>
        )}
        <Button type="submit" busy={busy} disabled={!allLights && targets.length === 0}>
          Criar rascunho
        </Button>
        <p className="text-xs text-white/40">O rascunho só é enviado ao Home Assistant depois que você revisar e tocar em “Confirmar e ativar”.</p>
      </form>
    </Card>
  );
}

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRuleDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isAdmin = useAuth((s) => s.user?.role === 'admin');

  const load = () => api<AutomationRuleDto[]>('/api/automations').then(setRules).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);

  const act = async (id: string, path: string, method = 'POST') => {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/automations/${id}${path}`, { method });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      void load();
    }
  };

  return (
    <Page>
      <PageHeader title="Automações" subtitle="Regras executadas pelo próprio Home Assistant" />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      {isAdmin ? <NewAutomation onCreated={() => void load()} /> : <Banner kind="info">Somente administradores podem criar ou ativar automações.</Banner>}
      {!rules ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : rules.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-8 text-center text-sm text-white/50">
          <Workflow className="h-8 w-8 text-violet-300/60" />
          Nenhuma automação. Crie acima ou peça: “Dia, crie uma automação para desligar as luzes às 23h”.
        </Card>
      ) : (
        <ul className="space-y-3">
          {rules.map((r) => {
            const s = STATUS[r.status];
            return (
              <li key={r.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{r.name}</p>
                      <p className="mt-0.5 text-sm text-white/60">{r.description}</p>
                      <p className={`mt-2 flex items-center gap-1.5 text-xs ${s.cls}`}>
                        <s.icon className="h-3.5 w-3.5" /> {s.label}
                        {r.haEntityId && <span className="font-mono text-white/30"> · {r.haEntityId}</span>}
                      </p>
                      {r.lastError && <p className="mt-1 text-xs text-rose-300">{r.lastError}</p>}
                    </div>
                    {isAdmin && (r.status === 'active' || r.status === 'disabled') && (
                      <Toggle label="Habilitar" checked={r.status === 'active'} disabled={busy === r.id} onChange={(v) => void act(r.id, v ? '/enable' : '/disable')} />
                    )}
                  </div>
                  {isAdmin && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(r.status === 'draft' || r.status === 'error') && (
                        <Button busy={busy === r.id} onClick={() => void act(r.id, '/activate')}>
                          Confirmar e ativar
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        disabled={busy === r.id}
                        onClick={() => {
                          if (confirm(r.status === 'draft' ? 'Descartar este rascunho?' : 'Remover esta automação também do Home Assistant?')) void act(r.id, '', 'DELETE');
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> {r.status === 'draft' ? 'Descartar' : 'Remover'}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
