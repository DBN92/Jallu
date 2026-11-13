import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, LogOut, MapPin, Search, Share, Trash2, XCircle } from 'lucide-react';
import type { ActionLogDto, AiMode, HealthDto, PublicUser } from '@luna/shared';
import { Page } from '../components/Layout';
import { Banner, Button, Card, PageHeader, Spinner, Toggle, inputClass } from '../components/ui';
import { bestVoice, isHighQuality, isIOS, isStandalone, useSpeechSynthesis } from '../hooks/speech';
import { wakeWordSupport } from '../hooks/useWakeWord';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../stores/auth';
import { useLocation } from '../stores/location';
import { AMBIENT_DELAYS, useSettings, type AmbientSlide, type ScreenOrientationPref } from '../stores/settings';
import { applyOrientation, currentOrientation } from '../lib/orientation';
import { DirectCameras } from '../components/DirectCameras';
import { ThemePicker } from '../components/ThemePicker';
import { PhotoAlbumSettings } from '../components/PhotoAlbumSettings';
import { PresenceSettings } from '../components/PresenceSettings';
import { GarageSettings } from '../components/GarageSettings';
import { GestureSettings } from '../gestures/GestureSettings';
import { SiriSettings } from '../components/SiriSettings';
import { AndroidSettings } from '../components/AndroidSettings';
import { useWakeLog } from '../hooks/useWakeWord';

