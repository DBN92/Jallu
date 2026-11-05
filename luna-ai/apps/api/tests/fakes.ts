import { resolve } from 'node:path';
import type { HaState } from '../src/integrations/home-assistant/types';

type Handler = (url: URL, init: RequestInit | undefined) => Promise<Response> | Response;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export function makeFetch(handler: Handler): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => handler(new URL(String(input instanceof Request ? input.url : input)), init)) as typeof fetch;
}

/** Home Assistant falso, com estados em memória e execução de serviços. */
export class FakeHomeAssistant {
  online = true;
  calls: { domain: string; service: string; data: Record<string, unknown> }[] = [];
  automations = new Map<string, Record<string, unknown>>();
  states = new Map<string, HaState>();

  constructor() {
    const add = (entity_id: string, state: string, attributes: Record<string, unknown>) => this.states.set(entity_id, { entity_id, state, attributes, last_changed: new Date().toISOString() });
    add('light.luz_da_sala', 'off', { friendly_name: 'Luz da Sala', supported_color_modes: ['brightness'] });
    add('light.luz_do_quarto_casal', 'off', { friendly_name: 'Luz do Quarto Casal', supported_color_modes: ['brightness'] });
    add('light.luz_do_quarto_hospedes', 'on', { friendly_name: 'Luz do Quarto Hóspedes', supported_color_modes: ['onoff'] });
    add('light.luz_da_varanda', 'off', { friendly_name: 'Luz da Varanda', supported_color_modes: ['onoff'] });
    add('switch.tomada_cafeteira', 'off', { friendly_name: 'Tomada Cafeteira', device_class: 'outlet' });
    add('switch.aquecedor', 'off', { friendly_name: 'Aquecedor' });
    add('sensor.temperatura_quarto', '23.5', { friendly_name: 'Temperatura Quarto', unit_of_measurement: '°C', device_class: 'temperature' });
    add('climate.ar_condicionado', 'off', { friendly_name: 'Ar-condicionado' });
    add('person.dan', 'home', { friendly_name: 'Dan' });
    add('sun.sun', 'above_horizon', {});
  }

