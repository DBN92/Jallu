import { useEffect } from 'react';
import { Cctv, Move3d, RefreshCw } from 'lucide-react';
import { Page } from '../components/Layout';
import { CameraThumb } from '../components/CameraPlayer';
import { Banner, Card, PageHeader, Spinner } from '../components/ui';
import { useCameras } from '../stores/cameras';

export default function CamerasPage() {
  const { cameras, error, load, open } = useCameras();
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page>
      <PageHeader
        title="Câmeras"
        subtitle={cameras ? `${cameras.length} câmera(s) pelo Home Assistant` : 'Câmeras de segurança'}
        action={
          <button onClick={() => void load()} className="rounded-sm border border-cyan-300/25 bg-ink-950/75 p-2 text-cyan-200/80" aria-label="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />
      {error && <Banner>{error}</Banner>}
      {!cameras ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : cameras.length === 0 ? (
        <Card className="space-y-2 text-sm text-cyan-100/70">
          <p className="flex items-center gap-2 text-cyan-50"><Cctv className="h-5 w-5 text-cyan-300" /> Nenhuma câmera no Home Assistant ainda.</p>
          <p>Para câmeras Yoosee: no Home Assistant, vá em <b>Configurações › Dispositivos e serviços › Adicionar integração › ONVIF</b> (IP da câmera, porta 5000, usuário <b>admin</b> e a senha da câmera). Depois elas aparecem aqui automaticamente.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cameras.map((c) => (
            <button key={c.entityId} onClick={() => open([c.entityId, ...cameras.filter((x) => x.entityId !== c.entityId).map((x) => x.entityId)])} className="hud-panel p-1.5 text-left">
              {/* Vídeo com os cantos acompanhando o cartão (senão as quinas saem pela borda arredondada) */}
              <div className="overflow-hidden" style={{ borderRadius: 'max(0px, calc(var(--card-r, 0px) - 6px))' }}>
                <CameraThumb camera={c} className="aspect-video w-full" everyMs={6000} />
              </div>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="font-hud truncate font-semibold text-cyan-50">{c.name}</span>
                <span className="hud-label flex items-center gap-1 text-[9px]">
                  {c.ptz && <Move3d className="h-3.5 w-3.5" />}
                  {!c.available ? 'offline' : c.stream ? 'vídeo ao vivo' : 'imagens'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}
