// Servidores SIMULADOS apenas para testes ponta a ponta locais (NÃO usados em produção).
// Home Assistant (REST + WebSocket) na porta 18123, Ollama na 11435, Open-Meteo na 18080.
import http from 'node:http';
import { WebSocketServer } from 'ws';

const states = new Map();
const add = (id, state, attributes) => states.set(id, { entity_id: id, state, attributes, last_changed: new Date().toISOString() });
add('light.luz_da_sala', 'off', { friendly_name: 'Luz da Sala', supported_color_modes: ['brightness'] });
add('light.luz_do_quarto', 'on', { friendly_name: 'Luz do Quarto', supported_color_modes: ['brightness'], brightness: 160 });
add('light.luz_da_varanda', 'off', { friendly_name: 'Luz da Varanda', supported_color_modes: ['onoff'] });
add('switch.tomada_cafeteira', 'off', { friendly_name: 'Tomada Cafeteira', device_class: 'outlet' });
add('switch.ventilador', 'on', { friendly_name: 'Ventilador do Escritório' });
add('sensor.temperatura_sala', '24.6', { friendly_name: 'Temperatura da Sala', unit_of_measurement: '°C', device_class: 'temperature' });
add('binary_sensor.porta_entrada', 'off', { friendly_name: 'Porta de Entrada', device_class: 'door' });
add('person.dono', 'home', { friendly_name: 'Dono' });

const wsClients = new Set();
const broadcast = (old, s) => {
  for (const ws of wsClients) ws.send(JSON.stringify({ id: ws.subId, type: 'event', event: { event_type: 'state_changed', data: { entity_id: s.entity_id, old_state: old, new_state: s } } }));
};
const body = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d ? JSON.parse(d) : {})); });
const send = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };

const ha = http.createServer(async (req, res) => {
  if (req.headers.authorization !== 'Bearer e2e-token') return send(res, 401, {});
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/') return send(res, 200, { message: 'API running.' });
  if (url.pathname === '/api/states') return send(res, 200, [...states.values()]);
  let m = url.pathname.match(/^\/api\/states\/(.+)$/);
  if (m) return states.has(m[1]) ? send(res, 200, states.get(m[1])) : send(res, 404, {});
  m = url.pathname.match(/^\/api\/services\/([^/]+)\/([^/]+)$/);
  if (m && req.method === 'POST') {
    const data = await body(req);
    const s = states.get(data.entity_id);
    if (s) {
      const old = structuredClone(s);
      s.state = m[2] === 'turn_on' ? 'on' : 'off';
      if (data.brightness_pct) s.attributes.brightness = Math.round(data.brightness_pct * 2.55);
      if (m[2] === 'turn_off') delete s.attributes.brightness;
      else if (s.attributes.supported_color_modes?.includes('brightness') && !s.attributes.brightness) s.attributes.brightness = 255;
      s.last_changed = new Date().toISOString();
      setTimeout(() => broadcast(old, s), 50);
    }
    return send(res, 200, s ? [s] : []);
  }
  send(res, 404, {});
});
const wss = new WebSocketServer({ server: ha, path: '/api/websocket' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'auth_required' }));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'auth') ws.send(JSON.stringify({ type: msg.access_token === 'e2e-token' ? 'auth_ok' : 'auth_invalid' }));
    if (msg.type === 'subscribe_events') { ws.subId = msg.id; wsClients.add(ws); ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true })); }
    if (msg.type === 'ping') ws.send(JSON.stringify({ id: msg.id, type: 'pong' }));
  });
  ws.on('close', () => wsClients.delete(ws));
});
ha.listen(18123);

http.createServer(async (req, res) => {
  if (req.url === '/api/tags') return send(res, 200, { models: [{ name: 'qwen2.5:3b' }] });
  if (req.url === '/api/chat') {
    const b = await body(req);
    const last = b.messages.at(-1);
    if (last.role === 'tool') return send(res, 200, { message: { role: 'assistant', content: 'A temperatura da sala está em 24,6 °C. Está agradável!' } });
    if (/temperatura/i.test(last.content)) return send(res, 200, { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_device_state', arguments: { device: 'temperatura da sala' } } }] } });
    return send(res, 200, { message: { role: 'assistant', content: 'Oi! Eu sou a Luna. Posso controlar sua casa, ver o clima e conversar com você.' } });
  }
  send(res, 404, {});
}).listen(11435);

http.createServer((req, res) => {
  const hours = Array.from({ length: 48 }, (_, i) => `2026-11-04T${String(i % 24).padStart(2, '0')}:00`);
  send(res, 200, {
    latitude: -23.55, longitude: -46.63, timezone: 'America/Sao_Paulo',
    current: { time: '2026-11-04T17:00', temperature_2m: 26.4, relative_humidity_2m: 62, apparent_temperature: 27.8, is_day: 1, precipitation: 0, weather_code: 2, wind_speed_10m: 9 },
    hourly: { time: hours, temperature_2m: hours.map((_, i) => 20 + (i % 24 > 6 && i % 24 < 18 ? 6 : 1)), precipitation_probability: hours.map((_, i) => (i % 24 >= 19 && i % 24 <= 22 ? 70 : 10)), weather_code: hours.map((_, i) => (i % 24 >= 19 && i % 24 <= 22 ? 61 : 2)) },
    daily: { time: ['2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08','2026-11-09','2026-11-10'], weather_code: [61,1,2,3,80,0,95], temperature_2m_max: [28,30,29,25,23,27,31], temperature_2m_min: [18,19,19,17,16,17,20], precipitation_probability_max: [70,5,10,30,80,0,60], precipitation_sum: [6,0,0,1,12,0,9], sunrise: Array(7).fill('2026-11-04T05:18'), sunset: Array(7).fill('2026-11-04T18:32') },
  });
}).listen(18080);
console.log('mocks prontos');
