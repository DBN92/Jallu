import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, LogOut, MapPin, Search, Share, Trash2, XCircle } from 'lucide-react';
import type { ActionLogDto, AiMode, HealthDto, PublicUser } from '@luna/shared';
import { Page } from '../components/Layout';
import { Banner, Button, Card, PageHeader, Spinner, Toggle, inputClass } from '../components/ui';
import { isIOS, isStandalone, useSpeechSynthesis } from '../hooks/speech';
import { wakeWordSupport } from '../hooks/useWakeWord';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../stores/auth';
import { useLocation } from '../stores/location';
import { useSettings } from '../stores/settings';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-medium tracking-wider text-white/40 uppercase">{title}</h2>
      <Card className="divide-y divide-white/5 p-0">{children}</Card>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-white/40">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const MODES: { value: AiMode; label: string; hint: string }[] = [
  { value: 'local', label: 'Local', hint: 'Somente Ollama. Nada sai de casa.' },
  { value: 'hybrid', label: 'Híbrido', hint: 'Casa e conversas simples no local; tarefas complexas na OpenAI.' },
  { value: 'cloud', label: 'Nuvem', hint: 'OpenAI primeiro, com o modelo local como reserva.' },
];

function HealthStatus() {
  const [h, setH] = useState<HealthDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<HealthDto>('/api/health/details').then(setH).catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <Row label="Status" hint={error} />;
  if (!h) return <Row label="Verificando serviços…"><Spinner className="h-4 w-4" /></Row>;
  const items = [
    ['Banco de dados', h.services.database],
    ['Home Assistant', { ...h.services.homeAssistant, detail: `${h.services.homeAssistant.detail}${h.services.homeAssistant.websocket ? ' · tempo real ativo' : ' · tempo real inativo'}` }],
    [`Ollama (${h.services.ollama.model})`, h.services.ollama],
    [`OpenAI (${h.services.openai.model})`, h.services.openai],
  ] as const;
  return (
    <>
      {items.map(([label, s]) => (
        <Row key={label} label={label} hint={s.detail}>
          {s.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <XCircle className="h-5 w-5 text-rose-400" />}
        </Row>
      ))}
      <Row label="Versão" hint={`Luna AI ${h.version} · ativa há ${Math.round(h.uptimeSeconds / 60)} min`} />
    </>
  );
}

