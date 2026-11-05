import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { CameraDto, PtzAction } from '@luna/shared';
import { ONVIF_PORTS, OnvifClient, OnvifError } from '../../integrations/onvif/onvif-client';
import type { Db } from '../../lib/db';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { PROJECT_ROOT } from '../../config/env';

export const DIRECT_PREFIX = 'camera.luna_';
const IDLE_MS = 45_000;
const SEGMENT_RE = /^(index\.m3u8|seg\d{1,6}\.ts)$/;

export interface DirectCameraInput {
  name: string;
  url: string;
  username?: string | null;
  password?: string | null;
  transport: 'udp' | 'tcp';
}

/** Dados mostrados ao administrador (sem a senha). */
export interface DirectCameraInfo {
  id: string;
  entityId: string;
  name: string;
  url: string;
  username: string | null;
  hasPassword: boolean;
  transport: 'udp' | 'tcp';
  /** Porta ONVIF ativa (movimento) ou null */
  onvifPort: number | null;
}

type Row = { id: string; name: string; url: string; username: string | null; password: string | null; transport: string; onvifPort: number | null };

interface Session {
  proc: ChildProcess;
  dir: string;
  lastUsed: number;
  stderr: string[];
  exited: boolean;
}

/** Monta a URL com usuário/senha codificados (a senha pode ter *, @, # …). */
export function withCredentials(url: string, username?: string | null, password?: string | null) {
  if (!username) return url;
  const u = new URL(url);
  u.username = encodeURIComponent(username);
  u.password = password ? encodeURIComponent(password) : '';
  return u.toString();
}

/** Valida o endereço: só rtsp/rtsps, sem credenciais embutidas (vão nos campos próprios). */
export function parseRtspUrl(raw: string): { url: string; username?: string; password?: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw badRequest('Endereço inválido. Exemplo: rtsp://192.168.15.112:554/onvif1');
  }
  if (u.protocol !== 'rtsp:' && u.protocol !== 'rtsps:') throw badRequest('O endereço deve começar com rtsp://');
  if (!u.hostname) throw badRequest('Falta o IP da câmera no endereço.');
  const username = u.username ? decodeURIComponent(u.username) : undefined;
  const password = u.password ? decodeURIComponent(u.password) : undefined;
  u.username = '';
  u.password = '';
  return { url: u.toString(), username, password };
}

/** Converte argumentos de entrada (substituível nos testes por uma fonte sintética). */
export type InputArgs = (url: string, transport: 'udp' | 'tcp') => string[];

const rtspInput: InputArgs = (url, transport) => [
  '-rtsp_transport',
  transport,
  '-timeout',
  '10000000', // 10 s sem dados = erro (microssegundos)
  '-use_wallclock_as_timestamps',
  '1',
  '-fflags',
  '+genpts+discardcorrupt',
  '-protocol_whitelist',
  'rtsp,rtsps,rtp,srtp,udp,tcp,tls',
  '-i',
  url,
];

/**
 * Câmeras lidas pela própria Luna, sem o Home Assistant (ex.: Yoosee H.265 por UDP, que o HA não processa).
 * Um único ffmpeg por câmera, ligado só enquanto alguém assiste: converte para H.264 (HLS, toca em
 * iPhone/Android/Fire TV) e grava uma foto por segundo. Desliga sozinho após 45 s sem uso.
 */
export class DirectCamerasService {
  private sessions = new Map<string, Session>();
  private starting = new Map<string, Promise<Session>>();
  private sweeper: NodeJS.Timeout;