  fetch = makeFetch(async (url, init) => {
    if (!this.online) throw new TypeError('fetch failed');
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== 'Bearer test-ha-token') return json({ message: 'unauthorized' }, 401);
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    if (path === '/api/' && method === 'GET') return json({ message: 'API running.' });
    if (path === '/api/states' && method === 'GET') return json([...this.states.values()]);
    let m = path.match(/^\/api\/states\/(.+)$/);
    if (m && method === 'GET') {
      const s = this.states.get(decodeURIComponent(m[1]!));
      return s ? json(s) : json({ message: 'Entity not found.' }, 404);
    }
    m = path.match(/^\/api\/services\/([^/]+)\/([^/]+)$/);
    if (m && method === 'POST') {
      const [, domain, service] = m as unknown as [string, string, string];
      const data = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      this.calls.push({ domain, service, data });
      const ids = ([] as string[]).concat((data.entity_id as string | string[]) ?? []);
      const changed: HaState[] = [];
      for (const id of ids) {
        const s = this.states.get(id);
        if (!s) continue;
        if (service === 'turn_on') {
          s.state = domain === 'climate' ? 'cool' : 'on';
          if (typeof data.brightness_pct === 'number') s.attributes.brightness = Math.round((data.brightness_pct / 100) * 255);
          else if (domain === 'light' && s.attributes.supported_color_modes?.includes('brightness') && s.attributes.brightness === undefined) s.attributes.brightness = 255;
        }
        if (service === 'turn_off') {
          s.state = 'off';
          delete s.attributes.brightness;
        }
        changed.push(s);
      }
      return json(changed);
    }
    m = path.match(/^\/api\/config\/automation\/config\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      if (method === 'POST') {
        const cfg = JSON.parse(String(init?.body)) as Record<string, unknown>;
        this.automations.set(id, cfg);
        const eid = `automation.${String(cfg.alias).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
        this.states.set(eid, { entity_id: eid, state: 'on', attributes: { id, friendly_name: String(cfg.alias) } });
        return json({ result: 'ok' });
      }
      if (method === 'DELETE') {
        this.automations.delete(id);
        for (const [k, s] of this.states) if (s.attributes.id === id) this.states.delete(k);
        return json({ result: 'ok' });
      }
    }
    return json({ message: 'not found' }, 404);
  });
}

/** Ollama/OpenAI falsos com respostas roteirizadas. */
export class FakeLlm {
  available = true;
  requests: Record<string, unknown>[] = [];
  /** Fila de respostas: texto ou chamadas de ferramenta */
  script: ({ content: string } | { tool: string; args: Record<string, unknown> })[] = [];

  next() {
    return this.script.shift() ?? { content: 'Olá! Como posso ajudar?' };
  }

  ollamaFetch = makeFetch(async (url, init) => {
    if (!this.available) throw new TypeError('fetch failed');
    if (url.pathname === '/api/tags') return json({ models: [{ name: 'qwen2.5:3b', model: 'qwen2.5:3b' }] });
    if (url.pathname === '/api/chat') {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };
      this.requests.push(body);
      const step = this.next();
      if (body.stream) {
        // NDJSON como o Ollama real: vários pedaços e um final com done
        const lines =
          'tool' in step
            ? [{ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: step.tool, arguments: step.args } }] } }]
            : step.content.split(/(?<= )/).map((piece) => ({ message: { role: 'assistant', content: piece } }));
        const ndjson = [...lines, { message: { role: 'assistant', content: '' }, done: true }].map((l) => JSON.stringify(l)).join('\n') + '\n';
        return new Response(ndjson, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
      }
      if ('tool' in step) return json({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: step.tool, arguments: step.args } }] } });
      return json({ message: { role: 'assistant', content: step.content } });
    }
    return json({}, 404);
  });

  openaiFetch = makeFetch(async (url, init) => {
    if (!this.available) throw new TypeError('fetch failed');
    if (url.pathname.endsWith('/chat/completions')) {
      this.requests.push(JSON.parse(String(init?.body)));
      const step = this.next();
      if ('tool' in step) {
        return json({ choices: [{ message: { content: null, tool_calls: [{ id: `call_${this.requests.length}`, type: 'function', function: { name: step.tool, arguments: JSON.stringify(step.args) } }] } }] });
      }
      return json({ choices: [{ message: { content: step.content } }] });
    }
    if (url.pathname.endsWith('/realtime/client_secrets')) {
      this.requests.push(JSON.parse(String(init?.body)));
      return json({ value: 'ek_test_ephemeral', expires_at: 1999999999 });
    }
    if (url.pathname.includes('/models/')) return json({ id: 'gpt-4.1-mini' });
    return json({}, 404);
  });
}

export class FakeWeather {
  online = true;
  calls = 0;
  fetch = makeFetch(async (url) => {
    if (!this.online) throw new TypeError('fetch failed');
    this.calls++;
    if (url.hostname.startsWith('geocoding')) return json({ results: [{ name: 'São Paulo', admin1: 'São Paulo', country: 'Brasil', latitude: -23.55, longitude: -46.63 }] });
    const hours = Array.from({ length: 48 }, (_, i) => `2026-11-04T${String(i % 24).padStart(2, '0')}:00`);
    return json({
      latitude: -23.55,
      longitude: -46.63,
      timezone: 'America/Sao_Paulo',
      current: { time: '2026-11-04T10:00', temperature_2m: 24.2, relative_humidity_2m: 70, apparent_temperature: 25.1, is_day: 1, precipitation: 0, weather_code: 2, wind_speed_10m: 12 },
      hourly: {
        time: hours,
        temperature_2m: hours.map(() => 22),
        precipitation_probability: hours.map((_, i) => (i >= 14 && i <= 17 ? 80 : 10)),
        weather_code: hours.map((_, i) => (i >= 14 && i <= 17 ? 63 : 2)),
      },
      daily: {
        time: ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'],
        weather_code: [63, 1, 2, 3, 61, 0, 0],
        temperature_2m_max: [27, 29, 28, 26, 22, 25, 27],
        temperature_2m_min: [18, 19, 18, 17, 16, 17, 18],
        precipitation_probability_max: [80, 5, 10, 20, 70, 0, 0],
        precipitation_sum: [12, 0, 0, 0, 8, 0, 0],
        sunrise: Array(7).fill('2026-11-04T05:20'),
        sunset: Array(7).fill('2026-11-04T18:30'),
      },
    });
  });
}

export const testDbUrl = () => process.env.TEST_DATABASE_URL ?? `file:${resolve(__dirname, '.tmp/test.db')}`;