/** O que o chamado “Oi, Luna” ouviu por último: ajuda a ver se o celular está entendendo a frase. */
function WakeHeard() {
  const heard = useWakeLog((s) => s.heard);
  if (!heard.length) return null;
  return (
    <div className="mt-4 rounded-xl bg-white/5 p-3 text-sm">
      <p className="mb-2 text-xs text-white/50">O que o chamado “Oi, Luna” ouviu por último (✅ = acordou a Luna)</p>
      <ul className="space-y-1">
        {heard.map((h) => (
          <li key={h.at} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">“{h.text}”</span>
            <span className="shrink-0">{h.woke ? '✅' : '—'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-white/40">Se aparecer algo parecido com “oi dia” sem ✅, me conte o que saiu: dá para ensinar a Luna a aceitar.</p>
    </div>
  );
}

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
      <Row label="Versão" hint={`Servidor ${h.version} · ativo há ${Math.round(h.uptimeSeconds / 60)} min · app de ${__LUNA_BUILD__} UTC`} />
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
  const { settings, load, update, voiceMode, setVoiceMode, useGps, setUseGps, kioskMode, setKioskMode, orientation, setOrientation, ambientMode, setAmbientMode, ambientSlides, setAmbientSlides, ambientDelay, setAmbientDelay, tvMode, setTvMode } = useSettings();
  const [orientMsg, setOrientMsg] = useState<string | null>(null);
  const chooseOrientation = async (o: ScreenOrientationPref) => {
    setOrientation(o);
    setOrientMsg(await applyOrientation(o));
  };
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

      <Section title="Tema">
        <ThemePicker />
      </Section>

      <Section title="Inteligência artificial">
        <div className="px-4 py-3">
          <div className="grid grid-cols-3 gap-1 rounded-sm bg-white/5 p-1">
            {MODES.map((m) => (
              <button key={m.value} onClick={() => void save({ aiMode: m.value })} className={`rounded-lg py-2 text-sm transition ${settings.aiMode === m.value ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50 shadow-[0_0_10px_rgba(0,229,255,0.3)]' : 'text-white/70'}`}>
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
          <div className="grid grid-cols-2 gap-1 rounded-sm bg-white/5 p-1">
            <button onClick={() => setVoiceMode('basic')} className={`rounded-lg py-2 text-sm ${voiceMode === 'basic' ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50 shadow-[0_0_10px_rgba(0,229,255,0.3)]' : 'text-white/70'}`}>
              Básico (navegador)
            </button>
            <button
              disabled={!caps?.realtime || settings.aiMode === 'local'}
              onClick={() => setVoiceMode('realtime')}
              className={`rounded-lg py-2 text-sm disabled:opacity-40 ${voiceMode === 'realtime' ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50 shadow-[0_0_10px_rgba(0,229,255,0.3)]' : 'text-white/70'}`}
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
              <option value="">Automática — melhor voz disponível{tts.voices[0] ? ` (${bestVoice(tts.voices)?.name ?? ''})` : ''}</option>
              {tts.voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {isHighQuality(v) ? '★ ' : ''}
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
          {!tts.voices.some(isHighQuality) && (
            <div className="rounded-sm border border-cyan-300/20 bg-cyan-400/5 p-3 text-xs leading-relaxed text-cyan-100/70">
              <p className="hud-label mb-1">Voz mais natural, grátis</p>
              {isIOS() ? (
                <p>
                  No iPhone: <b>Ajustes › Acessibilidade › Conteúdo Falado › Vozes › Português (Brasil) › Luciana</b> e baixe a versão <b>Premium</b> (ou
                  “Aprimorada”). Depois feche e reabra a Luna — ela passa a usar essa voz automaticamente.
                </p>
              ) : (
                <p>
                  No Android: instale/atualize o app <b>Speech Services by Google</b>, depois em <b>Configurações › Acessibilidade › Saída de conversão de texto em voz</b>{' '}
                  escolha o mecanismo do Google, idioma <b>Português (Brasil)</b> e baixe uma voz feminina de alta qualidade.
                </p>
              )}
            </div>
          )}
          <label className="block text-sm">
            Velocidade da fala: {settings.voiceRate.toFixed(1)}x
            <input type="range" min={0.5} max={2} step={0.1} value={settings.voiceRate} onChange={(e) => void save({ voiceRate: Number(e.target.value) })} className="mt-2 w-full" />
          </label>
          <Button variant="ghost" onClick={() => tts.speak('Olá! Eu sou a Luna, sua assistente pessoal. Agora faz 26° e a chance de chuva é de 70%.', { voiceName: settings.voiceName, rate: settings.voiceRate })} disabled={!tts.supported}>
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
        <Row label="Palavra de ativação “Oi, Luna”" hint={
            wake.supported
              ? voiceMode === 'realtime'
                ? 'Durante a conversa em tempo real, a Luna só responde quando você diz “Oi, Luna” (ou logo após ela falar). A tela fica acesa; com o app fechado ela não escuta.'
                : 'Somente com o app aberto e em primeiro plano.'
              : wake.reason
          }>
          <Toggle label="Luna" disabled={!wake.supported} checked={settings.wakeWordEnabled && wake.supported} onChange={(v) => void save({ wakeWordEnabled: v })} />
        </Row>
        <WakeHeard />
      </Section>

      <Section title="Siri e Atalhos (iPhone)">
        <SiriSettings />
      </Section>

      <Section title="App Android (tablet)">
        <AndroidSettings />
      </Section>

      {isAdmin && (
        <Section title="Câmeras diretas">
          <DirectCameras />
        </Section>
      )}

      {isAdmin && (
        <Section title="Garagem (carro, portão e movimento)">
          <GarageSettings />
        </Section>
      )}

      <Section title="Gestos (comandos por mão)">
        <GestureSettings isAdmin={isAdmin} />
      </Section>

      <Section title="Localização">
        <Row label="Usar GPS deste aparelho" hint="Usado só no momento da consulta (clima). As coordenadas não são salvas.">
          <Toggle label="Usar GPS" checked={useGps} onChange={setUseGps} />
        </Row>
        <HomeLocation />
      </Section>

      <Section title="Este aparelho">
        <div className="px-4 py-3">
          <p className="mb-2 text-sm">Orientação da tela</p>
          <div className="grid grid-cols-3 gap-1 rounded-sm bg-white/5 p-1">
            {(
              [
                ['auto', 'Automática'],
                ['landscape', 'Deitada'],
                ['portrait', 'Em pé'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => void chooseOrientation(v)}
                className={`rounded-sm py-2 text-sm ${orientation === v ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50' : 'text-white/70'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/45">
            Atual: {currentOrientation()} · {isStandalone() ? 'app instalado' : 'navegador'}. Se “Automática” não girar, confira se a rotação automática do Android está ativada.
          </p>
          {orientMsg && <p className="mt-1 text-xs text-amber-200/80">{orientMsg}</p>}
        </div>
        <div className="px-4 py-3">
          <p className="mb-2 text-sm">Modo TV</p>
          <div className="grid grid-cols-3 gap-1 rounded-sm bg-white/5 p-1">
            {(
              [
                ['auto', 'Automático'],
                ['on', 'Ligado'],
                ['off', 'Desligado'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTvMode(v)}
                className={`rounded-sm py-2 text-sm ${tvMode === v ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50' : 'text-white/70'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/45">
            Tela feita para o controle remoto (Fire TV / Android TV). “Automático” liga sozinho quando a Luna é aberta numa TV. Para sair na TV, use o ícone de celular no canto superior.
          </p>
        </div>
        <Row label="Descanso de tela" hint="Com a Luna sem uso, mostra o relógio em tela cheia e alterna o que você escolher abaixo. Toque ou diga “Oi, Luna” para voltar. Vale só para este aparelho.">
          <Toggle label="Descanso de tela" checked={ambientMode} onChange={setAmbientMode} />
        </Row>
        {ambientMode && (
          <div className="px-4 py-3">
            <p className="mb-2 text-sm">Mostrar no descanso de tela</p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-5 rounded-sm bg-white/5 p-1">
              {(
                [
                  ['weather', 'Previsão do tempo'],
                  ['home', 'Aparelhos'],
                  ['house3d', 'Casa em 3D'],
                  ['cameras', 'Câmeras'],
                  ['photos', 'Fotos'],
                ] as [AmbientSlide, string][]
              ).map(([v, label]) => {
                const on = ambientSlides.includes(v);
                return (
                  <button key={v} aria-pressed={on} onClick={() => setAmbientSlides(on ? ambientSlides.filter((s) => s !== v) : [...ambientSlides, v])} className={`rounded-sm py-2 text-sm ${on ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50' : 'text-white/70'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-white/45">{ambientSlides.length ? 'Toque para ligar ou desligar cada um.' : 'Nada escolhido: fica só o relógio com a Luna.'}</p>
            <div className="-mx-4 mt-2 border-t border-white/10">
              <PhotoAlbumSettings onFirstPhoto={() => !ambientSlides.includes('photos') && setAmbientSlides([...ambientSlides, 'photos'])} />
            </div>
            <p className="mt-2 mb-2 text-sm">Começar depois de</p>
            <div className="grid grid-cols-4 gap-1 rounded-sm bg-white/5 p-1">
              {AMBIENT_DELAYS.map((s) => (
                <button key={s} onClick={() => setAmbientDelay(s)} className={`rounded-sm py-2 text-sm ${ambientDelay === s ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50' : 'text-white/70'}`}>
                  {s < 60 ? `${s} s` : `${s / 60} min`}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="border-t border-white/10">
          <PresenceSettings />
        </div>
        <Row
          label="Modo assistente fixo"
          hint="Para um celular/tablet dedicado à Luna: tela sempre acesa, volta sozinha para a tela inicial e retoma a escuta ao reabrir. Vale só para este aparelho."
        >
          <Toggle label="Modo assistente fixo" checked={kioskMode} onChange={setKioskMode} />
        </Row>
        {kioskMode && (
          <div className="font-hud space-y-2 px-4 py-3 text-sm text-cyan-100/70">
            <p className="hud-label">Abrir a Luna ao ligar/desbloquear o Android</p>
            <p>Apps web não podem se abrir sozinhos; use o app gratuito <b className="text-cyan-200">MacroDroid</b> (Play Store):</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Adicionar macro › <b>Gatilho</b>: Tela ligada (ou Dispositivo desbloqueado)</li>
              <li><b>Ação</b>: Aplicativos › Abrir aplicativo › escolha <b>Luna</b></li>
              <li>Salve e permita o MacroDroid rodar em segundo plano (bateria sem restrições).</li>
            </ol>
            <p className="text-cyan-100/50">Dica: deixe o aparelho no carregador e, em Configurações › Apps › Chrome › Bateria, escolha “Sem restrições”.</p>
          </div>
        )}
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
