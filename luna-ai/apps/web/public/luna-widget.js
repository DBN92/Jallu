// Luna — widgets do iPhone (app Scriptable, grátis na App Store)
// Copie este script inteiro para um novo script no Scriptable e toque ▶ uma vez para configurar.
//
// Na tela, ao adicionar o widget do Scriptable, escolha este script e em “Parameter” escreva:
//   pequeno ........ baba | resumo | gravacoes | compras        (vazio = resumo)
//   médio .......... casa
//   grande ......... baba + resumo
//   tela de bloqueio: circular = luiza ou luzes · retangular = lava e seca · em linha = resumo curto
//
// A chave (a mesma dos Atalhos da Siri, em Ajustes › Siri na Luna) fica guardada no Keychain do iPhone.

const KEY_URL = 'luna.url';
const KEY_TOKEN = 'luna.token';
const BG_TOP = new Color('#1c2440');
const BG_BOTTOM = new Color('#0f1426');
const MUTED = new Color('#ffffff', 0.62);
const WARN_BG = new Color('#fbbf24', 0.25);
const WARN_TX = new Color('#fde68a');
const ACCENT = new Color('#7dd3fc');
const REC = new Color('#fda4af');

// ---------- configuração ----------
// Endereço preenchido ao copiar pela Luna (Ajustes › Widgets do iPhone)
const DEFAULT_URL = '';

/** Limpa o endereço: tira espaços, “https://” repetido e barras no fim */
function cleanUrl(v) {
  let u = String(v || '').trim().replace(/\s+/g, '');
  const http = /^(https?:\/\/)*http:\/\//i.test(u); // endereço da rede de casa (http://192.168…)
  u = u.replace(/^(https?:\/\/)+/i, '');
  return u ? (http ? 'http://' : 'https://') + u.replace(/\/+$/, '') : '';
}

async function configure(prevUrl, prevToken) {
  const a = new Alert();
  a.title = 'Luna';
  a.message = '1) Endereço da Luna\n2) Chave do app: na Luna, Ajustes › Siri e Atalhos › Criar chave (começa com luna_)';
  a.addTextField('luna.seudominio.com', prevUrl || (Keychain.contains(KEY_URL) ? Keychain.get(KEY_URL) : DEFAULT_URL));
  // Campo comum (não de senha): assim o iPhone não sugere senhas salvas no lugar da chave
  a.addTextField('luna_…', prevToken || '');
  a.addAction('Salvar e testar');
  a.addCancelAction('Cancelar');
  if ((await a.presentAlert()) === -1) return false;
  const url = cleanUrl(a.textFieldValue(0));
  const token = a.textFieldValue(1).trim().replace(/\s+/g, '');
  if (!url) return retry('Falta o endereço da Luna.', url, token);
  if (token && !/^(luna|dia)_/.test(token)) return retry('A chave começa com “luna_”. Parece que foi colada outra coisa (talvez uma senha).', url, token);
  Keychain.set(KEY_URL, url);
  if (token) Keychain.set(KEY_TOKEN, token);
  if (!Keychain.contains(KEY_TOKEN)) return retry('Falta a chave do app.', url, token);
  try {
    await getData();
  } catch (e) {
    return retry(String(e.message || e), url, token);
  }
  await say('Pronto! ✅', 'A Luna respondeu. Agora adicione o widget do Scriptable na tela, escolha o script e o “Parameter” (veja em Luna › Ajustes › Widgets do iPhone).');
  return true;
}

/** Mostra o problema e oferece corrigir sem perder o que já foi digitado */
async function retry(message, url, token) {
  const a = new Alert();
  a.title = 'Ainda não funcionou';
  a.message = message;
  a.addAction('Corrigir');
  a.addCancelAction('Fechar');
  if ((await a.presentAlert()) === -1) return false;
  return configure(url, token);
}

async function say(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction('OK');
  await a.presentAlert();
  return false;
}

function base() {
  return Keychain.contains(KEY_URL) ? Keychain.get(KEY_URL) : null;
}

function request(path) {
  const r = new Request(base() + path);
  r.headers = { Authorization: 'Bearer ' + (Keychain.contains(KEY_TOKEN) ? Keychain.get(KEY_TOKEN) : '') };
  r.timeoutInterval = 20;
  return r;
}