function HomeLocation() {
  const { settings, setHome } = useSettings();
  const requestGps = useLocation((s) => s.request);
  const geoMessage = useLocation((s) => s.message);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ name: string; latitude: number; longitude: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const home = settings?.homeLocation;

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<typeof results>(`/api/location/search?q=${encodeURIComponent(q)}`);
      setResults(r);
      if (!r.length) setError('Nenhuma cidade encontrada.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const useCurrent = async () => {
    const c = await requestGps();
    if (!c) return setError(geoMessage ?? 'Não consegui obter sua localização.');
    await setHome({ name: 'Casa', latitude: Math.round(c.latitude * 1000) / 1000, longitude: Math.round(c.longitude * 1000) / 1000 }).catch((e) => setError(errorMessage(e)));
  };

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm">Localização de casa</p>
          <p className="text-xs text-white/40">{home ? `${home.name} (${home.latitude.toFixed(2)}, ${home.longitude.toFixed(2)})` : 'Não definida'}</p>
        </div>
        {home && (
          <button onClick={() => void setHome(null)} className="rounded-full p-2 text-white/40 hover:text-rose-300" aria-label="Remover localização de casa">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <form onSubmit={search} className="flex gap-2">
        <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cidade" minLength={2} required />
        <Button type="submit" variant="ghost" busy={busy} aria-label="Buscar">
          <Search className="h-4 w-4" />
        </Button>
      </form>
      {results.length > 0 && (
        <ul className="space-y-1">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button
                onClick={() => {
                  void setHome(r);
                  setResults([]);
                  setQ('');
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" onClick={() => void useCurrent()}>
        <MapPin className="h-4 w-4" /> Usar posição atual como casa
      </Button>
    </div>
  );
}

function Account() {
  const { user, logout } = useAuth();
  const [form, setForm] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [nu, setNu] = useState({ username: '', displayName: '', password: '', role: 'member' });
  const isAdmin = user?.role === 'admin';
  const loadUsers = () => isAdmin && api<PublicUser[]>('/api/users').then(setUsers).catch(() => undefined);
  useEffect(() => {
    void loadUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/auth/password', { body: form });
      setMsg({ kind: 'info', text: 'Senha alterada. Entre novamente.' });
      setTimeout(() => useAuth.getState().expire(), 1500);
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    }
  };

  const createUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/users', { body: nu });
      setNu({ username: '', displayName: '', password: '', role: 'member' });
      setMsg({ kind: 'info', text: 'Usuário criado.' });
      void loadUsers();
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    }
  };

  return (
    <div className="space-y-4 px-4 py-4">
      {msg && <Banner kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <p className="text-sm">
        {user?.displayName} <span className="text-white/40">@{user?.username} · {user?.role === 'admin' ? 'administrador' : 'membro'}</span>
      </p>
      <form onSubmit={changePassword} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="password" className={inputClass} placeholder="Senha atual" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required autoComplete="current-password" />
        <input type="password" className={inputClass} placeholder="Nova senha (mín. 8)" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} minLength={8} required autoComplete="new-password" />
        <Button type="submit" variant="ghost">Alterar senha</Button>
      </form>
      {isAdmin && (
        <div className="space-y-2 border-t border-white/5 pt-4">
          <p className="text-sm">Usuários</p>
          <ul className="space-y-1 text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-white/5">
                <span>
                  {u.displayName} <span className="text-white/40">@{u.username} · {u.role}</span>
                </span>
                {u.id !== user?.id && (
                  <button
                    onClick={async () => {
                      if (confirm(`Remover ${u.displayName}?`)) {
                        await api(`/api/users/${u.id}`, { method: 'DELETE' });
                        void loadUsers();
                      }
                    }}
                    className="p-1 text-white/40 hover:text-rose-300"
                    aria-label={`Remover ${u.displayName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={createUser} className="grid gap-2 sm:grid-cols-2">
            <input className={inputClass} placeholder="Nome" value={nu.displayName} onChange={(e) => setNu({ ...nu, displayName: e.target.value })} required />
            <input className={inputClass} placeholder="Usuário" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} required minLength={3} autoCapitalize="none" />
            <input type="password" className={inputClass} placeholder="Senha (mín. 8)" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required minLength={8} autoComplete="new-password" />
            <select className={inputClass} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
              <option value="member">Membro (usa a Luna)</option>
              <option value="admin">Administrador</option>
            </select>
            <Button type="submit" variant="ghost" className="sm:col-span-2">Adicionar usuário</Button>
          </form>
        </div>
      )}
      <Button variant="danger" onClick={() => void logout()}>
        <LogOut className="h-4 w-4" /> Sair
      </Button>
    </div>
  );
}

function ActionLogs() {
  const [logs, setLogs] = useState<ActionLogDto[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !logs) api<ActionLogDto[]>('/api/action-logs').then(setLogs).catch(() => setLogs([]));
  }, [open, logs]);
  return (
    <div className="px-4 py-3">
      <button onClick={() => setOpen((o) => !o)} className="text-sm text-cyan-300">
        {open ? 'Ocultar' : 'Ver'} registro de ações
      </button>
      {open && (
        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto font-mono text-[11px]">
          {!logs && <Spinner className="h-4 w-4" />}
          {logs?.length === 0 && <li className="text-white/40">Nenhuma ação registrada.</li>}
          {logs?.map((l) => (
            <li key={l.id} className={l.success ? 'text-white/60' : 'text-rose-300'}>
              {new Date(l.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })} · {l.source} · {l.tool} {l.target ?? ''} {l.detail ? `— ${l.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { settings, load, update, voiceMode, setVoiceMode, useGps, setUseGps } = useSettings();
  const isAdmin = useAuth((s) => s.user?.role === 'admin');
  const tts = useSpeechSynthesis();
  const [caps, setCaps] = useState<{ realtime: boolean; realtimeVoices: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wake = wakeWordSupport(voiceMode);

  useEffect(() => {
    if (!settings) void load();
    api<{ realtime: boolean; realtimeVoices: string[] }>('/api/voice/capabilities').then(setCaps).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (patch: Parameters<typeof update>[0]) => update(patch).catch((e) => setError(errorMessage(e)));
  if (!settings) return <Page><div className="flex justify-center py-10"><Spinner /></div></Page>;

  return (
    <Page>
      <PageHeader title="Configurações" />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}

      {!isStandalone() && isIOS() && (
        <Banner kind="info">
          Instale a Luna no iPhone: toque em <Share className="inline h-3.5 w-3.5" /> Compartilhar e depois em “Adicionar à Tela de Início”.
        </Banner>
      )}

      <Section title="Inteligência artificial">
        <div className="px-4 py-3">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
            {MODES.map((m) => (
              <button key={m.value} onClick={() => void save({ aiMode: m.value })} className={`rounded-lg py-2 text-sm transition ${settings.aiMode === m.value ? 'bg-white text-ink-950' : 'text-white/70'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/45">{MODES.find((m) => m.value === settings.aiMode)?.hint}</p>
        </div>
        <Row label="Compartilhar memórias com a nuvem" hint="Permite que a OpenAI veja suas memórias salvas para respostas personalizadas.">
          <Toggle label="Memórias na nuvem" checked={settings.allowCloudMemory} onChange={(v) => void save({ allowCloudMemory: v })} />
        </Row>
      </Section>

      <Section title="Voz">
        <div className="px-4 py-3">
          <p className="mb-2 text-sm">Modo de voz</p>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
            <button onClick={() => setVoiceMode('basic')} className={`rounded-lg py-2 text-sm ${voiceMode === 'basic' ? 'bg-white text-ink-950' : 'text-white/70'}`}>
              Básico (navegador)
            </button>
            <button
              disabled={!caps?.realtime || settings.aiMode === 'local'}
              onClick={() => setVoiceMode('realtime')}
              className={`rounded-lg py-2 text-sm disabled:opacity-40 ${voiceMode === 'realtime' ? 'bg-white text-ink-950' : 'text-white/70'}`}
            >
              Tempo real (OpenAI)
            </button>
          </div>
          <p className="mt-2 text-xs text-white/45">
            {voiceMode === 'basic'
              ? 'Reconhecimento e fala do próprio aparelho. Funciona sem enviar áudio para a OpenAI.'
              : 'Conversa natural por WebRTC com a OpenAI. Comandos da casa continuam validados pelo seu servidor.'}
            {!caps?.realtime && ' Voz em tempo real requer OPENAI_API_KEY no servidor.'}
          </p>
        </div>
        <Row label="Falar as respostas" hint="No modo básico, a Luna lê as respostas em voz alta.">
          <Toggle label="Falar respostas" checked={settings.autoSpeak} onChange={(v) => void save({ autoSpeak: v })} />
        </Row>
        <div className="space-y-3 px-4 py-3">
          <label className="block text-sm">
            Voz do aparelho
            <select className={`${inputClass} mt-1`} value={settings.voiceName ?? ''} onChange={(e) => void save({ voiceName: e.target.value || null })}>
              <option value="">Padrão (pt-BR)</option>
              {tts.voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Velocidade da fala: {settings.voiceRate.toFixed(1)}x
            <input type="range" min={0.5} max={2} step={0.1} value={settings.voiceRate} onChange={(e) => void save({ voiceRate: Number(e.target.value) })} className="mt-2 w-full" />
          </label>
          <Button variant="ghost" onClick={() => tts.speak('Olá! Eu sou a Luna, sua assistente pessoal.', { voiceName: settings.voiceName, rate: settings.voiceRate })} disabled={!tts.supported}>
            Testar voz
          </Button>
          {caps?.realtime && (
            <label className="block text-sm">
              Voz em tempo real
              <select className={`${inputClass} mt-1`} value={settings.realtimeVoice} onChange={(e) => void save({ realtimeVoice: e.target.value })}>
                {caps.realtimeVoices.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <Row label="Transcrição na nuvem" hint="Se o navegador não reconhecer fala (comum em apps instalados no iPhone), o áudio é transcrito pela OpenAI.">
          <Toggle label="Transcrição na nuvem" disabled={!caps?.realtime} checked={settings.allowCloudTranscription} onChange={(v) => void save({ allowCloudTranscription: v })} />
        </Row>
        <Row label="Palavra de ativação “Ei, Luna”" hint={
            wake.supported
              ? voiceMode === 'realtime'
                ? 'Durante a conversa em tempo real, a Luna só responde quando você diz “Luna” (ou logo após ela falar). A tela fica acesa; com o app fechado ela não escuta.'
                : 'Somente com o app aberto e em primeiro plano.'
              : wake.reason
          }>
          <Toggle label="Ei, Luna" disabled={!wake.supported} checked={settings.wakeWordEnabled && wake.supported} onChange={(v) => void save({ wakeWordEnabled: v })} />
        </Row>
      </Section>

      <Section title="Localização">
        <Row label="Usar GPS deste aparelho" hint="Usado só no momento da consulta (clima). As coordenadas não são salvas.">
          <Toggle label="Usar GPS" checked={useGps} onChange={setUseGps} />
        </Row>
        <HomeLocation />
      </Section>

      <Section title="Sistema">
        <HealthStatus />
        {isAdmin && <ActionLogs />}
      </Section>

      <Section title="Conta">
        <Account />
      </Section>
    </Page>
  );
}
