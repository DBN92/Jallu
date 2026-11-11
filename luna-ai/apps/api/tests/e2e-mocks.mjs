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
add('camera.garagem', 'idle', { friendly_name: 'Garagem', supported_features: 2 });
// “Rita”: Xiaomi Home (modelo c102gl), entidades como no diagnóstico real
const RITA = 'xiaomi_us_1140903813_c102gl';
const ritaIds = [];
const ra = (id, st, attrs = {}) => { add(id, st, attrs); ritaIds.push(id); };
ra(`vacuum.${RITA}`, 'docked', { friendly_name: 'Rita Rita', supported_features: 12312 });
ra(`sensor.${RITA}_battery_level_p_3_1`, '100', { friendly_name: 'Rita  Battery Battery Level', device_class: 'battery', unit_of_measurement: '%' });
ra(`sensor.${RITA}_charging_state_p_3_2`, 'Charging', {});
ra(`select.${RITA}_mode_p_2_3`, 'Full Speed', { options: ['Silent', 'Basic', 'Strong', 'Full Speed'] });
ra(`select.${RITA}_mop_mode_p_4_5`, 'Medium', { options: ['Low', 'Medium', 'High'] });
ra(`select.${RITA}_carpet_press_p_4_12`, 'Open', { options: ['Close', 'Open'] });
ra(`select.${RITA}_break_point_restart_p_4_11`, 'Open', { options: ['Close', 'Open'] });
ra(`select.${RITA}_child_lock_p_4_27`, 'Close', { options: ['Close', 'Open'] });
ra(`switch.${RITA}_enable_p_5_1`, 'on', { friendly_name: 'Rita * do-not-disturb enable' });
ra(`text.${RITA}_start_time_p_5_2`, '22:00', {});
ra(`text.${RITA}_end_time_p_5_3`, '08:00', {});
ra(`text.${RITA}_timer_clean_p_8_2`, '2-1-07:00-1111111-1-1-1-32-0;1-1-17:00-1111111-1-1-1-32-0', {});
for (const b of ['start_mop_wash_a_2_6', 'start_dry_a_2_8', 'stop_dry_a_2_9', 'start_dust_arrest_a_2_4', 'start_eject_a_2_10', 'position_a_7_1', 'play_sound_a_7_2', 'reset_brush_life_a_9_1', 'reset_brush_life_a_10_1', 'reset_filter_life_a_11_1', 'reset_mop_life_a_18_1']) ra(`button.${RITA}_${b}`, 'unknown', {});
for (const [n, v, u] of [['brush_life_level_p_9_2', '99'], ['brush_left_time_p_9_1', '298', 'h'], ['brush_life_level_p_10_2', '66'], ['brush_left_time_p_10_1', '132', 'h'], ['filter_life_level_p_11_1', '99'], ['filter_left_time_p_11_2', '148', 'h'], ['mop_life_level_p_18_1', '60'], ['mop_left_time_p_18_2', '48', 'h'], ['dry_left_time_p_2_5', '219', 'min'], ['cleaning_area_p_4_3', '3'], ['cleaning_time_p_4_2', '2'], ['total_clean_area_p_12_4', '61'], ['total_clean_time_p_12_2', '87'], ['total_clean_times_p_12_3', '4']])
  ra(`sensor.${RITA}_${n}`, v, u ? { unit_of_measurement: u } : {});
add('vacuum.neatsvor', 'docked', { friendly_name: 'Neatsvor', supported_features: 4 | 16 | 32 | 8192, battery_level: 100, fan_speed: 'normal', fan_speed_list: ['gentle', 'normal', 'strong'] });
// Caixa de areia (Smart Life / Tuya), como no Home Assistant do usuário
add('button.smart_cat_litter_box_ti_manual_clean', 'unknown', { friendly_name: 'Smart cat litter box( Ti+) Manual clean' });
add('number.smart_cat_litter_box_ti_delay_clean_time', '1.0', { friendly_name: 'Smart cat litter box( Ti+) Delay clean time', min: 1, max: 600, step: 1, unit_of_measurement: 's' });
add('sensor.smart_cat_litter_box_ti_cat_weight', '5.2', { friendly_name: 'Smart cat litter box( Ti+) Cat weight', unit_of_measurement: 'kg', device_class: 'weight' });
add('sensor.smart_cat_litter_box_ti_excretion_duration', '0', { unit_of_measurement: 's' });
add('sensor.smart_cat_litter_box_ti_excretion_times_day', '0.0', { unit_of_measurement: 'times' });
add('sensor.smart_cat_litter_box_ti_status', 'unknown', {});
add('switch.smart_cat_litter_box_ti_auto_clean', 'off', { friendly_name: 'Smart cat litter box( Ti+) Auto clean' });
add('camera.portao', 'idle', { friendly_name: 'Portão', supported_features: 0 });
const fsMod = await import('node:fs');
const pathMod = await import('node:path');
const CAM_JPG = process.env.CAM_JPG;
const HLS_DIR = process.env.HLS_DIR;
const ptzLog = [];

