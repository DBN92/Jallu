import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CameraDto } from '@luna/shared';
import { cookieOrToken } from '../../middleware/auth';
import { notFound } from '../../lib/errors';
import { normalize } from '../../lib/text';

/**
 * Widgets do iPhone (app Scriptable): um resumo pequeno da casa num pedido só, com a chave do app
 * (a mesma dos Atalhos da Siri, no cabeçalho Authorization). Só leitura: nada aqui liga ou desliga nada.
 */
export async function widgetRoutes(app: FastifyInstance) {
  const { devices, people, recados, weather, settings, cameras, litter, washer, recordings, lists, catPhotos } = app.services;

  /** Câmera da babá: a que tem choro/temperatura, ou com “babá/bebê/Luiza” no nome */
  const babyCam = (list: CameraDto[]) =>
    list.find((c) => c.info?.some((i) => i.kind === 'cry')) ?? list.find((c) => /\b(baba|bebe|luiza|bercario|nenem)\b/.test(normalize(c.name))) ?? null;

  app.get('/api/widget', { preHandler: cookieOrToken, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
    const s = await settings.get(req.user!.id);
    const [devs, ppl, recs, wx, cams, boxes, washers, rec, items] = await Promise.all([
      safe(devices.list(), []),
      safe(people.list(), []),
      safe(recados.list(), []),
      s.homeLocation ? safe(weather.forecast(s.homeLocation.latitude, s.homeLocation.longitude, s.homeLocation.name), null) : Promise.resolve(null),
      safe(cameras.list(), [] as CameraDto[]),
      safe(litter.list(), []),
      safe(washer.list(), []),
      safe(recordings.status(), null),
      safe(lists.items(), []),
    ]);

    const rain = wx?.hourly.slice(0, 12).find((h) => h.precipitationProbability >= 40);
    const fresh = recs.filter((r) => !r.seen);
    const baby = babyCam(cams);
    const info = (k: string) => baby?.info?.find((i) => i.kind === k);
    const box = boxes.find((b) => b.available) ?? boxes[0];
    const w = washers.find((x) => x.available);
    const total = w?.startedAt && w.remainingMin !== null ? (Date.now() - Date.parse(w.startedAt)) / 60_000 + w.remainingMin : null;
    const vac = devs.find((d) => d.domain === 'vacuum' && d.vacuum && !d.hidden);
    const buy = items.filter((i) => i.status === 'buy');

    return {
      at: new Date().toISOString(),
      weather: wx ? { temp: Math.round(wx.current.temperature), condition: wx.current.condition, isDay: wx.current.isDay, rain: rain ? { hour: Number(rain.time.slice(11, 13)), prob: rain.precipitationProbability } : null } : null,
      lightsOn: devs.filter((d) => d.category === 'lighting' && d.controllable && !d.hidden && d.isOn).length,
      peopleHome: ppl.filter((p) => p.home).map((p) => p.name),
      recado: fresh.length ? { count: fresh.length, from: fresh[0]!.fromName } : null,
      baby: baby
        ? {
            entityId: baby.entityId,
            name: baby.name,
            image: `/api/widget/camera/${baby.entityId}`,
            temperature: info('temperature')?.value ?? null,
            humidity: info('humidity')?.value ?? null,
            crying: !!info('cry')?.active,
          }
        : null,
      litter: box
        ? {
            id: box.id,
            status: box.statusLabel,
            // Todos os gatos cadastrados (mesmo os que ainda não têm peso aprendido)
            cats: box.cats.map((c) => ({ id: c.id, name: c.name, today: c.todayVisits, photo: c.photo ? `/api/widget/cat/${c.id}?v=${c.photo}` : null })),
            alert: box.cats.find((c) => c.alert)?.alert ?? null,
            lastVisit: box.lastVisit ? { at: box.lastVisit.at, cat: box.lastVisit.catName } : null,
          }
        : null,
      washer: w ? { status: w.statusLabel, running: w.running, endsAt: w.endsAt, remainingMin: w.remainingMin, progress: total ? Math.max(0, Math.min(100, Math.round(100 * (1 - (w.remainingMin ?? 0) / total)))) : null } : null,
      vacuum: vac?.vacuum ? { name: vac.name, status: vac.vacuum.status, battery: vac.vacuum.battery } : null,
      recordings: rec
        ? {
            recording: rec.cameras.filter((c) => c.enabled && c.status === 'gravando').map((c) => c.name),
            problems: rec.cameras.filter((c) => c.enabled && c.status !== 'gravando').map((c) => c.name),
            freeBytes: rec.freeBytes,
          }
        : null,
      shopping: { count: buy.length, items: buy.slice(0, 3).map((i) => i.name) },
    };
  });

  // Imagens para o widget (com a mesma chave): câmera e foto do gato
  app.get('/api/widget/camera/:entityId', { preHandler: cookieOrToken, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { entityId } = z.object({ entityId: z.string().regex(/^camera\.[a-z0-9_]+$/) }).parse(req.params);
    const res = await cameras.snapshot(entityId);
    if (!res.ok) throw notFound('Imagem da câmera indisponível agora.');
    return reply.header('content-type', res.headers.get('content-type') ?? 'image/jpeg').header('cache-control', 'no-store').send(Buffer.from(await res.arrayBuffer()));
  });
  app.get('/api/widget/cat/:catId', { preHandler: cookieOrToken }, async (req, reply) => {
    const { catId } = z.object({ catId: z.string().min(1).max(40) }).parse(req.params);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=86400').send(await catPhotos.read(catId));
  });
}