async function getData() {
  if (!base()) throw new Error('Abra o script no Scriptable para configurar.');
  const r = request('/api/widget');
  let body;
  try {
    body = await r.loadString();
  } catch (e) {
    throw new Error('Não consegui chegar em ' + base() + '. Confira o endereço e a internet.');
  }
  const code = r.response ? r.response.statusCode : 0;
  if (code === 401) throw new Error('A Luna recusou a chave (401). Crie uma chave nova em Luna › Ajustes › Siri e Atalhos e cole inteira.');
  if (code === 404) throw new Error('A Luna desse endereço ainda não tem os widgets (404). Rode a atualização no servidor.');
  let data = null;
  try {
    data = JSON.parse(body);
  } catch (e) {
    throw new Error('O endereço respondeu algo que não é a Luna (código ' + code + '). Confira o endereço.');
  }
  if (code !== 200 || !data || data.error) throw new Error((data && data.message) || 'A Luna respondeu com erro ' + code + '.');
  return data;
}

async function image(path) {
  try {
    return await request(path).loadImage();
  } catch (e) {
    return null;
  }
}

// ---------- peças ----------
function hhmm(iso) {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function newWidget(url) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [BG_TOP, BG_BOTTOM];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(13, 14, 13, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  if (url) w.url = url;
  return w;
}

function text(stack, value, size, opts) {
  const o = opts || {};
  const t = stack.addText(String(value));
  t.font = o.light ? Font.lightSystemFont(size) : o.bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = o.color || Color.white();
  if (o.lines) t.lineLimit = o.lines;
  if (o.scale) t.minimumScaleFactor = o.scale;
  return t;
}

function label(stack, value) {
  const t = text(stack, value.toUpperCase(), 10, { bold: true, color: MUTED });
  return t;
}

function pill(stack, value, warn) {
  const p = stack.addStack();
  p.backgroundColor = warn ? WARN_BG : new Color('#ffffff', 0.12);
  p.cornerRadius = 9;
  p.setPadding(3, 7, 3, 7);
  text(p, value, 10.5, { color: warn ? WARN_TX : Color.white(), lines: 1, scale: 0.7 });
  return p;
}

function weatherLine(d) {
  if (!d.weather) return '';
  return d.weather.rain ? 'Chuva às ' + d.weather.rain.hour + 'h · ' + d.weather.rain.prob + '%' : d.weather.condition;
}

// ---------- widgets ----------
async function babyWidget(d, w) {
  const b = d.baby;
  if (!b) {
    text(w, 'Babá eletrônica', 13, { bold: true });
    text(w, 'Nenhuma câmera da babá encontrada na Luna.', 11, { color: MUTED });
    return;
  }
  const img = await image(b.image);
  if (img) w.backgroundImage = img;
  w.setPadding(0, 0, 0, 0);
  const top = w.addStack();
  top.setPadding(8, 8, 0, 8);
  top.addSpacer();
  pill(top, hhmm(d.at), false);
  w.addSpacer();
  const shade = w.addStack();
  shade.layoutVertically();
  shade.setPadding(16, 11, 10, 11);
  const g = new LinearGradient();
  g.colors = [new Color('#000000', 0), new Color('#000000', 0.75)];
  g.locations = [0, 1];
  shade.backgroundGradient = g;
  text(shade, b.name, 12.5, { bold: true, lines: 1, scale: 0.7 });
  const parts = [];
  if (b.temperature) parts.push('🌡 ' + b.temperature);
  if (b.humidity) parts.push('💧 ' + b.humidity);
  if (b.crying) {
    const p = pill(shade, '😢 choro detectado', true);
    p.url = w.url;
  } else {
    parts.push('tudo calmo');
  }
  if (parts.length) text(shade, parts.join(' · '), 10.5, { color: new Color('#ffffff', 0.9), lines: 1, scale: 0.6 });
}

function summaryWidget(d, w) {
  label(w, 'Luna · ' + hhmm(d.at));
  w.addSpacer(4);
  if (d.weather) {
    text(w, d.weather.temp + '°', 34, { light: true });
    text(w, weatherLine(d), 10.5, { color: MUTED, lines: 1, scale: 0.7 });
  }
  w.addSpacer(4);
  text(w, '💡 ' + (d.lightsOn === 1 ? '1 luz acesa' : d.lightsOn + ' luzes acesas'), 11.5, { lines: 1 });
  if (d.peopleHome.length) text(w, '👥 ' + d.peopleHome.join(' e '), 11.5, { lines: 1, scale: 0.7 });
  else text(w, '👥 ninguém em casa', 11.5, { color: MUTED });
  if (d.recado) {
    w.addSpacer(4);
    pill(w, '📼 ' + (d.recado.count > 1 ? d.recado.count + ' recados novos' : 'Recado de ' + d.recado.from), true);
  }
}

async function houseWidget(d, w) {
  const row = w.addStack();
  row.layoutHorizontally();
  // Caixa de areia
  const left = row.addStack();
  left.layoutVertically();
  label(left, 'Caixa de areia · hoje');
  left.addSpacer(6);
  const l = d.litter;
  if (l && l.cats.length) {
    const cats = left.addStack();
    cats.spacing = 7;
    for (const c of l.cats.slice(0, 4)) {
      const col = cats.addStack();
      col.layoutVertically();
      col.centerAlignContent();
      const av = col.addStack();
      av.size = new Size(32, 32);
      av.cornerRadius = 16;
      av.backgroundColor = new Color('#8b5cf6');
      av.centerAlignContent();
      const ph = c.photo ? await image(c.photo) : null;
      if (ph) av.backgroundImage = ph;
      else text(av, '🐱', 15);
      text(col, c.name + ' ' + c.today, 9.5, { lines: 1, scale: 0.6 });
    }
    left.addSpacer(5);
    if (l.alert) pill(left, '⚠ ' + l.alert, true);
    else if (l.lastVisit) text(left, 'Última visita ' + hhmm(l.lastVisit.at) + (l.lastVisit.cat ? ' · ' + l.lastVisit.cat : ''), 10, { color: MUTED, lines: 1, scale: 0.7 });
  } else {
    text(left, l ? 'Sem visitas ainda' : 'Sem caixa de areia', 11, { color: MUTED });
  }
  row.addSpacer();
  // Lava e seca + aspirador
  const right = row.addStack();
  right.layoutVertically();
  right.size = new Size(130, 0);
  label(right, 'Lava e seca');
  right.addSpacer(4);
  if (d.washer) {
    const ends = d.washer.running && d.washer.endsAt ? ' · termina ' + hhmm(d.washer.endsAt) : '';
    text(right, d.washer.status + ends, 11, { lines: 2, scale: 0.7 });
    if (d.washer.running && d.washer.progress !== null) {
      right.addSpacer(4);
      const bar = right.addStack();
      bar.size = new Size(124, 5);
      bar.cornerRadius = 3;
      bar.backgroundColor = new Color('#ffffff', 0.18);
      const fill = bar.addStack();
      fill.size = new Size(Math.max(4, Math.round((124 * d.washer.progress) / 100)), 5);
      fill.cornerRadius = 3;
      fill.backgroundColor = ACCENT;
      bar.addSpacer();
    }
  } else text(right, '—', 11, { color: MUTED });
  right.addSpacer(8);
  label(right, 'Aspirador');
  right.addSpacer(3);
  text(right, d.vacuum ? (d.vacuum.battery !== null ? '🔋 ' + d.vacuum.battery + '% · ' : '') + d.vacuum.status.toLowerCase() : '—', 11, { lines: 1, scale: 0.7 });
}

function recordingsWidget(d, w) {
  label(w, 'Gravando');
  const r = d.recordings;
  w.addSpacer(6);
  if (!r) return text(w, '—', 12, { color: MUTED });
  const st = w.addStack();
  st.bottomAlignContent();
  text(st, String(r.recording.length), 32, { light: true });
  text(st, r.recording.length === 1 ? '  câmera' : '  câmeras', 12);
  if (r.recording.length) text(w, '● ' + r.recording.join(' · '), 10.5, { color: REC, lines: 2, scale: 0.7 });
  if (r.problems.length) pill(w, '⚠ parada: ' + r.problems.join(', '), true);
  if (r.freeBytes !== null) text(w, '💾 ' + Math.round(r.freeBytes / 1024 ** 3) + ' GB livres', 10.5, { color: MUTED });
}

function shoppingWidget(d, w) {
  label(w, 'Compras · ' + d.shopping.count + (d.shopping.count === 1 ? ' item' : ' itens'));
  w.addSpacer(6);
  if (!d.shopping.count) return text(w, 'Nada para comprar 🎉', 12, { color: MUTED });
  for (const i of d.shopping.items) text(w, '• ' + i, 12.5, { lines: 1, scale: 0.7 });
  if (d.shopping.count > 3) text(w, 'e mais ' + (d.shopping.count - 3), 10.5, { color: MUTED });
}

// Tela de bloqueio (o iPhone pinta em uma cor só)
function lockCircular(d, w, which) {
  w.addAccessoryWidgetBackground = true;
  w.setPadding(2, 2, 2, 2);
  const s = w.addStack();
  s.layoutVertically();
  s.centerAlignContent();
  if (which === 'luzes') {
    text(s, String(d.lightsOn), 18, { bold: true });
    text(s, 'luzes', 9);
    return;
  }
  const b = d.baby;
  if (b && b.crying) {
    text(s, '😢', 18);
    text(s, 'choro', 9);
  } else {
    text(s, b && b.temperature ? b.temperature.replace(/\s*°?C$/, '°') : '—', 15, { bold: true, scale: 0.6 });
    text(s, 'Luiza', 9);
  }
}

function lockRect(d, w) {
  label(w, 'Lava e seca');
  if (!d.washer) return text(w, '—', 13);
  text(w, d.washer.running && d.washer.endsAt ? 'termina ' + hhmm(d.washer.endsAt) : d.washer.status, 14, { bold: true, lines: 1, scale: 0.7 });
  if (d.washer.running && d.washer.remainingMin !== null) text(w, 'faltam ' + d.washer.remainingMin + ' min', 11);
}

function lockInline(d, w) {
  const b = d.baby && d.baby.temperature ? ' · Luiza ' + d.baby.temperature : '';
  text(w, '💡 ' + d.lightsOn + b, 12);
}

// ---------- montagem ----------
async function build(family, param) {
  const p = (param || '').toLowerCase().trim();
  const root = base() || '';
  let d;
  try {
    d = await getData();
  } catch (e) {
    const w = newWidget(root || undefined);
    text(w, 'Luna', 13, { bold: true });
    text(w, String(e.message || e), 11, { color: MUTED, lines: 4 });
    return w;
  }
  if (family === 'accessoryCircular') {
    const w = new ListWidget();
    lockCircular(d, w, p.indexOf('luz') === 0 ? 'luzes' : 'luiza');
    return w;
  }
  if (family === 'accessoryRectangular') {
    const w = new ListWidget();
    lockRect(d, w);
    return w;
  }
  if (family === 'accessoryInline') {
    const w = new ListWidget();
    lockInline(d, w);
    return w;
  }
  if (family === 'medium') {
    const w = newWidget(root + '/caixa-de-areia/' + (d.litter ? d.litter.id : ''));
    await houseWidget(d, w);
    return w;
  }
  if (family === 'large' || family === 'extraLarge') {
    const w = newWidget(root + '/cameras');
    w.setPadding(0, 0, 0, 0);
    const top = w.addStack();
    top.size = new Size(0, 200);
    top.layoutVertically();
    const img = d.baby ? await image(d.baby.image) : null;
    if (img) top.backgroundImage = img;
    top.setPadding(10, 12, 10, 12);
    if (d.baby) {
      top.addSpacer();
      text(top, d.baby.name + (d.baby.temperature ? ' · 🌡 ' + d.baby.temperature : '') + (d.baby.crying ? ' · 😢 choro' : ''), 13, { bold: true, lines: 1, scale: 0.6 });
    }
    const bottom = w.addStack();
    bottom.layoutVertically();
    bottom.setPadding(10, 14, 12, 14);
    summaryWidget(d, bottom);
    return w;
  }
  // pequeno
  if (p === 'baba' || p === 'babá') {
    const w = newWidget(root + '/cameras');
    await babyWidget(d, w);
    return w;
  }
  if (p.indexOf('grava') === 0) {
    const w = newWidget(root + '/gravacoes');
    recordingsWidget(d, w);
    return w;
  }
  if (p.indexOf('compra') === 0) {
    const w = newWidget(root + '/listas');
    shoppingWidget(d, w);
    return w;
  }
  const w = newWidget(root + '/');
  summaryWidget(d, w);
  return w;
}

if (config.runsInWidget) {
  Script.setWidget(await build(config.widgetFamily, args.widgetParameter));
} else {
  // Aberto no app: configurar ou ver uma prévia
  const menu = new Alert();
  menu.title = 'Luna — widgets';
  menu.message = base() ? 'Conectado a ' + base() : 'Ainda não configurado.';
  const opts = [
    ['Configurar endereço e chave', null],
    ['Prévia: babá (pequeno)', ['small', 'baba']],
    ['Prévia: resumo (pequeno)', ['small', 'resumo']],
    ['Prévia: casa (médio)', ['medium', 'casa']],
    ['Prévia: grande', ['large', '']],
    ['Prévia: gravações', ['small', 'gravacoes']],
    ['Prévia: compras', ['small', 'compras']],
  ];
  for (const [t] of opts) menu.addAction(t);
  menu.addCancelAction('Fechar');
  const i = await menu.presentSheet();
  if (i === 0 || (!base() && i > 0)) await configure();
  else if (i > 0) {
    const [fam, par] = opts[i][1];
    const w = await build(fam, par);
    if (fam === 'small') await w.presentSmall();
    else if (fam === 'medium') await w.presentMedium();
    else await w.presentLarge();
  }
}
Script.complete();
