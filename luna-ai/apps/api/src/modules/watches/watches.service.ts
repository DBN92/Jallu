import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CameraEventDto, ServerEvent, WatchDto } from '@luna/shared';
import type { Db } from '../../lib/db';
import { badRequest, notFound } from '../../lib/errors';
import type { DevicesService } from '../devices/devices.service';
import { change, classify, feature, fromB64, thumbnail, toB64, type Zone } from './vision';

/** Pega uma foto atual (JPEG) da câmera. */
export type FrameProvider = (cameraId: string) => Promise<Buffer>;

const PRESETS: Record<string, { name: string; labelA: string; labelB: string; alertMinutes?: number }> = {
  car: { name: 'Carro', labelA: 'na garagem', labelB: 'fora' },
  gate: { name: 'Portão', labelA: 'fechado', labelB: 'aberto', alertMinutes: 10 },
  motion: { name: 'Movimento à noite', labelA: 'calmo', labelB: 'movimento' },
  custom: { name: 'Vigia', labelA: 'normal', labelB: 'diferente' },
};
const CONFIRM = 2; // leituras seguidas iguais antes de mudar de estado (evita piscar)
const MIN_CONFIDENCE = 0.12;
const MOTION_THRESHOLD = 0.07;
const KEEP_DAYS = 7;

type WatchRow = Awaited<ReturnType<Db['visualWatch']['findMany']>>[number];

const parseZone = (z: string | null): Zone | null => {
  try {
    const v = z ? (JSON.parse(z) as Zone) : null;
    return v && [v.x, v.y, v.w, v.h].every((n) => typeof n === 'number' && n >= 0 && n <= 1) && v.w > 0.02 && v.h > 0.02 ? v : null;
  } catch {
    return null;
  }
};

/**
 * Vigias visuais (garagem): de tempos em tempos olha cada câmera vigiada, compara a área escolhida
 * com as fotos de referência (carro dentro/fora, portão aberto/fechado) e, ao mudar de estado,
 * registra um evento com foto, avisa as telas e aciona a luz configurada à noite.
 * Tudo local: só o ffmpeg do servidor processa as imagens.
 */