const wsClients = new Set();
const broadcast = (old, s) => {
  for (const ws of wsClients) ws.send(JSON.stringify({ id: ws.subId, type: 'event', event: { event_type: 'state_changed', data: { entity_id: s.entity_id, old_state: old, new_state: s } } }));
};
const body = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d ? JSON.parse(d) : {})); });
const send = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };

const ha = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // HLS do HA: autorizado pelo token na URL (sem cabeçalho)
  const hm = url.pathname.match(/^\/api\/hls\/tok123\/([\w.]+)$/);
  if (hm && HLS_DIR) {
    const file = pathMod.join(HLS_DIR, hm[1]);
    if (!fsMod.existsSync(file)) return send(res, 404, {});
    const type = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4';
    res.writeHead(200, { 'content-type': type });
    return res.end(fsMod.readFileSync(file));
  }
  if (req.headers.authorization !== 'Bearer e2e-token') return send(res, 401, {});
  const cp = url.pathname.match(/^\/api\/camera_proxy\/(camera\.\w+)$/);
  if (cp && CAM_JPG) {
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    return res.end(fsMod.readFileSync(CAM_JPG));
  }
  if (url.pathname === '/__ptz') return send(res, 200, ptzLog);
  if (url.pathname === '/api/') return send(res, 200, { message: 'API running.' });
  if (url.pathname === '/api/states') return send(res, 200, [...states.values()]);
  // Só no teste: muda um valor e avisa pelo WebSocket, como o Home Assistant faria
  if (url.pathname === '/__test/set' && req.method === 'POST') {
    const d = await body(req);
    const s = states.get(d.entity_id);
    if (!s) return send(res, 404, {});
    const old = structuredClone(s);
    s.state = String(d.state);
    s.last_changed = new Date().toISOString();
    broadcast(old, s);
    return send(res, 200, s);
  }
  let m = url.pathname.match(/^\/api\/states\/(.+)$/);
  if (m) return states.has(m[1]) ? send(res, 200, states.get(m[1])) : send(res, 404, {});
  m = url.pathname.match(/^\/api\/services\/([^/]+)\/([^/]+)$/);
  if (m && req.method === 'POST') {
    const data = await body(req);
    if (m[1] === 'onvif') { ptzLog.push(data); return send(res, 200, []); }
    const s = states.get(data.entity_id);
    if (s) {
      const old = structuredClone(s);
      if (m[1] === 'select' && m[2] === 'select_option') s.state = data.option;
      else if (m[1] === 'number' && m[2] === 'set_value') s.state = String(data.value);
      else if (m[1] === 'button') s.state = new Date().toISOString();
      else if (m[1] === 'vacuum') {
        const next = { start: 'cleaning', pause: 'paused', stop: 'idle', return_to_base: 'returning' };
        if (next[m[2]]) s.state = next[m[2]];
        if (m[2] === 'set_fan_speed') s.attributes.fan_speed = data.fan_speed;
        // depois de voltar, o robô chega à base
        if (m[2] === 'return_to_base') setTimeout(() => { const o = structuredClone(s); s.state = 'docked'; broadcast(o, s); }, 4000);
      } else s.state = m[2] === 'turn_on' ? 'on' : 'off';
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
    if (msg.type === 'camera/stream') ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: { url: '/api/hls/tok123/master_playlist.m3u8' } }));
    if (msg.type === 'config/entity_registry/list') {
      const result = [...states.keys()].map((entity_id) => ({ entity_id, platform: entity_id === 'camera.garagem' ? 'onvif' : ritaIds.includes(entity_id) ? 'xiaomi_home' : 'demo', hidden_by: entity_id === 'switch.tomada_cafeteira' ? 'integration' : null, disabled_by: null, device_id: ritaIds.includes(entity_id) ? 'dev-rita' : null }));
      ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result }));
    }
  });
  ws.on('close', () => wsClients.delete(ws));
});
ha.listen(18123);

http.createServer(async (req, res) => {
  if (req.url === '/api/tags') return send(res, 200, { models: [{ name: 'qwen2.5:3b' }] });
  if (req.url === '/api/chat') {
    const b = await body(req);
    const last = b.messages.at(-1);
    // Simula um modelo LENTO em fluxo (uma palavra a cada 150 ms), como numa CPU antiga
    if (b.stream && last.role === 'user' && /hist[oó]ria/i.test(last.content)) {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      const words = 'Era uma vez uma lua curiosa que adorava conversar. Toda noite ela contava histórias para as estrelas. E as estrelas brilhavam mais forte para ouvir.'.split(/(?<= )/);
      for (const w of words) {
        res.write(JSON.stringify({ message: { role: 'assistant', content: w } }) + '\n');
        await new Promise((r) => setTimeout(r, 150));
      }
      res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n');
      return;
    }
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
