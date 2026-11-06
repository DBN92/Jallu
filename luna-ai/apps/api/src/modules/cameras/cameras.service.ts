import type { CameraDto, PtzAction } from '@luna/shared';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { normalize, significantTokens } from '../../lib/text';
import type { HomeAssistantRestClient } from '../../integrations/home-assistant/rest-client';
import type { ActionLogService } from '../devices/action-log.service';
import { randomBytes } from 'node:crypto';
import type { DirectCamerasService } from './direct.service';

type Registry = () => Promise<Map<string, { platform: string; hidden: boolean }>>;
type WsCommand = <T>(payload: Record<string, unknown>) => Promise<T>;

const STREAM_FEATURE = 2; // CameraEntityFeature.STREAM
const ENTITY_RE = /^camera\.[a-z0-9_]+$/;

/**
 * Câmeras via Home Assistant (ex.: Yoosee pela integração ONVIF ou “câmera genérica” RTSP).
 * O token do HA e a senha das câmeras nunca chegam ao navegador: a DIA repassa imagens e vídeo.
 */
export class CamerasService {
  /** Sessões HLS emitidas para usuários autenticados (token do HA → expiração). */
  private hlsTokens = new Map<string, number>();
  /** Sessões HLS de câmeras diretas (token aleatório → câmera + expiração). */
  private directTokens = new Map<string, { entityId: string; exp: number }>();
  private direct: DirectCamerasService | null = null;