export class WatchesService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pending = new Map<string, { state: string; count: number }>();
  private lastVec = new Map<string, Uint8Array>();
  private lastAlert = new Map<string, number>();
  private lightTimers = new Map<string, NodeJS.Timeout>();
  private lastCleanup = 0;

  constructor(
    private readonly db: Db,
    private readonly ffmpeg: () => string | null,
    private readonly frame: FrameProvider,
    private readonly devices: DevicesService,
    private readonly emit: (e: ServerEvent) => void,
    private readonly dataDir: string,
    private readonly timezone: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(intervalMs = 15_000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.lightTimers.values()) clearTimeout(t);
  }

  private ff() {
    const ff = this.ffmpeg();
    if (!ff) throw badRequest('O conversor de vídeo (ffmpeg) não está instalado no servidor.');
    return ff;
  }

  private async toDto(w: WatchRow & { refs?: { id: string; state: string; thumb: string; createdAt: Date }[] }): Promise<WatchDto> {
    const refs = w.refs ?? (await this.db.visualRef.findMany({ where: { watchId: w.id }, select: { id: true, state: true, thumb: true, createdAt: true } }));
    return {
      id: w.id,
      name: w.name,
      kind: w.kind as WatchDto['kind'],
      cameraId: w.cameraId,
      zone: parseZone(w.zone),
      labelA: w.labelA,
      labelB: w.labelB,
      enabled: w.enabled,
      state: (w.state as 'a' | 'b' | null) ?? null,
      stateLabel: w.state === 'a' ? w.labelA : w.state === 'b' ? w.labelB : null,
      stateSince: w.stateSince?.toISOString() ?? null,
      confidence: w.confidence,
      lightEntity: w.lightEntity,
      lightMinutes: w.lightMinutes,
      alertMinutes: w.alertMinutes,
      refs: refs.map((r) => ({ id: r.id, state: r.state as 'a' | 'b', thumb: `data:image/jpeg;base64,${r.thumb}`, createdAt: r.createdAt.toISOString() })),
    };
  }

  async list(): Promise<WatchDto[]> {
    const rows = await this.db.visualWatch.findMany({ orderBy: { createdAt: 'asc' }, include: { refs: { select: { id: true, state: true, thumb: true, createdAt: true }, orderBy: { createdAt: 'asc' } } } });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async create(input: { kind: string; cameraId: string; name?: string; zone?: Zone | null }) {
    const preset = PRESETS[input.kind];
    if (!preset) throw badRequest('Tipo de vigia inválido.');
    const row = await this.db.visualWatch.create({
      data: {
        kind: input.kind,
        cameraId: input.cameraId,
        name: input.name?.trim() || preset.name,
        labelA: preset.labelA,
        labelB: preset.labelB,
        alertMinutes: preset.alertMinutes ?? null,
        zone: input.zone ? JSON.stringify(input.zone) : null,
      },
    });
    return this.toDto(row);
  }

  async update(id: string, patch: Partial<{ name: string; zone: Zone | null; enabled: boolean; lightEntity: string | null; lightMinutes: number; alertMinutes: number | null; labelA: string; labelB: string }>) {
    const cur = await this.db.visualWatch.findUnique({ where: { id } });
    if (!cur) throw notFound('Vigia não encontrado.');
    if (patch.lightEntity) {
      const d = await this.devices.get(patch.lightEntity).catch(() => null);
      if (!d || !d.controllable) throw badRequest('Luz não encontrada no Home Assistant.');
    }
    const data: Record<string, unknown> = { ...patch };
    if ('zone' in patch) {
      data.zone = patch.zone ? JSON.stringify(patch.zone) : null;
      // a área mudou: as fotos de referência antigas não valem mais
      if (JSON.stringify(parseZone(cur.zone)) !== JSON.stringify(patch.zone ?? null)) {
        await this.db.visualRef.deleteMany({ where: { watchId: id } });
        data.state = null;
        data.stateSince = null;
      }
    }
    this.pending.delete(id);
    this.lastVec.delete(id);
    return this.toDto(await this.db.visualWatch.update({ where: { id }, data }));
  }

  async remove(id: string) {
    const r = await this.db.visualWatch.deleteMany({ where: { id } });
    if (!r.count) throw notFound('Vigia não encontrado.');
    return { ok: true };
  }

  /** Salva a imagem de agora como referência do estado A ou B. */
  async addRef(id: string, state: 'a' | 'b') {
    const w = await this.db.visualWatch.findUnique({ where: { id } });
    if (!w) throw notFound('Vigia não encontrado.');
    const ff = this.ff();
    const jpeg = await this.frame(w.cameraId);
    const zone = parseZone(w.zone);
    const [vec, thumb] = await Promise.all([feature(ff, jpeg, zone), thumbnail(ff, jpeg, zone, 240)]);
    await this.db.visualRef.create({ data: { watchId: id, state, vector: toB64(vec), thumb: thumb.toString('base64') } });
    this.pending.delete(id);
    return this.toDto((await this.db.visualWatch.findUnique({ where: { id } }))!);
  }

  async removeRef(refId: string) {
    const r = await this.db.visualRef.deleteMany({ where: { id: refId } });
    if (!r.count) throw notFound('Foto não encontrada.');
    return { ok: true };
  }

  /** Teste ao vivo (Ajustes): o que a DIA vê agora nesta área. */
  async check(id: string) {
    const w = await this.db.visualWatch.findUnique({ where: { id }, include: { refs: true } });
    if (!w) throw notFound('Vigia não encontrado.');
    const ff = this.ff();
    const jpeg = await this.frame(w.cameraId);
    const vec = await feature(ff, jpeg, parseZone(w.zone));
    const r = classify(vec, w.refs.map((x) => ({ state: x.state, vec: fromB64(x.vector) })));
    if (!r) return { ready: false, state: null, label: null, confidence: 0, detail: `Falta foto de referência: salve pelo menos uma de “${w.labelA}” e uma de “${w.labelB}”.` };
    return { ready: true, state: r.state, label: r.state === 'a' ? w.labelA : w.labelB, confidence: Math.round(r.confidence * 100) / 100, detail: r.confidence < MIN_CONFIDENCE ? 'Pouca diferença entre os estados: salve mais fotos (de dia e de noite).' : null };
  }

  private isNight() {
    const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: this.timezone, hour: '2-digit', hour12: false }).format(this.now()));
    return h >= 18 || h < 6;
  }

  /** Uma rodada de leitura de todas as câmeras vigiadas. */
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const ff = this.ffmpeg();
      if (!ff) return;
      const watches = await this.db.visualWatch.findMany({ where: { enabled: true }, include: { refs: true } });
      const byCamera = new Map<string, typeof watches>();
      for (const w of watches) byCamera.set(w.cameraId, [...(byCamera.get(w.cameraId) ?? []), w]);
      for (const [cameraId, list] of byCamera) {
        let jpeg: Buffer;
        try {
          jpeg = await this.frame(cameraId);
        } catch {
          continue; // câmera ocupada/offline agora: tenta na próxima rodada
        }
        for (const w of list) await this.evaluate(ff, w, jpeg).catch(() => undefined);
      }
      if (Date.now() - this.lastCleanup > 3600_000) await this.cleanup();
    } finally {
      this.running = false;
    }
  }

  private async evaluate(ff: string, w: WatchRow & { refs: { state: string; vector: string }[] }, jpeg: Buffer) {
    const zone = parseZone(w.zone);
    const vec = await feature(ff, jpeg, zone);

    if (w.kind === 'motion') {
      const prev = this.lastVec.get(w.id);
      this.lastVec.set(w.id, vec);
      if (!prev || !this.isNight()) return;
      const score = change(prev, vec);
      const last = this.lastAlert.get(w.id) ?? 0;
      if (score > MOTION_THRESHOLD && Date.now() - last > 3 * 60_000) {
        this.lastAlert.set(w.id, Date.now());
        await this.event(w, 'motion', `Movimento à noite · ${await this.cameraName(w.cameraId)}`, jpeg);
      }
      return;
    }

    const r = classify(vec, w.refs.map((x) => ({ state: x.state, vec: fromB64(x.vector) })));
    if (!r || r.confidence < MIN_CONFIDENCE) return;
    await this.db.visualWatch.update({ where: { id: w.id }, data: { confidence: r.confidence } });

    if (r.state !== w.state) {
      const p = this.pending.get(w.id);
      const count = p && p.state === r.state ? p.count + 1 : 1;
      this.pending.set(w.id, { state: r.state, count });
      if (count < CONFIRM) return;
      this.pending.delete(w.id);
      const first = w.state === null; // primeira leitura: só registra, sem avisar
      await this.db.visualWatch.update({ where: { id: w.id }, data: { state: r.state, stateSince: this.now() } });
      if (first) return;
      const title = this.changeTitle(w, r.state);
      await this.event(w, 'state', title, jpeg);
      await this.lightAutomation(w, r.state);
      return;
    }
    this.pending.delete(w.id);

    // Portão (ou estado B) aberto há muito tempo: avisa e repete a cada 30 min
    if (w.state === 'b' && w.alertMinutes && w.stateSince) {
      const mins = (this.now().getTime() - w.stateSince.getTime()) / 60_000;
      const last = this.lastAlert.get(w.id) ?? 0;
      if (mins >= w.alertMinutes && Date.now() - last > 30 * 60_000) {
        this.lastAlert.set(w.id, Date.now());
        await this.event(w, 'alert', `${w.name} ${w.labelB} há ${Math.round(mins)} min`, jpeg);
      }
    }
  }

  private changeTitle(w: WatchRow, state: string) {
    if (w.kind === 'car') return state === 'a' ? 'Carro chegou na garagem' : 'Carro saiu da garagem';
    if (w.kind === 'gate') return state === 'b' ? 'Portão abriu' : 'Portão fechou';
    return `${w.name}: ${state === 'a' ? w.labelA : w.labelB}`;
  }

  /** À noite: portão abriu ou carro chegou → acende a luz e apaga depois de X minutos. */
  private async lightAutomation(w: WatchRow, state: string) {
    if (!w.lightEntity || !this.isNight()) return;
    const trigger = (w.kind === 'gate' && state === 'b') || (w.kind === 'car' && state === 'a') || (w.kind === 'custom' && state === 'b');
    if (!trigger) return;
    const actor = { source: 'automation' as const, userId: null };
    try {
      const d = await this.devices.get(w.lightEntity);
      if (d.isOn) return; // já estava acesa: não mexe (nem apaga depois)
      await this.devices.turnOn(w.lightEntity, actor);
      clearTimeout(this.lightTimers.get(w.lightEntity));
      this.lightTimers.set(
        w.lightEntity,
        setTimeout(() => void this.devices.turnOff(w.lightEntity!, actor).catch(() => undefined), Math.max(1, w.lightMinutes) * 60_000).unref(),
      );
    } catch {
      /* luz indisponível: o evento já foi registrado */
    }
  }

  private async cameraName(cameraId: string) {
    if (cameraId.startsWith('camera.luna_')) {
      const r = await this.db.directCamera.findUnique({ where: { id: cameraId.slice('camera.luna_'.length) }, select: { name: true } });
      if (r) return r.name;
    }
    return cameraId.replace(/^camera\./, '');
  }

  private eventsDir() {
    return join(this.dataDir, 'events');
  }

  private async event(w: WatchRow, kind: 'state' | 'alert' | 'motion', title: string, jpeg: Buffer) {
    const ev = await this.db.cameraEvent.create({ data: { cameraId: w.cameraId, watchId: w.id, kind, title } });
    try {
      await mkdir(this.eventsDir(), { recursive: true });
      const photo = `${ev.id}.jpg`;
      await writeFile(join(this.eventsDir(), photo), await thumbnail(this.ff(), jpeg, null, 960));
      await this.db.cameraEvent.update({ where: { id: ev.id }, data: { photo } });
      ev.photo = photo;
    } catch {
      /* sem foto: o evento continua valendo */
    }
    this.emit({ type: 'camera_event', event: this.eventDto(ev) });
  }

  private eventDto(e: { id: string; cameraId: string; watchId: string | null; kind: string; title: string; photo: string | null; createdAt: Date }): CameraEventDto {
    return { id: e.id, cameraId: e.cameraId, watchId: e.watchId, kind: e.kind as CameraEventDto['kind'], title: e.title, photoUrl: e.photo ? `/api/camera-events/${e.id}/photo` : null, createdAt: e.createdAt.toISOString() };
  }

  async events(limit = 30, cameraId?: string): Promise<CameraEventDto[]> {
    const rows = await this.db.cameraEvent.findMany({ where: cameraId ? { cameraId } : undefined, orderBy: { createdAt: 'desc' }, take: Math.min(100, limit) });
    return rows.map((r) => this.eventDto(r));
  }

  async eventPhoto(id: string): Promise<Buffer> {
    const e = await this.db.cameraEvent.findUnique({ where: { id } });
    if (!e?.photo || !/^[a-z0-9]+\.jpg$/.test(e.photo)) throw notFound('Foto não encontrada.');
    const file = join(this.eventsDir(), e.photo);
    if (!existsSync(file)) throw notFound('Foto não encontrada.');
    return readFile(file);
  }

  /** Apaga eventos e fotos com mais de 7 dias. */
  async cleanup() {
    this.lastCleanup = Date.now();
    const before = new Date(Date.now() - KEEP_DAYS * 86_400_000);
    await this.db.cameraEvent.deleteMany({ where: { createdAt: { lt: before } } });
    const keep = new Set((await this.db.cameraEvent.findMany({ select: { photo: true } })).map((e) => e.photo));
    for (const f of await readdir(this.eventsDir()).catch(() => [] as string[])) if (!keep.has(f)) await rm(join(this.eventsDir(), f), { force: true });
  }

  /** Resposta falada para “o carro está na garagem?”, “o portão está aberto?”, “como está a garagem?”. */
  async statusText(query: string): Promise<string> {
    const q = query.toLowerCase();
    let ws = await this.db.visualWatch.findMany({ where: { enabled: true, kind: { not: 'motion' } } });
    const wantCar = /carro/.test(q);
    const wantGate = /port[aã]o/.test(q);
    if (wantCar || wantGate) ws = ws.filter((w) => (wantCar && w.kind === 'car') || (wantGate && w.kind === 'gate'));
    // Ainda sem leitura automática (acabou de configurar): olha a câmera agora
    for (const w of ws.filter((x) => !x.state)) {
      const live = await this.check(w.id).catch(() => null);
      if (live?.ready && live.state) w.state = live.state;
    }
    ws = ws.filter((w) => w.state);
    if (!ws.length) return 'Ainda não sei: falta configurar a garagem em Ajustes › Garagem, com as fotos de referência.';
    const since = (d: Date | null) => {
      if (!d) return '';
      const mins = Math.round((this.now().getTime() - d.getTime()) / 60_000);
      return mins < 2 ? ' agora há pouco' : mins < 60 ? ` há ${mins} minutos` : mins < 24 * 60 ? ` há ${Math.round(mins / 60)} ${Math.round(mins / 60) === 1 ? 'hora' : 'horas'}` : '';
    };
    const parts = ws.map((w) => {
      const label = w.state === 'a' ? w.labelA : w.labelB;
      if (w.kind === 'car') return w.state === 'a' ? `o carro está na garagem` : `o carro não está na garagem${since(w.stateSince) ? ` (saiu${since(w.stateSince)})` : ''}`;
      if (w.kind === 'gate') return `o portão está ${label}${w.state === 'b' ? since(w.stateSince) : ''}`;
      return `${w.name.toLowerCase()}: ${label}`;
    });
    const s = parts.join(' e ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }
}
