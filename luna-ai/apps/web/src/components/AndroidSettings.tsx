import { useEffect, useState } from 'react';
import { api, errorMessage } from '../services/api';
import { nativeApp, nativeStatus, type NativeStatus } from '../lib/native';
import { Banner, Button, Toggle } from './ui';

interface ApkInfo {
  versionCode: number;
  versionName: string;
  size: number;
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/10 py-3 first:border-t-0">
      <div className="min-w-0">
        <p>{title}</p>
        {hint && <p className="mt-0.5 text-xs text-white/50">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Configurações › App Android: baixar o app (fora dele) ou ajustar o chamado “Oi, Luna” do tablet (dentro dele). */
export function AndroidSettings() {
  const bridge = nativeApp();
  const [apk, setApk] = useState<ApkInfo | null>(null);
  const [st, setSt] = useState<NativeStatus | null>(nativeStatus());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ApkInfo>('/api/android/version').then(setApk).catch(() => setApk(null));
  }, []);
  useEffect(() => {
    if (!bridge) return;
    const t = setInterval(() => setSt(nativeStatus()), 1500);
    return () => clearInterval(t);
  }, [bridge]);

  // ---------- Fora do app: baixar ----------
  if (!bridge) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-white/60">
          Para um <b>tablet Android</b> fixo (na tomada): o app escuta o <b>chamado “Oi, Luna” com a tela desligada</b>, abre sozinho quando o tablet liga e mantém a tela acesa. O áudio é analisado no
          próprio tablet — nada é enviado até você chamar a Luna.
        </p>
        {apk ? (
          <>
            <a href="/api/android/apk" className="inline-block">
              <Button type="button">Baixar o app Luna ({(apk.size / 1024 / 1024).toFixed(1)} MB · versão {apk.versionName})</Button>
            </a>
            <ol className="list-decimal space-y-1 pl-5 text-white/60">
              <li>Abra esta página <b>no próprio tablet</b> e toque em “Baixar”.</li>
              <li>Abra o arquivo baixado. Se o Android pedir, permita “instalar apps desta fonte”.</li>
              <li>No app, informe o endereço da Luna (o mesmo do navegador) e entre com seu usuário.</li>
              <li>Volte aqui em Configurações › App Android e ligue o chamado “Oi, Luna”.</li>
            </ol>
          </>
        ) : (
          <p className="text-white/40">O app Android ainda não está disponível neste servidor. Atualize a Luna.</p>
        )}
      </div>
    );
  }

  // ---------- Dentro do app ----------
  const enableWake = async (on: boolean) => {
    setError(null);
    if (on && !st?.token) {
      setBusy(true);
      try {
        // Token próprio do tablet (só manda comandos), criado e guardado só no app
        const r = await api<{ token: string }>('/api/siri/tokens', { body: { name: 'Tablet Android' } });
        bridge.setToken(r.token);
      } catch (e) {
        setError(errorMessage(e));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    bridge.setWake(on);
    setTimeout(() => setSt(nativeStatus()), 300);
  };
  const outdated = apk && st && apk.versionCode > st.versionCode;
  const listening = st?.listening ?? '';

  return (
    <div className="text-sm">
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      {outdated && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-cyan-400/10 px-3 py-2">
          <span>Nova versão do app: {apk!.versionName}</span>
          <Button type="button" onClick={() => bridge.update()}>
            Atualizar
          </Button>
        </div>
      )}
      <Row
        title="Chamado “Oi, Luna” com a tela desligada"
        hint={
          !st?.wake
            ? 'Desligado'
            : !st.modelReady
              ? listening.startsWith('baixando')
                ? `Baixando o modelo de voz (só na primeira vez)… ${listening.replace('baixando ', '')}`
                : 'Preparando o modelo de voz (precisa de internet só na primeira vez)…'
              : listening.startsWith('erro')
                ? listening
                : listening === 'ouvindo'
                  ? 'Ouvindo — diga “Oi, Luna”'
                  : listening || 'Ligando…'
        }
      >
        <Toggle label="Luna no tablet" checked={!!st?.wake} disabled={busy} onChange={(v) => void enableWake(v)} />
      </Row>
      {st?.wake && !st.mic && (
        <Row title="Microfone sem permissão" hint="Permita o microfone para o app da Luna.">
          <Button type="button" variant="ghost" onClick={() => bridge.openAppSettings()}>
            Permitir
          </Button>
        </Row>
      )}
      <Row title="Sensibilidade" hint="Alta: ouve de mais longe (pode acordar por engano). Baixa: só com a frase bem clara.">
        <div className="flex gap-1">
          {(['baixa', 'normal', 'alta'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                bridge.setSensitivity(s);
                setTimeout(() => setSt(nativeStatus()), 200);
              }}
              className={`rounded-full px-3 py-1.5 text-xs capitalize ${st?.sensitivity === s ? 'bg-cyan-400/25 text-cyan-50' : 'bg-white/10 text-white/70'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </Row>
      <Row title="Abrir sozinha quando o tablet ligar" hint={st?.autostart && !st.overlay ? 'Falta permitir “Aparecer sobre outros apps”.' : undefined}>
        <div className="flex items-center gap-2">
          {st?.autostart && !st.overlay && (
            <Button type="button" variant="ghost" onClick={() => bridge.openOverlay()}>
              Permitir
            </Button>
          )}
          <Toggle label="Abrir ao ligar" checked={!!st?.autostart} onChange={(v) => { bridge.setAutostart(v); setTimeout(() => setSt(nativeStatus()), 200); }} />
        </div>
      </Row>
      <Row title="Funcionar sempre em segundo plano" hint={st?.battery ? 'Liberado ✓' : 'A Samsung pode fechar a escuta para economizar bateria.'}>
        {!st?.battery && (
          <Button type="button" variant="ghost" onClick={() => bridge.openBattery()}>
            Liberar
          </Button>
        )}
      </Row>
      <Row title="Tela sempre acesa (com a Luna aberta)">
        <Toggle label="Tela sempre acesa" checked={!!st?.keepOn} onChange={(v) => { bridge.setKeepOn(v); setTimeout(() => setSt(nativeStatus()), 200); }} />
      </Row>
      {bridge.setFullscreen && (
        <Row title="Tela cheia" hint="Só a Luna, sem a barra de status nem os botões do Android. Deslize da borda para vê-los por um instante.">
          <Toggle label="Tela cheia" checked={st?.fullscreen !== false} onChange={(v) => { bridge.setFullscreen?.(v); setTimeout(() => setSt(nativeStatus()), 200); }} />
        </Row>
      )}
      <p className="mt-3 text-xs text-white/50">
        Dica: na cortina de atalhos do Android (deslize de cima duas vezes → editar), adicione o botão <b>“Falar com a Luna”</b>. App versão {st?.version ?? bridge.version()}.{' '}
        <button className="underline" onClick={() => bridge.changeServer()}>
          Trocar endereço da Luna
        </button>
      </p>
    </div>
  );
}