  setDirect(direct: DirectCamerasService) {
    this.direct = direct;
  }

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
    const direct = this.direct ? await this.direct.list() : [];
    // Uma câmera direta com o mesmo nome substitui a do Home Assistant (que não funcionava)
    const taken = new Set(direct.map((c) => normalize(c.name)));
    const ha = await this.haList().catch((err) => {
      if (direct.length) return [] as CameraDto[];
      throw err;
    });
    return [...direct, ...ha.filter((c) => !taken.has(normalize(c.name)))].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  private async haList(): Promise<CameraDto[]> {
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
    if (this.direct?.isDirect(entityId)) return this.direct.snapshot(entityId);
    const res = await this.ha.raw(`/api/camera_proxy/${entityId}`, { timeoutMs: 12_000 });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 160);
      throw new AppError(502, `O Home Assistant não conseguiu a imagem desta câmera (HTTP ${res.status}${detail ? `: ${detail}` : ''}). Confira se ela aparece no próprio Home Assistant.`, 'camera_error');
    }
    return res;
  }

  /** Quadro para análise de gestos: área recortada (câmeras diretas) ou a foto inteira (HA). */
  async gestureFrame(entityId: string): Promise<Response> {
    if (!ENTITY_RE.test(entityId)) throw badRequest('Câmera inválida.');
    if (this.direct?.isDirect(entityId)) return this.direct.gestureFrame(entityId);
    return this.snapshot(entityId);
  }

  /** Vídeo ao vivo em MJPEG (alternativa quando HLS não está disponível). */
  async mjpeg(entityId: string, signal: AbortSignal): Promise<Response> {
    if (!ENTITY_RE.test(entityId)) throw badRequest('Câmera inválida.');
    if (this.direct?.isDirect(entityId)) throw new AppError(409, 'Use o vídeo HLS para esta câmera.', 'no_mjpeg');
    const res = await this.ha.raw(`/api/camera_proxy_stream/${entityId}`, { timeoutMs: 6 * 60 * 60_000, signal });
    if (!res.ok) throw new AppError(502, 'Não consegui abrir o vídeo desta câmera.', 'camera_error');
    return res;
  }

  /** Abre uma sessão HLS no HA e devolve a URL repassada pela DIA. */
  async startStream(entityId: string): Promise<{ url: string }> {
    if (this.direct?.isDirect(entityId)) {
      await this.direct.startStream(entityId);
      const token = randomBytes(18).toString('base64url');
      this.directTokens.set(token, { entityId, exp: Date.now() + 30 * 60_000 });
      return { url: `/api/cameras/hls/${token}/index.m3u8` };
    }
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

  /** Repasse do HLS: só para sessões abertas pela DIA para um usuário autenticado. */
  async hls(token: string, path: string): Promise<Response> {
    const d = this.directTokens.get(token);
    if (d && this.direct) {
      if (d.exp < Date.now()) throw new AppError(404, 'Sessão de vídeo expirada.', 'hls_expired');
      d.exp = Date.now() + 30 * 60_000;
      return this.direct.hlsFile(d.entityId, path);
    }
    const exp = this.hlsTokens.get(token);
    if (!exp || exp < Date.now() || !/^[A-Za-z0-9_\-/.]+$/.test(path) || path.includes('..')) {
      throw new AppError(404, 'Sessão de vídeo expirada.', 'hls_expired');
    }
    this.hlsTokens.set(token, Date.now() + 30 * 60_000); // renova enquanto assiste
    const res = await this.ha.raw(`/api/hls/${token}/${path}`, { auth: false, timeoutMs: 20_000 });
    if (path.endsWith('.m3u8') && res.ok) {
      // Algumas versões do HA usam endereços absolutos (/api/hls/...): reescreve para /api/cameras/hls/...
      const text = (await res.text()).replace(/(^|[\s"'])\/api\/hls\//gm, '$1/api/cameras/hls/');
      return new Response(text, { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    }
    return res;
  }

  /** Movimento da câmera (ONVIF): girar, inclinar e zoom. */
  async ptz(entityId: string, action: PtzAction, userId: string) {
    if (this.direct?.isDirect(entityId)) {
      try {
        await this.direct.ptz(entityId, action);
        if (action !== 'stop') await this.logs.log({ userId, source: 'ui', tool: 'camera_ptz', target: entityId, args: { action }, success: true });
      } catch (err) {
        await this.logs.log({ userId, source: 'ui', tool: 'camera_ptz', target: entityId, args: { action }, success: false, detail: (err as Error).message });
        throw err;
      }
      return { ok: true };
    }
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

  /**
   * Diagnóstico passo a passo (para descobrir onde o vídeo falha): estado no HA,
   * foto via HA e início do vídeo HLS. Não expõe senhas nem tokens.
   */
  async diagnose(entityId: string) {
    if (this.direct?.isDirect(entityId)) return this.direct.diagnose(entityId);
    const steps: { step: string; ok: boolean; detail: string; ms?: number }[] = [];
    const cam = await this.get(entityId);
    steps.push({
      step: 'Câmera no Home Assistant',
      ok: cam.available,
      detail: `estado “${cam.state}”, integração ${cam.platform ?? 'desconhecida'}, vídeo contínuo ${cam.stream ? 'sim' : 'não'}, movimento ${cam.ptz ? 'sim' : 'não'}`,
    });
    let t = Date.now();
    try {
      const res = await this.ha.raw(`/api/camera_proxy/${entityId}`, { timeoutMs: 15_000 });
      const body = res.ok ? await res.arrayBuffer() : null;
      steps.push({
        step: 'Foto (Home Assistant → câmera)',
        ok: res.ok && (body?.byteLength ?? 0) > 500,
        detail: res.ok ? `${Math.round((body?.byteLength ?? 0) / 1024)} KB recebidos` : `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160) || 'sem detalhes'}`,
        ms: Date.now() - t,
      });
    } catch (err) {
      steps.push({ step: 'Foto (Home Assistant → câmera)', ok: false, detail: (err as Error).message, ms: Date.now() - t });
    }
    if (cam.stream) {
      t = Date.now();
      try {
        const { url } = await this.wsCommand<{ url: string }>({ type: 'camera/stream', entity_id: entityId, format: 'hls' });
        steps.push({ step: 'Início do vídeo (HLS)', ok: true, detail: 'o Home Assistant aceitou abrir o vídeo', ms: Date.now() - t });
        t = Date.now();
        const res = await this.ha.raw(url, { auth: false, timeoutMs: 25_000 });
        const text = await res.text().catch(() => '');
        steps.push({
          step: 'Lista de vídeo (playlist)',
          ok: res.ok && text.includes('#EXTM3U'),
          detail: res.ok
            ? text.split('\n').slice(0, 3).join(' ')
            : `HTTP ${res.status} — o Home Assistant não conseguiu ler o vídeo (RTSP) da câmera. Confira a URL/senha RTSP na integração e veja Configurações › Sistema › Logs do HA (procure por “stream”).`,
          ms: Date.now() - t,
        });
      } catch (err) {
        steps.push({ step: 'Início do vídeo (HLS)', ok: false, detail: (err as Error).message, ms: Date.now() - t });
      }
    }
    return { camera: cam.name, steps };
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