  constructor(
    private readonly db: Db,
    private readonly ffmpegSetting: string,
    private readonly inputArgs: InputArgs = rtspInput,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 10_000);
    this.sweeper.unref();
  }

  /** Caminho do ffmpeg: FFMPEG_PATH, runtime/ffmpeg/ffmpeg (instalado pela Luna) ou o do sistema. */
  ffmpegPath(): string | null {
    if (this.ffmpegSetting) return existsSync(this.ffmpegSetting) ? this.ffmpegSetting : null;
    const local = resolve(PROJECT_ROOT, 'runtime', 'ffmpeg', 'ffmpeg');
    if (existsSync(local)) return local;
    for (const dir of (process.env.PATH ?? '').split(':')) if (dir && existsSync(join(dir, 'ffmpeg'))) return join(dir, 'ffmpeg');
    return null;
  }

  isDirect(entityId: string) {
    return entityId.startsWith(DIRECT_PREFIX);
  }

  private async row(entityId: string): Promise<Row> {
    const id = entityId.slice(DIRECT_PREFIX.length);
    const r = /^[a-z0-9]+$/.test(id) ? await this.db.directCamera.findUnique({ where: { id } }) : null;
    if (!r) throw notFound('Câmera não encontrada.');
    return r;
  }

  private info(r: Row): DirectCameraInfo {
    return { id: r.id, entityId: DIRECT_PREFIX + r.id, name: r.name, url: r.url, username: r.username, hasPassword: !!r.password, transport: r.transport === 'tcp' ? 'tcp' : 'udp', onvifPort: r.onvifPort };
  }

  async listInfo(): Promise<DirectCameraInfo[]> {
    return (await this.db.directCamera.findMany({ orderBy: { name: 'asc' } })).map((r) => this.info(r));
  }

  async list(): Promise<CameraDto[]> {
    const ff = !!this.ffmpegPath();
    return (await this.db.directCamera.findMany({ orderBy: { name: 'asc' } })).map((r) => ({
      entityId: DIRECT_PREFIX + r.id,
      name: r.name,
      state: this.sessions.has(DIRECT_PREFIX + r.id) ? 'streaming' : 'idle',
      available: ff,
      stream: ff,
      ptz: !!r.onvifPort,
      platform: 'luna',
    }));
  }

  async create(input: DirectCameraInput): Promise<DirectCameraInfo> {
    const p = parseRtspUrl(input.url);
    const r = await this.db.directCamera.create({
      data: { name: input.name.trim(), url: p.url, username: input.username || p.username || null, password: input.password || p.password || null, transport: input.transport },
    });
    return this.info(r);
  }

  /** Senha vazia/ausente = mantém a atual. */
  async update(id: string, input: Partial<DirectCameraInput>): Promise<DirectCameraInfo> {
    const cur = await this.row(DIRECT_PREFIX + id);
    const data: Partial<Row> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.url !== undefined) {
      const p = parseRtspUrl(input.url);
      data.url = p.url;
      if (p.username) data.username = p.username;
      if (p.password) data.password = p.password;
    }
    if (input.username !== undefined) data.username = input.username || null;
    if (input.password) data.password = input.password;
    if (input.transport) data.transport = input.transport;
    const r = await this.db.directCamera.update({ where: { id: cur.id }, data });
    this.onvif.delete(DIRECT_PREFIX + id);
    await this.stop(DIRECT_PREFIX + id); // reabre com a nova configuração
    return this.info(r);
  }

  async remove(id: string) {
    await this.row(DIRECT_PREFIX + id);
    await this.stop(DIRECT_PREFIX + id);
    await this.db.directCamera.delete({ where: { id } });
    return { ok: true };
  }

  /** Testa a conexão: pega um quadro em até 20 s e devolve a resolução (ou o erro do ffmpeg). */
  async test(input: { url: string; username?: string | null; password?: string | null; transport: 'udp' | 'tcp'; id?: string }) {
    const ff = this.ffmpegPath();
    if (!ff) return { ok: false, detail: 'ffmpeg não está instalado no servidor. Rode: sudo bash scripts/ffmpeg-setup.sh', ms: 0 };
    const p = parseRtspUrl(input.url);
    let password = input.password || p.password || null;
    if (!password && input.id) password = (await this.row(DIRECT_PREFIX + input.id)).password;
    const url = withCredentials(p.url, input.username || p.username, password);
    const started = Date.now();
    return new Promise<{ ok: boolean; detail: string; ms: number }>((done) => {
      const proc = spawn(ff, ['-hide_banner', '-nostdin', '-loglevel', 'info', ...this.inputArgs(url, input.transport), '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      proc.stderr!.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-6000)));
      const timer = setTimeout(() => proc.kill('SIGKILL'), 20_000);
      proc.on('close', (code) => {
        clearTimeout(timer);
        const ms = Date.now() - started;
        const video = err.match(/Video: (\w+)[^,]*,[^,]*, (\d{2,5}x\d{2,5})/);
        if (code === 0 && video) return done({ ok: true, detail: `vídeo ${video[1]!.toUpperCase()} ${video[2]}`, ms });
        done({ ok: false, detail: explain(err, code), ms });
      });
    });
  }

  /* ---------------- movimento (ONVIF direto) ---------------- */

  private onvif = new Map<string, OnvifClient>();
  private autoStop = new Map<string, NodeJS.Timeout>();

  private client(r: Row, port: number) {
    const host = new URL(r.url).hostname.replace(/^\[|\]$/g, '');
    return new OnvifClient({ host, port, username: r.username, password: r.password });
  }

  /**
   * Procura a porta ONVIF (5000 nas Yoosee) e confirma que o movimento responde.
   * Ao achar, salva — a câmera passa a mostrar os controles de girar/inclinar.
   */
  async detectOnvif(id: string, preferred?: number) {
    const r = await this.row(DIRECT_PREFIX + id);
    const ports = [...new Set([preferred, r.onvifPort, ...ONVIF_PORTS].filter((p): p is number => !!p))];
    const tried: string[] = [];
    for (const port of ports) {
      try {
        await this.client(r, port).resolve();
        await this.db.directCamera.update({ where: { id }, data: { onvifPort: port } });
        this.onvif.delete(DIRECT_PREFIX + id);
        return { ok: true, port, detail: `movimento ativado (ONVIF na porta ${port})` };
      } catch (err) {
        const msg = err instanceof OnvifError ? err.message : (err as Error).message;
        // Porta certa mas recusou login/PTZ: não adianta tentar as outras
        if (/senha|PTZ|perfil/.test(msg)) return { ok: false, port, detail: `porta ${port}: ${msg}` };
        tried.push(`${port}: ${msg}`);
      }
    }
    return { ok: false, port: null, detail: `ONVIF não encontrado na câmera (portas testadas — ${tried.join(' · ')}). Ative “ONVIF” ou “NVR” no app da câmera e tente de novo.` };
  }

  async disableOnvif(id: string) {
    await this.row(DIRECT_PREFIX + id);
    await this.db.directCamera.update({ where: { id }, data: { onvifPort: null } });
    this.onvif.delete(DIRECT_PREFIX + id);
    return { ok: true };
  }

  async ptz(entityId: string, action: PtzAction) {
    const r = await this.row(entityId);
    if (!r.onvifPort) throw badRequest(`${r.name} ainda não tem o movimento ativado (Ajustes › Câmeras diretas › Ativar movimento).`);
    let c = this.onvif.get(entityId);
    if (!c) {
      c = this.client(r, r.onvifPort);
      this.onvif.set(entityId, c);
    }
    clearTimeout(this.autoStop.get(entityId));
    try {
      await c.move(action);
    } catch (err) {
      this.onvif.delete(entityId); // redescobre na próxima (a câmera pode ter reiniciado)
      throw new AppError(502, `Não consegui mover ${r.name}: ${(err as Error).message}`, 'ptz_error');
    }
    // Segurança: se o “soltar” se perder (rede/celular), para sozinho
    if (action !== 'stop') this.autoStop.set(entityId, setTimeout(() => void c!.move('stop').catch(() => undefined), 2500).unref());
    return { ok: true };
  }

  /* ---------------- sessões de vídeo ---------------- */

  private async ensure(entityId: string): Promise<Session> {
    const cur = this.sessions.get(entityId);
    if (cur && !cur.exited) {
      cur.lastUsed = Date.now();
      return cur;
    }
    const pending = this.starting.get(entityId);
    if (pending) return pending;
    const p = this.start(entityId).finally(() => this.starting.delete(entityId));
    this.starting.set(entityId, p);
    return p;
  }

  private async start(entityId: string): Promise<Session> {
    const ff = this.ffmpegPath();
    if (!ff) throw new AppError(503, 'ffmpeg não está instalado no servidor. Rode: sudo bash scripts/ffmpeg-setup.sh', 'no_ffmpeg');
    const r = await this.row(entityId);
    const dir = await mkdtemp(join(tmpdir(), 'luna-cam-'));
    const url = withCredentials(r.url, r.username, r.password);
    const scale = "scale=w='min(960,iw)':h=-2";
    const args = [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      ...this.inputArgs(url, r.transport === 'tcp' ? 'tcp' : 'udp'),
      // Vídeo H.264 leve (toca em tudo); 10 quadros/s, largura até 960 px
      '-map', '0:v:0', '-an',
      '-vf', `fps=10,${scale}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
      '-g', '20', '-keyint_min', '20', '-sc_threshold', '0', '-b:v', '1200k', '-maxrate', '1600k', '-bufsize', '3200k',
      '-f', 'hls', '-hls_time', '2', '-hls_list_size', '5', '-hls_flags', 'delete_segments+omit_endlist+independent_segments',
      '-hls_segment_filename', join(dir, 'seg%05d.ts'), join(dir, 'index.m3u8'),
      // Foto atual, 1 por segundo
      '-map', '0:v:0', '-vf', `fps=1,${scale}`, '-q:v', '6', '-f', 'image2', '-update', '1', join(dir, 'latest.jpg'),
    ];
    const proc = spawn(ff, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const s: Session = { proc, dir, lastUsed: Date.now(), stderr: [], exited: false };
    proc.stderr!.on('data', (d: Buffer) => {
      s.stderr.push(...d.toString().split('\n').filter(Boolean));
      if (s.stderr.length > 30) s.stderr.splice(0, s.stderr.length - 30);
    });
    proc.on('close', () => {
      s.exited = true;
      if (this.sessions.get(entityId) === s) this.sessions.delete(entityId);
      void rm(dir, { recursive: true, force: true });
    });
    proc.on('error', (e) => s.stderr.push(e.message));
    this.sessions.set(entityId, s);
    return s;
  }

  /** Espera um arquivo da sessão aparecer (ou o ffmpeg falhar). */
  private async waitFile(entityId: string, s: Session, name: string, ms: number): Promise<string> {
    const file = join(s.dir, name);
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (s.exited) throw new AppError(502, `A Luna não conseguiu ler a câmera: ${explain(s.stderr.join('\n'), 1)}`, 'camera_error');
      if (existsSync(file)) {
        const st = await stat(file).catch(() => null);
        if (st && st.size > 0) return file;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    // Sem nada em tempo hábil: encerra para tentar do zero na próxima vez
    await this.stop(entityId);
    throw new AppError(504, 'A câmera não enviou imagem a tempo. Confira o endereço, a senha e o protocolo (UDP/TCP) em Ajustes › Câmeras diretas.', 'camera_timeout');
  }

  async snapshot(entityId: string): Promise<Response> {
    const s = await this.ensure(entityId);
    const file = await this.waitFile(entityId, s, 'latest.jpg', 25_000);
    const body = await readFile(file);
    return new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }

  async startStream(entityId: string): Promise<{ url: string; token: string }> {
    const s = await this.ensure(entityId);
    await this.waitFile(entityId, s, 'index.m3u8', 30_000);
    return { url: 'index.m3u8', token: entityId };
  }

  /** Arquivo do HLS da sessão (playlist ou segmento). */
  async hlsFile(entityId: string, path: string): Promise<Response> {
    const s = this.sessions.get(entityId);
    if (!s || s.exited || !SEGMENT_RE.test(path)) throw new AppError(404, 'Sessão de vídeo expirada.', 'hls_expired');
    s.lastUsed = Date.now();
    const body = await readFile(join(s.dir, path)).catch(() => null);
    if (!body) throw new AppError(404, 'Trecho de vídeo indisponível.', 'hls_missing');
    return new Response(body, { status: 200, headers: { 'content-type': path.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' } });
  }

  async diagnose(entityId: string) {
    const r = await this.row(entityId);
    const steps: { step: string; ok: boolean; detail: string; ms?: number }[] = [];
    const ff = this.ffmpegPath();
    steps.push({ step: 'Conversor de vídeo (ffmpeg)', ok: !!ff, detail: ff ? 'instalado' : 'não instalado — rode: sudo bash scripts/ffmpeg-setup.sh' });
    if (!ff) return { camera: r.name, steps };
    const t = await this.test({ url: r.url, username: r.username, password: r.password, transport: r.transport === 'tcp' ? 'tcp' : 'udp' });
    steps.push({ step: `Conexão direta com a câmera (${r.transport.toUpperCase()})`, ok: t.ok, detail: t.detail, ms: t.ms });
    return { camera: r.name, steps };
  }

  async stop(entityId: string) {
    const s = this.sessions.get(entityId);
    if (!s) return;
    this.sessions.delete(entityId);
    s.proc.kill('SIGTERM');
    setTimeout(() => !s.exited && s.proc.kill('SIGKILL'), 3000).unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [id, s] of this.sessions) if (now - s.lastUsed > IDLE_MS) void this.stop(id);
  }

  /** Encerra tudo (desligamento do servidor). */
  async close() {
    clearInterval(this.sweeper);
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
  }
}

/** Traduz os erros mais comuns do ffmpeg para o usuário (sem expor a senha). */
function explain(stderr: string, code: number | null): string {
  const e = stderr.replace(/rtsps?:\/\/[^\s'"]+/g, 'rtsp://…');
  if (/401|Unauthorized/i.test(e)) return 'usuário ou senha da câmera incorretos (401).';
  if (/Nonmatching transport|Invalid data found/i.test(e)) return 'a câmera não aceitou este protocolo. Troque UDP ↔ TCP.';
  if (/Connection refused/i.test(e)) return 'a câmera recusou a conexão (porta errada ou muitas conexões abertas; reinicie a câmera).';
  if (/timed out|Operation timed out/i.test(e) || code === null) return 'a câmera não respondeu a tempo (IP, porta ou protocolo).';
  if (/404|Not Found/i.test(e)) return 'caminho não encontrado na câmera (ex.: /onvif1 ou /onvif2).';
  if (/No route to host|Network is unreachable/i.test(e)) return 'a câmera não está acessível na rede (confira o IP).';
  const last = e.split('\n').filter((l) => l.trim()).slice(-2).join(' · ');
  return last ? last.slice(0, 220) : `ffmpeg terminou com código ${code}`;
}
