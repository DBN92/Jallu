import type { CameraDto, PtzAction } from '@luna/shared';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { normalize, significantTokens } from '../../lib/text';
import type { HomeAssistantRestClient } from '../../integrations/home-assistant/rest-client';
import type { ActionLogService } from '../devices/action-log.service';

type Registry = () => Promise<Map<string, { platform: string; hidden: boolean }>>;
type WsCommand = <T>(payload: Record<string, unknown>) => Promise<T>;

const STREAM_FEATURE = 2; // CameraEntityFeature.STREAM
const ENTITY_RE = /^camera\.[a-z0-9_]+$/;

/**
 * Câmeras via Home Assistant (ex.: Yoosee pela integração ONVIF ou “câmera genérica” RTSP).
 * O token do HA e a senha das câmeras nunca chegam ao navegador: a Luna repassa imagens e vídeo.
 */
export class CamerasService {
  /** Sessões HLS emitidas para usuários autenticados (token do HA → expiração). */
  private hlsTokens = new Map<string, number>();

  constructor(
    private readonly ha: HomeAssistantRestClient,
    private readonly logs: ActionLogService,
    private registry: Registry,
    private wsCommand: WsCommand,
  ) {}

  /** Para testes: substitui o acesso ao WebSocket do HA. */
  setBackends(registry: Registry, wsCommand: WsCommand) {
    this.registry = registry;
    this.wsCommand = wsCommand;
  }

  async list(): Promise<CameraDto[]> {
    const [states, reg] = await Promise.all([this.ha.getStates(), this.registry().catch(() => new Map())]);
    return states
      .filter((s) => s.entity_id.startsWith('camera.') && !reg.get(s.entity_id)?.hidden)
      .map((s) => {
        const platform = reg.get(s.entity_id)?.platform ?? null;
        return {
          entityId: s.entity_id,
          name: (s.attributes.friendly_name as string | undefined) ?? s.entity_id,
          state: s.state,
          available: s.state !== 'unavailable',
          stream: ((Number(s.attributes.supported_features) || 0) & STREAM_FEATURE) !== 0,
          ptz: platform === 'onvif',
          platform,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async get(entityId: string): Promise<CameraDto> {
    if (!ENTITY_RE.test(entityId)) throw badRequest('Câmera inválida.');
    const cam = (await this.list()).find((c) => c.entityId === entityId);
    if (!cam) throw notFound('Câmera não encontrada no Home Assistant.');
    return cam;
  }

  /** Foto atual da câmera (JPEG). */
  async snapshot(entityId: string): Promise<Response> {
    if (!ENTITY_RE.test(entityId)) throw badRequest('Câmera inválida.');
    const res = await this.ha.raw(`/api/camera_proxy/${entityId}`, { timeoutMs: 12_000 });
    if (!res.ok) throw new AppError(502, 'A câmera não enviou imagem agora. Ela está ligada e na rede?', 'camera_error');
    return res;
  }

  /** Vídeo ao vivo em MJPEG (alternativa quando HLS não está disponível). */
  async mjpeg(entityId: string, signal: AbortSignal): Promise<Response> {
    if (!ENTITY_RE.test(entityId)) throw badRequest('Câmera inválida.');
    const res = await this.ha.raw(`/api/camera_proxy_stream/${entityId}`, { timeoutMs: 6 * 60 * 60_000, signal });
    if (!res.ok) throw new AppError(502, 'Não consegui abrir o vídeo desta câmera.', 'camera_error');
    return res;
  }

  /** Abre uma sessão HLS no HA e devolve a URL repassada pela Luna. */
  async startStream(entityId: string): Promise<{ url: string }> {
    const cam = await this.get(entityId);
    if (!cam.stream) throw new AppError(409, 'Esta câmera não oferece vídeo contínuo pelo Home Assistant; usando imagens.', 'no_stream');
    let result: { url: string };
    try {
      result = await this.wsCommand<{ url: string }>({ type: 'camera/stream', entity_id: entityId, format: 'hls' });
    } catch (err) {
      throw new AppError(502, `O Home Assistant não iniciou o vídeo: ${(err as Error).message}`, 'stream_error');
    }
    const m = result.url.match(/^\/api\/hls\/([A-Za-z0-9_-]+)\/(.+)$/);
    if (!m) throw new AppError(502, 'Resposta inesperada do Home Assistant para o vídeo.', 'stream_error');
    this.hlsTokens.set(m[1]!, Date.now() + 30 * 60_000);
    return { url: `/api/cameras/hls/${m[1]}/${m[2]}` };
  }

  /** Repasse do HLS: só para sessões abertas pela Luna para um usuário autenticado. */
  async hls(token: string, path: string): Promise<Response> {
    const exp = this.hlsTokens.get(token);
    if (!exp || exp < Date.now() || !/^[A-Za-z0-9_\-/.]+$/.test(path) || path.includes('..')) {
      throw new AppError(404, 'Sessão de vídeo expirada.', 'hls_expired');
    }
    this.hlsTokens.set(token, Date.now() + 30 * 60_000); // renova enquanto assiste
    return this.ha.raw(`/api/hls/${token}/${path}`, { auth: false, timeoutMs: 20_000 });
  }

  /** Movimento da câmera (ONVIF): girar, inclinar e zoom. */
  async ptz(entityId: string, action: PtzAction, userId: string) {
    const cam = await this.get(entityId);
    if (!cam.ptz) throw badRequest(`${cam.name} não tem controle de movimento pelo Home Assistant (é preciso a integração ONVIF).`);
    const data: Record<string, unknown> = { entity_id: entityId };
    if (action === 'stop') data.move_mode = 'Stop';
    else {
      data.move_mode = 'ContinuousMove';
      data.continuous_duration = 0.6;
      if (action === 'left' || action === 'right') data.pan = action.toUpperCase();
      if (action === 'up' || action === 'down') data.tilt = action.toUpperCase();
      if (action === 'zoom_in' || action === 'zoom_out') data.zoom = action === 'zoom_in' ? 'ZOOM_IN' : 'ZOOM_OUT';
    }
    try {
      await this.ha.callService('onvif', 'ptz', data);
      await this.logs.log({ userId, source: 'ui', tool: 'camera_ptz', target: entityId, args: { action }, success: true });
    } catch (err) {
      await this.logs.log({ userId, source: 'ui', tool: 'camera_ptz', target: entityId, args: { action }, success: false, detail: (err as Error).message });
      throw err;
    }
    return { ok: true };
  }

  /** Encontra câmeras pelo nome falado (“câmera da garagem”). */
  async findByName(query: string): Promise<CameraDto[]> {
    const cams = await this.list();
    const q = significantTokens(query.replace(/c[aâ]meras?/gi, ''));
    if (!q.length) return cams;
    const scored = cams
      .map((c) => {
        const n = significantTokens(c.name.replace(/c[aâ]meras?/gi, ''));
        const hits = q.filter((t) => n.includes(t) || normalize(c.entityId).includes(t)).length;
        return { c, score: hits / q.length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) return [];
    return scored.filter((x) => x.score === scored[0]!.score).map((x) => x.c);
  }
}
