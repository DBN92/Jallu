// Maquete 3D da casa (three.js). Roda numa página própria (casa3d.html), aberta dentro da Luna num
// quadro; a página House3DPage faz a ponte com o Home Assistant por mensagens.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* ================= Planta (metros), medida no escaneamento =================
 * x: largura (-1,52 a 1,52) · z: comprimento (-7,56 a 7,56) · chão em y = 0 */
const WALL_H = 2.6, T = 0.1, DOOR_H = 2.1;
// Andar mostrado: #terreo ou #superior (lembrado no aparelho)
let FLOOR = location.hash === '#terreo' ? 'terreo' : location.hash === '#superior' ? 'superior' : (() => { try { return localStorage.getItem('luna.casa3d.andar') || 'superior'; } catch { return 'superior'; } })();
if (FLOOR !== 'terreo') FLOOR = 'superior';
const UP = {};
UP.ROOMS = [
  { id: 'suite', name: 'Suíte', kind: 'Quarto de casal com TV', floor: 'wood', rects: [[-1.52, -7.56, 1.52, -3.78], [-1.52, -3.78, -0.19, -1.92]], view: { dir: [-0.62, 0.78, 0.06], at: [0.1, -5.2] }, label: [0.2, -5.6], stand: [-0.85, -2.6], look: [0.4, -6.2] },
  { id: 'banho-suite', name: 'Banheiro da suíte', kind: 'Banheiro', floor: 'tile', rects: [[-0.19, -3.78, 1.52, -1.92]], label: [0.66, -2.85], stand: [0.15, -2.2], look: [1.1, -3.4] },
  { id: 'corredor', name: 'Corredor', kind: 'Circulação', floor: 'wood', rects: [[-1.52, -1.92, 0.35, 0.66], [-0.55, 0.66, 0.35, 4.68]], label: [-0.6, -0.35], stand: [-0.1, -1.4], look: [-0.1, 4.2] },
  { id: 'escada', name: 'Escada', kind: 'Desce para o térreo', floor: 'none', rects: [[-1.52, 0.66, -0.55, 4.68]], label: [-1.03, 2.9] },
  { id: 'escritorio', name: 'Escritório', kind: 'Escritório', floor: 'wood', rects: [[0.35, -1.92, 1.52, 2.88]], label: [0.93, 0.5], stand: [0.6, 1.0], look: [1.0, 2.6] },
  { id: 'banho', name: 'Banheiro', kind: 'Banheiro social', floor: 'tile', rects: [[0.35, 2.88, 1.52, 5.07]], label: [0.93, 4.0], stand: [0.6, 3.5], look: [1.2, 4.7] },
  { id: 'quarto2', name: 'Quarto do bebê', kind: 'Berço, trocador e poltrona', floor: 'wood', rects: [[-1.52, 4.68, 0.35, 7.56], [0.35, 5.07, 1.52, 7.56]], view: { dir: [-0.5, 0.86, -0.3], at: [0.05, 6.15], zoom: 0.9 }, label: [-0.4, 6.4], stand: [-0.6, 5.1], look: [0.9, 7.0] },
];
UP.WALLS = [
  [-1.52, -7.56, -1.52, 7.56], [1.52, -7.56, 1.52, 7.56],
  [0.25, -7.56, 1.52, -7.56], [-1.52, 7.56, -0.32, 7.56], [0.65, 7.56, 1.52, 7.56],
  [-0.19, -3.78, 1.52, -3.78], [-0.19, -3.78, -0.19, -2.62], [-0.77, -1.92, 1.52, -1.92],
  [0.35, -1.92, 0.35, 0.66], [0.35, 1.43, 0.35, 3.14], [0.35, 2.88, 1.52, 2.88], [0.35, 3.71, 0.35, 5.07], [0.35, 5.07, 1.52, 5.07],
  [-1.52, 4.68, -0.41, 4.68],
];
// Portas: abertura [x1, z1, x2, z2] com a dobradiça no ponto 1; todas abrem para DENTRO do cômodo
// (`into` é um ponto dentro do cômodo para onde a porta abre)
UP.DOORS = [
  { a: [-1.52, -1.92, -0.77, -1.92], into: [-1.1, -2.6] },  // suíte
  { a: [-0.19, -1.92, -0.19, -2.62], into: [0.4, -2.3] },   // banheiro da suíte
  { a: [0.35, 0.66, 0.35, 1.43], into: [0.9, 1.0] },        // escritório
  { a: [0.35, 3.71, 0.35, 3.14], into: [0.9, 3.5] },        // banheiro (dobradiça do lado do box, longe da pia)
  { a: [0.35, 4.68, -0.41, 4.68], into: [-0.1, 5.3] },      // quarto do bebê
];
UP.WINDOWS = [[-1.52, -7.56, 0.25, -7.56, 0.05, 2.25], [-0.32, 7.56, 0.65, 7.56, 0.95, 2.15]];

/* ---------- Térreo (medido no segundo escaneamento) ----------
 * Fundo: área de serviço · cozinha em L · lavabo · escada com depósito embaixo · sala com TV */
const DN = {};
DN.ROOMS = [
  { id: 'servico', name: 'Área de serviço', kind: 'Lavanderia e churrasqueira', floor: 'porc', rects: [[-1.52, -7.14, 1.52, -3.45]], label: [-0.3, -5.4], view: { dir: [-0.25, 0.8, 0.55], at: [0.0, -5.9], zoom: 0.95 } },
  { id: 'cozinha', name: 'Cozinha', kind: 'Cozinha', floor: 'porc', rects: [[-1.52, -3.45, 1.52, -0.6], [-0.2, -0.6, 0.55, 0.7]], label: [-0.3, -2.0], view: { dir: [-0.3, 0.78, 0.55], at: [0.0, -2.4], zoom: 0.95 } },
  { id: 'jantar', name: 'Sala de jantar', kind: 'Mesa de 4 lugares', floor: 'porc', rects: [[-1.52, -0.6, -0.2, 1.5]], label: [-0.6, 0.45], view: { dir: [0.6, 0.78, 0.12], at: [-0.95, 0.45], zoom: 0.8 } },
  { id: 'lavabo', name: 'Lavabo', kind: 'Embaixo da escada · porta de correr', floor: 'tile', rects: [[0.55, -0.6, 1.52, 0.75]], label: [1.03, 0.05], view: { dir: [-0.3, 0.95, 0.1], at: [0.9, 0.05], zoom: 0.7 } },
  { id: 'escada-t', name: 'Escada', kind: 'Pedra preta, por cima do lavabo', floor: 'porc', rects: [[0.55, 0.75, 1.52, 3.3]], label: [1.03, 2.0] },
  { id: 'garagem', name: 'Garagem', kind: 'Peugeot 2008', floor: 'concrete', rects: [[-1.52, 7.14, 1.52, 12.7]], label: [0.0, 9.9], view: { dir: [-0.55, 0.8, 0.15], at: [0.0, 9.9], zoom: 0.95 } },
  { id: 'sala', name: 'Sala', kind: 'Sala de TV', floor: 'porc', rects: [[-0.2, 0.7, 0.55, 3.3], [-1.52, 1.5, -0.2, 3.3], [-1.52, 3.3, 1.52, 7.14]], label: [-0.3, 4.4], view: { dir: [-0.6, 0.78, 0.1], at: [0.1, 4.9], zoom: 0.95 } },
];
DN.WALLS = [
  [-1.52, -7.14, -1.52, 12.7], [1.52, -7.14, 1.52, 12.7],   // laterais (a garagem continua na frente)
  [-1.52, -7.14, 1.52, -7.14],                       // fundo (sem janela: armário de ponta a ponta)
  [-0.62, 7.14, 1.52, 7.14], [-1.52, 7.14, -1.47, 7.14], // sala | garagem (porta à direita da mesa, olhando para ela)
  [-0.9, -3.45, 0.45, -3.45], [1.4, -3.45, 1.52, -3.45], // serviço | cozinha: janela no meio, porta de vidro à esquerda
  [0.55, -0.6, 1.52, -0.6], [0.55, 0.15, 0.55, 0.75], [0.55, 0.75, 1.52, 0.75], // lavabo (embaixo da escada)
];
DN.DOORS = [
  { a: [-0.62, 7.14, -1.47, 7.14], into: [-1.0, 6.6] },   // sala → garagem
];
DN.SLIDE_DOORS = [{ a: [0.55, -0.6, 0.55, 0.15], side: -1, slideTo: 1 }]; // lavabo: porta de correr (folha do lado da cozinha)
DN.GATE = [-1.52, 12.7, 1.52];                            // portão da garagem
DN.WINDOWS = [[0.45, -3.45, 1.4, -3.45, 1.05, 2.1]]; // janela da cozinha para a área de serviço // fundo · janela da cozinha para a área de serviço
DN.SIDE_WINDOWS = [];
DN.GLASS_DOORS = [[-1.52, -3.45, -0.9, -3.45]]; // porta de vidro cozinha → área de serviço

const F = FLOOR === 'terreo' ? DN : UP;
const ROOMS = F.ROOMS, WALLS = F.WALLS, DOORS = F.DOORS, WINDOWS = F.WINDOWS, SIDE_WINDOWS = F.SIDE_WINDOWS ?? [], GLASS_DOORS = F.GLASS_DOORS ?? [], SLIDE_DOORS = F.SLIDE_DOORS ?? [];

/* ---------- Seletor de andar ---------- */
document.getElementById('floorName').textContent = (FLOOR === 'terreo' ? 'Térreo' : 'Andar de cima') + ' · planta 3D';
document.querySelectorAll('[data-floor]').forEach((b) => {
  b.classList.toggle('on', b.dataset.floor === FLOOR);
  b.addEventListener('click', () => {
    if (b.dataset.floor === FLOOR) return;
    try { localStorage.setItem('luna.casa3d.andar', b.dataset.floor); } catch {}
    location.hash = b.dataset.floor; location.reload();
  });
});

/* ================= Renderizador e luz ================= */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;
scene.background = new THREE.Color('#8c8c8e');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.autoRotateSpeed = 0.7;

const sun = new THREE.DirectionalLight(0xfff6ec, 1.7);
sun.position.set(2.5, 12, -3); sun.castShadow = true;
sun.shadow.radius = 9; sun.shadow.blurSamples = 16;
sun.shadow.mapSize.set(2048, 4096);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 9, bottom: -9, near: 1, far: 30 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
// O sol não se move: a sombra é calculada só quando a cena muda (e não a cada quadro)
sun.shadow.autoUpdate = false;
// Desenho sob demanda: a tela só é redesenhada quando algo muda (toque, animação, luz, ventilador)
let need = 8;
const invalidate = (frames = 2, shadow = false) => { need = Math.max(need, frames); if (shadow) sun.shadow.needsUpdate = true; };
controls.addEventListener('change', () => invalidate());
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a4a, 0.75));

/* ================= Materiais ================= */
function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const woodTex = canvasTex(512, 1024, (g, w, h) => {
  const cols = 8, pw = w / cols;
  for (let i = 0; i < cols; i++) {
    let y = -rnd() * 400;
    while (y < h) {
      const len = 350 + rnd() * 450, l = 0.86 + rnd() * 0.22;
      g.fillStyle = `rgb(${Math.round(118 * l)},${Math.round(84 * l)},${Math.round(62 * l)})`;
      g.fillRect(i * pw, y, pw, len);
      g.globalAlpha = 0.1;
      for (let k = 0; k < 6; k++) { g.strokeStyle = rnd() > 0.5 ? '#5a3a20' : '#d8b48a'; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const x = i * pw + rnd() * pw; g.moveTo(x, y); g.bezierCurveTo(x + 6, y + len / 3, x - 6, y + len * 0.66, x + rnd() * 8 - 4, y + len); g.stroke(); }
      g.globalAlpha = 1; g.fillStyle = 'rgba(40,24,12,.55)'; g.fillRect(i * pw, y, pw, 2);
      y += len;
    }
    g.fillStyle = 'rgba(40,24,12,.5)'; g.fillRect(i * pw, 0, 2, h);
  }
});
const brickTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#d9d2c6'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) { const l = 0.85 + rnd() * 0.2; g.fillStyle = `rgb(${Math.round(168 * l)},${Math.round(84 * l)},${Math.round(58 * l)})`; g.fillRect(c * 70 + (r % 2) * 35 + 3, r * 32 + 3, 64, 26); }
});
const porcTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#b9b4ab'; g.fillRect(0, 0, w, h);
  const n = 2, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const l = 214 + Math.round(rnd() * 10); g.fillStyle = `rgb(${l},${l - 3},${l - 8})`; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
  g.globalAlpha = 0.05; for (let k = 0; k < 600; k++) { g.fillStyle = rnd() > 0.5 ? '#fff' : '#8a8378'; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
});
const tileTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#4c4c50'; g.fillRect(0, 0, w, h);
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const l = 104 + Math.round(rnd() * 12); g.fillStyle = `rgb(${l},${l},${l + 3})`; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
});
const wallTileTex = canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#d4d8dc'; g.fillRect(0, 0, w, h);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) { g.fillStyle = '#f4f6f8'; g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124); }
});
function fabricTex(color) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.07;
    for (let i = 0; i < w; i += 2) { g.fillStyle = i % 4 ? '#fff' : '#000'; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
  });
}
const hangerTex = canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#141416'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2a2a2e'; g.fillRect(0, h / 2 - 3, w, 6);
  for (let x = 10; x < w - 10; x += 14 + rnd() * 6) { g.fillStyle = `rgba(${150 + rnd() * 60},${150 + rnd() * 60},${150 + rnd() * 60},.55)`; g.fillRect(x, 18, 4, h - 36); }
});
const blobTex = (() => { const t = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })();
const edgeTex = (() => { const t = canvasTex(8, 64, (g, w, h) => { const r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(0,0,0,.42)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })();
const concreteTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8e8e90'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { const l = 120 + rnd() * 50; g.fillStyle = `rgba(${l},${l},${l + 2},.25)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } });
const haloTex = (() => { const t = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,220,170,1)'); r.addColorStop(0.25, 'rgba(255,190,120,.45)'); r.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })();
const LAMPS = [], FANS = [];
const washTex = (() => { const t = canvasTex(64, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, h / 2); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(0.35, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })();
const M = (p) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...p });
const MAT = {
  wall: M({ color: '#f2efe9', roughness: 0.95 }),
  wallTop: M({ color: '#f4eee3', emissive: '#4a4438' }),
  base: M({ color: '#ffffff', roughness: 0.5 }),
  wood: M({ color: '#3a2a21', roughness: 0.5 }),
  woodLight: M({ color: '#4b3427', roughness: 0.55 }),
  white: M({ color: '#f7f7f5', roughness: 0.35 }),
  ceramic: new THREE.MeshPhysicalMaterial({ color: '#fbfbfb', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 }),
  chrome: M({ color: '#d9dde2', metalness: 1, roughness: 0.15 }),
  black: M({ color: '#1d1e22', roughness: 0.45 }),
  screen: M({ color: '#0b0d12', roughness: 0.15, emissive: '#1a2a44', emissiveIntensity: 0.6 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#4a5560', transparent: true, opacity: 0.5, roughness: 0.03, metalness: 0, transmission: 0 }),
  alu: M({ color: '#1b1b1d', metalness: 0.4, roughness: 0.4 }),
  linen: M({ map: fabricTex('#f3f1ec'), roughness: 1 }),
  duvet: M({ map: fabricTex('#f6f4f0'), roughness: 1 }),
  beige: M({ map: fabricTex('#c9b79c'), roughness: 1 }),
  pillow: M({ map: fabricTex('#f1ede6'), roughness: 1 }),
  cushion: M({ map: fabricTex('#bda98c'), roughness: 1 }),
  grey: M({ map: fabricTex('#3a2a21'), roughness: 0.8 }),
  armchair: M({ map: fabricTex('#c2b29a'), roughness: 1 }),
  red: M({ map: fabricTex('#232326'), roughness: 0.7 }),
  hotpink: M({ color: '#1c1c1e', roughness: 0.5 }),
  lamp: M({ color: '#fff4dc', emissive: '#ffd59a', emissiveIntensity: 1.4, roughness: 0.9 }),
  leaf: M({ color: '#3f7d3a', roughness: 0.8 }),
  pot: M({ color: '#e8e1d6', roughness: 0.7 }),
  mirror: M({ color: '#cfe0ea', metalness: 1, roughness: 0.04 }),
  rug: M({ map: fabricTex('#a89d8f'), roughness: 1 }),
  stair: M({ color: '#5a3d2b', roughness: 0.6 }),
  hanger: [null, null, null, null, null, null],
};

/* ================= Ajudantes de modelagem ================= */
const house = new THREE.Group(); scene.add(house);
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = house) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const box = (w, h, d, mat, x, y, z, p) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p);
const rbox = (w, h, d, r, mat, x, y, z, p) => mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2)), mat, x, y, z, p);
const cyl = (rt, rb, h, mat, x, y, z, p, seg = 24) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, p);
const group = (x, z, rot = 0, parent = house) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g); return g; };

/* ================= Pisos ================= */
const floors = [];
for (const r of ROOMS) {
  r.mats = [];
  for (const [x1, z1, x2, z2] of r.rects) {
    if (r.floor === 'none') continue;
    const w = x2 - x1, d = z2 - z1;
    let m;
    if (r.floor === 'wood') { const t = woodTex.clone(); t.needsUpdate = true; t.repeat.set(w / 0.8, d / 1.6); m = M({ map: t, roughness: 0.55 }); }
    else if (r.floor === 'concrete') { const t = concreteTex.clone(); t.needsUpdate = true; t.repeat.set(w / 1.5, d / 1.5); m = M({ map: t, roughness: 0.95, color: '#c9c6c0' }); }
    else if (r.floor === 'porc') { const t = porcTex.clone(); t.needsUpdate = true; t.repeat.set(w / 1.2, d / 1.2); m = M({ map: t, roughness: 0.3 }); }
    else if (r.floor === 'tile') { const t = tileTex.clone(); t.needsUpdate = true; t.repeat.set(w / 1.2, d / 1.2); m = M({ map: t, roughness: 0.25 }); }
    else m = M({ color: '#6d6f78' });
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), m);
    f.position.set(x1 + w / 2, -0.025, z1 + d / 2); f.receiveShadow = true; f.userData.room = r;
    house.add(f); floors.push(f); r.mats.push(m);
  }
}
// Laje por baixo e chão de concreto em volta (como na maquete de referência)
{ const z1 = Math.min(...ROOMS.flatMap((r) => r.rects.map((q) => q[1]))), z2 = Math.max(...ROOMS.flatMap((r) => r.rects.map((q) => q[3]))); box(3.34, 0.2, z2 - z1 + 0.2, M({ color: '#f2efe9' }), 0, -0.15, (z1 + z2) / 2); }
{ const t = concreteTex.clone(); t.needsUpdate = true; t.repeat.set(16, 16); const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), M({ map: t, roughness: 1 })); g.rotation.x = -Math.PI / 2; g.position.y = -0.25; g.receiveShadow = true; scene.add(g); }
// Sombra de contato (manchas suaves embaixo dos móveis e na base das paredes)
function blob(parent, w, d, x = 0, z = 0, o = 1) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: o })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z); m.renderOrder = 1; parent.add(m); return m; }

/* ================= Paredes, rodapés, portas e janelas ================= */
function wallBox([x1, z1, x2, z2], h, y0, mat = MAT.wall, t = T) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const w = new THREE.Mesh(new THREE.BoxGeometry(len + t, h, t), [mat, mat, MAT.wallTop, mat, mat, mat]);
  w.position.set((x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2); w.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  w.castShadow = true; w.receiveShadow = true; house.add(w); return w;
}
const edgeMat = new THREE.MeshBasicMaterial({ map: edgeTex, transparent: true, depthWrite: false });
function wallShade([x1, z1, x2, z2]) {
  const len = Math.hypot(x2 - x1, z2 - z1), ang = -Math.atan2(z2 - z1, x2 - x1), nx = -(z2 - z1) / len, nz = (x2 - x1) / len;
  for (const sd of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.28), edgeMat);
    m.rotation.order = 'YXZ'; m.rotation.y = ang + (sd > 0 ? Math.PI : 0); m.rotation.x = -Math.PI / 2;
    m.position.set((x1 + x2) / 2 + nx * sd * (T / 2 + 0.14), 0.003, (z1 + z2) / 2 + nz * sd * (T / 2 + 0.14)); m.renderOrder = 1; house.add(m);
  }
}
for (const w of WALLS) {
  wallBox(w, WALL_H, 0); wallShade(w);
  wallBox(w, 0.07, 0, MAT.base, T + 0.024); // rodapé dos dois lados
}
// Azulejo nas paredes dos banheiros (meia altura)
const tileMat = (() => { const t = wallTileTex.clone(); t.needsUpdate = true; t.repeat.set(3, 2); return M({ map: t, roughness: 0.2 }); })();
for (const r of ROOMS.filter((x) => x.floor === 'tile')) {
  const [x1, z1, x2, z2] = r.rects[0], e = T / 2 + 0.006;
  const walls = [[x1 + e, z1 + e, x2 - e, z1 + e], [x1 + e, z2 - e, x2 - e, z2 - e], [x1 + e, z1 + e, x1 + e, z2 - e], [x2 - e, z1 + e, x2 - e, z2 - e]];
  for (const w of walls) { const m = wallBox(w, 1.5, 0.07, tileMat, 0.01); m.castShadow = false; }
}
// Portas: verga em cima, batentes e a folha de madeira aberta
for (const d of DOORS) {
  const [x1, z1, x2, z2] = d.a;
  wallBox(d.a, WALL_H - DOOR_H, DOOR_H);
  const len = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / len, uz = (z2 - z1) / len;
  for (const [px, pz] of [[x1, z1], [x2, z2]]) { const j = box(0.05, DOOR_H, T + 0.03, MAT.base, px - ux * 0.025 * (px === x1 ? -1 : 1), DOOR_H / 2, pz - uz * 0.025 * (pz === z1 ? -1 : 1)); j.rotation.y = -Math.atan2(uz, ux); }
  // escolhe o lado em que a folha aponta para dentro do cômodo
  const base = -Math.atan2(uz, ux), open = THREE.MathUtils.degToRad(80);
  const leafDir = (a) => [Math.cos(a), -Math.sin(a)];
  const toIn = [d.into[0] - x1, d.into[1] - z1];
  const dot = (a) => leafDir(a)[0] * toIn[0] + leafDir(a)[1] * toIn[1];
  const ang = dot(base + open) > dot(base - open) ? base + open : base - open;
  const hinge = group(x1 + ux * 0.05, z1 + uz * 0.05, ang);
  const leafW = len - 0.1;
  rbox(leafW, DOOR_H - 0.02, 0.04, 0.01, MAT.woodLight, leafW / 2, DOOR_H / 2, 0, hinge);
  cyl(0.012, 0.012, 0.12, MAT.chrome, leafW - 0.08, 1.0, 0.04, hinge).rotation.z = Math.PI / 2;
}
// Janelas: parede abaixo e acima, caixilho de alumínio, vidro e peitoril
const keepFrom = house.children.length;
for (const [x1, z1, x2, z2, y1, y2] of WINDOWS) {
  if (y1 > 0.06) wallBox([x1, z1, x2, z2], y1, 0);
  wallBox([x1, z1, x2, z2], WALL_H - y2, y2);
  const len = Math.abs(x2 - x1), cx = (x1 + x2) / 2;
  const fr = (w, h, x, y) => box(w, h, 0.06, MAT.alu, x, y, z1);
  fr(len, 0.05, cx, y1 + 0.025); fr(len, 0.05, cx, y2 - 0.025); fr(0.05, y2 - y1, x1 + 0.025, (y1 + y2) / 2); fr(0.05, y2 - y1, x2 - 0.025, (y1 + y2) / 2); fr(0.04, y2 - y1, cx, (y1 + y2) / 2);
  const g = box(len - 0.06, y2 - y1 - 0.06, 0.012, MAT.glass, cx, (y1 + y2) / 2, z1); g.castShadow = false;
  if (y1 > 0.06) box(len + 0.06, 0.03, 0.22, MAT.white, cx, y1 - 0.015, z1 + (z1 < 0 ? 0.06 : -0.06));
}
// Porta de vidro de correr (abertura ao longo de x): verga, caixilho preto, folha fixa e folha meio aberta
for (const [x1, z1, x2] of GLASS_DOORS) {
  wallBox([x1, z1, x2, z1], WALL_H - DOOR_H, DOOR_H);
  const w = x2 - x1, cx = (x1 + x2) / 2;
  box(w, 0.04, 0.08, MAT.alu, cx, DOOR_H - 0.02, z1); box(w, 0.02, 0.08, MAT.alu, cx, 0.01, z1);
  for (const x of [x1 + 0.02, x2 - 0.02]) box(0.04, DOOR_H, 0.08, MAT.alu, x, DOOR_H / 2, z1);
  const leaf = w / 2 + 0.03;
  for (const [x, dz] of [[x1 + leaf / 2, -0.025], [x2 - leaf / 2 - 0.12, 0.025]]) {
    const g = box(leaf - 0.04, DOOR_H - 0.08, 0.012, MAT.glass, x, DOOR_H / 2, z1 + dz); g.castShadow = false;
    for (const xx of [x - leaf / 2 + 0.02, x + leaf / 2 - 0.02]) box(0.03, DOOR_H - 0.06, 0.03, MAT.alu, xx, DOOR_H / 2, z1 + dz);
  }
  box(0.02, 0.25, 0.03, MAT.chrome, x2 - leaf - 0.1, 1.0, z1 + 0.05);
}
// Portas de correr: verga, trilho e folha de madeira deslizada por cima da parede
for (const d of SLIDE_DOORS) {
  const [x1, z1, x2, z2] = d.a, len = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / len, uz = (z2 - z1) / len, nx = -uz, nz = ux;
  wallBox(d.a, WALL_H - DOOR_H, DOOR_H);
  const off = d.side * (T / 2 + 0.03), sl = d.slideTo * len * 0.7;
  const cx = (x1 + x2) / 2 + nx * off + ux * sl, cz = (z1 + z2) / 2 + nz * off + uz * sl;
  const rail = box(len * 1.9, 0.04, 0.05, MAT.alu, (x1 + x2) / 2 + nx * off + ux * len * 0.4, DOOR_H + 0.03, (z1 + z2) / 2 + nz * off + uz * len * 0.4); rail.rotation.y = -Math.atan2(uz, ux);
  const leaf = rbox(len + 0.06, DOOR_H - 0.02, 0.035, 0.01, MAT.woodLight, cx, DOOR_H / 2, cz); leaf.rotation.y = -Math.atan2(uz, ux);
  const h = box(0.02, 0.25, 0.03, MAT.chrome, cx - ux * (len / 2 - 0.06) + nx * 0.03 * d.side, 1.0, cz - uz * (len / 2 - 0.06) + nz * 0.03 * d.side); h.rotation.y = -Math.atan2(uz, ux);
}
// Portão da garagem (de correr, em lâminas de alumínio)
if (F.GATE) {
  const [x1, z, x2] = F.GATE, w = x2 - x1, cx = (x1 + x2) / 2;
  box(w, 0.06, 0.08, MAT.alu, cx, 2.2, z); box(w, 0.04, 0.08, MAT.alu, cx, 0.02, z);
  for (let i = 0; i < 26; i++) box(w / 26 - 0.03, 2.16, 0.03, M({ color: '#3b3d42', metalness: 0.5, roughness: 0.45 }), x1 + (w / 26) * (i + 0.5), 1.1, z);
}
for (const [x1, z1, x2, z2, y1, y2] of SIDE_WINDOWS) {
  wallBox([x1, z1, x2, z2], y1, 0); wallBox([x1, z1, x2, z2], WALL_H - y2, y2);
  const len = Math.abs(z2 - z1), cz = (z1 + z2) / 2;
  const fr = (d, h, z, y) => box(0.06, h, d, MAT.alu, x1, y, z);
  fr(len, 0.05, cz, y1 + 0.025); fr(len, 0.05, cz, y2 - 0.025); fr(0.05, y2 - y1, z1 + 0.025, (y1 + y2) / 2); fr(0.05, y2 - y1, z2 - 0.025, (y1 + y2) / 2); fr(0.04, y2 - y1, cz, (y1 + y2) / 2);
  const g = box(0.012, y2 - y1 - 0.06, len - 0.06, MAT.glass, x1, (y1 + y2) / 2, cz); g.castShadow = false;
}

/* ================= Móveis ================= */
function bed(x, z, rot, width, length, duvet, { double = true } = {}) {
  const g = group(x, z, rot);
  // largura em x, comprimento em z; cabeceira em z negativo
  rbox(width + 0.08, 0.28, length + 0.06, 0.03, MAT.wood, 0, 0.14, 0, g);
  rbox(width, 0.24, length - 0.02, 0.07, MAT.linen, 0, 0.4, 0.01, g);
  rbox(width + 0.06, 0.07, length * 0.7, 0.035, MAT.duvet, 0, 0.53, length * 0.14, g);
  rbox(width + 0.08, 0.05, length * 0.22, 0.025, MAT.beige, 0, 0.585, length * 0.3, g); // manta bege no pé da cama
  rbox(width + 0.14, 1.0, 0.08, 0.03, MAT.wood, 0, 0.5, -length / 2 - 0.04, g);
  blob(g, width + 0.5, length + 0.5, 0, 0, 0.9);
  const n = double ? 2 : 1;
  for (let i = 0; i < n; i++) { const px = n === 1 ? 0 : (i - 0.5) * width * 0.5; const p = rbox(width / n - 0.12, 0.13, 0.4, 0.06, MAT.pillow, px, 0.6, -length / 2 + 0.3, g); p.rotation.x = -0.18; }
  for (const cx of double ? [-0.18, 0.18] : [0]) rbox(0.36, 0.12, 0.26, 0.05, MAT.cushion, cx, 0.64, -length / 2 + 0.58, g).rotation.x = -0.25;
  return g;
}
function nightstand(x, z, rot) {
  const g = group(x, z, rot);
  rbox(0.45, 0.5, 0.4, 0.02, MAT.wood, 0, 0.27, 0, g); blob(g, 0.75, 0.7);
  box(0.4, 0.004, 0.005, MAT.black, 0, 0.36, 0.202, g);
  cyl(0.008, 0.008, 0.08, MAT.chrome, 0, 0.42, 0.21, g).rotation.z = Math.PI / 2;
  cyl(0.06, 0.07, 0.03, MAT.white, 0.08, 0.535, -0.05, g);
  cyl(0.012, 0.012, 0.22, MAT.chrome, 0.08, 0.66, -0.05, g);
  const shadeMat = MAT.lamp.clone();
  const shade = cyl(0.08, 0.12, 0.16, shadeMat, 0.08, 0.82, -0.05, g); shade.castShadow = false;
  const l = new THREE.PointLight(0xffb870, 0, 4.5, 1.6); l.position.set(0.08, 0.86, -0.05); g.add(l);
  // halo de luz em volta da cúpula
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffc98a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.scale.set(1.1, 1.1, 1); halo.position.set(0.08, 0.84, -0.05); g.add(halo);
  g.traverse((o) => (o.userData.lamp = 'cabeceira'));
  LAMPS.push({ auto: 'cabeceira', apply: (k) => {
    l.intensity = 3.2 * k; shadeMat.emissiveIntensity = 1.8 * k;
    shadeMat.color.setRGB(0.55 + 0.45 * k, 0.53 + 0.43 * k, 0.5 + 0.36 * k); halo.material.opacity = 0.9 * k;
  } });
  return g;
}
function wardrobe(x, z, rot, width, depth = 0.58, doors = 3, mat = MAT.black) {
  const g = group(x, z, rot);
  const t = hangerTex.clone(); t.needsUpdate = true; t.repeat.set(width / 1.2, 1);
  const top = M({ map: t, roughness: 0.8 });
  mesh(new THREE.BoxGeometry(width, 2.1, depth), [mat, mat, top, mat, mat, mat], 0, 1.05, 0, g);
  blob(g, width + 0.35, depth + 0.35);
  for (let i = 1; i < doors; i++) box(0.006, 2.0, 0.006, MAT.black, -width / 2 + (width / doors) * i, 1.06, depth / 2 + 0.002, g);
  for (let i = 0; i < doors; i++) { const cx = -width / 2 + (width / doors) * (i + 0.5) + (i % 2 ? -1 : 1) * (width / doors / 2 - 0.05); box(0.02, 0.3, 0.025, MAT.chrome, cx, 1.1, depth / 2 + 0.015, g); }
  box(width, 0.06, depth - 0.02, MAT.black, 0, 0.03, 0, g);
  return g;
}
function toilet(x, z, rot) {
  const g = group(x, z, rot);
  const base = mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.36, 32), MAT.ceramic, 0, 0.18, 0.06, g); base.scale.z = 1.4; blob(g, 0.6, 0.75, 0, -0.02, 0.7);
  const bowl = mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.08, 32), MAT.ceramic, 0, 0.4, 0.08, g); bowl.scale.z = 1.25;
  const seat = mesh(new THREE.TorusGeometry(0.15, 0.025, 12, 32), MAT.white, 0, 0.445, 0.08, g); seat.rotation.x = Math.PI / 2; seat.scale.y = 1.25;
  rbox(0.4, 0.36, 0.17, 0.04, MAT.ceramic, 0, 0.6, -0.2, g);
  rbox(0.42, 0.03, 0.19, 0.012, MAT.ceramic, 0, 0.795, -0.2, g);
  cyl(0.02, 0.02, 0.01, MAT.chrome, 0, 0.815, -0.2, g);
  return g;
}
function vanity(x, z, rot, w = 0.6) {
  const g = group(x, z, rot);
  box(w, 0.55, 0.45, MAT.black, 0, 0.5, 0, g); blob(g, w + 0.3, 0.7);
  box(w + 0.02, 0.03, 0.47, MAT.white, 0, 0.79, 0, g);
  const basin = mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.12, 32, 1, true), MAT.ceramic, 0, 0.86, 0.02, g); basin.scale.z = 0.8; basin.material.side = THREE.DoubleSide;
  mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 32), MAT.ceramic, 0, 0.92, 0.02, g).rotation.x = Math.PI / 2;
  cyl(0.014, 0.018, 0.2, MAT.chrome, 0, 0.9, -0.19, g);
  box(0.03, 0.02, 0.13, MAT.chrome, 0, 0.99, -0.13, g);
  box(w - 0.02, 0.75, 0.02, MAT.mirror, 0, 1.55, -0.22, g);
  box(0.12, 0.012, 0.012, MAT.chrome, 0, 0.6, 0.232, g);
  return g;
}
function showerBox(x1, z1, x2, z2, doorSide) {
  const w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const t = tileTex.clone(); t.needsUpdate = true; t.repeat.set(w / 0.6, d / 0.6);
  box(w, 0.03, d, M({ map: t, roughness: 0.3, color: '#dfe4e8' }), cx, 0.015, cz);
  // vidro do box no lado aberto (x1 ou z2)
  const glassPanel = (len, x, z, rot) => { const g = box(len, 1.95, 0.012, MAT.glass, x, 1.0, z); g.rotation.y = rot; g.castShadow = false; const f = box(len, 0.025, 0.03, MAT.chrome, x, 1.985, z); f.rotation.y = rot; };
  if (doorSide === 'x1') glassPanel(d, x1, cz, Math.PI / 2); else glassPanel(w, cx, doorSide === 'z1' ? z1 : z2, 0);
  // chuveiro na parede
  const hx = x2 - 0.08, hz = cz;
  cyl(0.012, 0.012, 0.3, MAT.chrome, hx, 2.05, hz).rotation.z = Math.PI / 2;
  cyl(0.11, 0.11, 0.02, MAT.chrome, hx - 0.15, 1.98, hz);
  cyl(0.03, 0.03, 0.1, MAT.chrome, hx + 0.03, 1.1, hz).rotation.z = Math.PI / 2;
}
function desk(x, z, rot, w = 1.1, d = 0.58) {
  const g = group(x, z, rot);
  rbox(w, 0.035, d, 0.008, MAT.black, 0, 0.74, 0, g); blob(g, w + 0.4, d + 0.4, 0, 0, 0.6);
  for (const sx of [-1, 1]) { box(0.04, 0.72, 0.04, MAT.black, sx * (w / 2 - 0.05), 0.36, -d / 2 + 0.05, g); box(0.04, 0.72, 0.04, MAT.black, sx * (w / 2 - 0.05), 0.36, d / 2 - 0.05, g); }
  // monitor
  box(0.6, 0.35, 0.025, MAT.black, 0, 1.08, -d / 2 + 0.12, g);
  box(0.57, 0.32, 0.005, MAT.screen, 0, 1.08, -d / 2 + 0.136, g);
  box(0.05, 0.16, 0.03, MAT.black, 0, 0.84, -d / 2 + 0.1, g);
  box(0.2, 0.012, 0.14, MAT.black, 0, 0.765, -d / 2 + 0.1, g);
  rbox(0.42, 0.018, 0.13, 0.006, MAT.white, -0.03, 0.765, 0.08, g);
  rbox(0.06, 0.02, 0.1, 0.01, MAT.white, 0.28, 0.768, 0.09, g);
  return g;
}
function officeChair(x, z, rot, mat) {
  const g = group(x, z, rot);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, leg = box(0.3, 0.025, 0.04, MAT.black, Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15, g); leg.rotation.y = -a;
    mesh(new THREE.SphereGeometry(0.03, 12, 8), MAT.black, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29, g);
  }
  cyl(0.025, 0.025, 0.36, MAT.chrome, 0, 0.27, 0, g); blob(g, 0.8, 0.8, 0, 0, 0.6);
  rbox(0.5, 0.08, 0.48, 0.035, mat, 0, 0.48, 0, g);
  const back = rbox(0.46, 0.55, 0.07, 0.035, mat, 0, 0.85, 0.24, g); back.rotation.x = 0.1;
  for (const s of [-1, 1]) { box(0.03, 0.2, 0.03, MAT.black, s * 0.24, 0.6, 0.02, g); rbox(0.06, 0.03, 0.25, 0.012, MAT.black, s * 0.24, 0.71, 0.0, g); }
  return g;
}
function armchair(x, z, rot, mat, s = 1) {
  const g = group(x, z, rot); g.scale.setScalar(s);
  rbox(0.78, 0.3, 0.76, 0.06, mat, 0, 0.27, 0, g); blob(g, 1.1, 1.1);
  rbox(0.62, 0.14, 0.6, 0.06, mat, 0, 0.47, 0.05, g);
  rbox(0.78, 0.5, 0.16, 0.07, mat, 0, 0.62, -0.3, g);
  for (const s of [-1, 1]) rbox(0.13, 0.32, 0.74, 0.06, mat, s * 0.33, 0.55, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.02, 0.015, 0.12, MAT.wood, sx * 0.32, 0.06, sz * 0.3, g);
  return g;
}
function piano(x, z, rot) {
  const g = group(x, z, rot);
  rbox(1.3, 0.12, 0.32, 0.02, MAT.black, 0, 0.78, 0, g); blob(g, 1.6, 0.6, 0, 0, 0.7);
  const keys = 36;
  for (let i = 0; i < keys; i++) { box(1.18 / keys - 0.003, 0.02, 0.15, MAT.white, -0.59 + (1.18 / keys) * (i + 0.5), 0.85, 0.07, g); }
  for (let i = 0; i < keys - 1; i++) { if ([2, 6].includes(i % 7)) continue; box(0.018, 0.025, 0.09, MAT.black, -0.59 + (1.18 / keys) * (i + 1), 0.865, 0.04, g); }
  for (const s of [-1, 1]) box(0.04, 0.72, 0.28, MAT.black, s * 0.6, 0.36, 0, g);
  return g;
}
function bookcase(x, z, rot, w, h, d, mat) {
  const g = group(x, z, rot);
  box(w, h, d, mat, 0, h / 2, 0, g); blob(g, w + 0.35, d + 0.35);
  const rows = Math.round(h / 0.35);
  for (let i = 1; i < rows; i++) {
    box(w - 0.04, 0.3, d - 0.04, M({ color: '#2a2a2e' }), 0, (h / rows) * i - 0.16, 0.025, g);
    for (let k = 0; k < 4; k++) box(0.04, 0.2 + rnd() * 0.06, 0.18, M({ color: ['#c9b79c', '#e9e4da', '#8a7a66', '#d8cbb5'][k] }), -w / 2 + 0.1 + k * 0.06, (h / rows) * i - 0.2, 0.02, g);
  }
  return g;
}
/** Rack baixo com TV de 50" presa na parede atrás dele. */
function rackTV(x, z, rot, w = 1.8) {
  const g = group(x, z, rot);
  rbox(w, 0.45, 0.42, 0.015, MAT.wood, 0, 0.26, 0, g); blob(g, w + 0.3, 0.75);
  for (let i = 1; i < 3; i++) box(0.006, 0.36, 0.005, MAT.black, -w / 2 + (w / 3) * i, 0.27, 0.212, g);
  for (const sx of [-1, 1]) box(0.04, 0.05, 0.36, MAT.black, sx * (w / 2 - 0.1), 0.025, 0, g);
  box(0.3, 0.06, 0.18, MAT.black, -0.45, 0.515, 0, g); // aparelho em cima
  const pl = plant(0, 0, 0.55); g.add(pl); pl.position.set(w / 2 - 0.2, 0.48, 0);
  // TV 50": 1,11 x 0,64 m, a 1,3 m do chão (centro), na parede
  const tv = new THREE.Group(); tv.position.set(0, 1.32, -0.18); g.add(tv);
  rbox(1.12, 0.65, 0.035, 0.008, MAT.black, 0, 0, 0, tv);
  box(1.09, 0.62, 0.004, MAT.screen, 0, 0, 0.019, tv);
  tv.traverse((o) => (o.userData.keep = true));
  return g;
}
/** Berço branco com grades. */
function crib(x, z, rot, w = 0.72, l = 1.32) {
  const g = group(x, z, rot);
  blob(g, w + 0.35, l + 0.35);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, 0.92, 0.05, MAT.white, sx * (w / 2), 0.46, sz * (l / 2), g);
  box(w, 0.04, l, MAT.white, 0, 0.3, 0, g);
  rbox(w - 0.06, 0.1, l - 0.06, 0.03, MAT.linen, 0, 0.37, 0, g);
  rbox(w - 0.1, 0.03, l * 0.55, 0.012, MAT.beige, 0, 0.43, l * 0.15, g);
  rbox(0.18, 0.12, 0.14, 0.05, MAT.cushion, 0.1, 0.48, -l / 2 + 0.2, g); // bichinho de pelúcia
  for (const sx of [-1, 1]) { box(0.04, 0.04, l, MAT.white, sx * (w / 2), 0.9, 0, g); for (let i = 1; i < 11; i++) box(0.02, 0.56, 0.02, MAT.white, sx * (w / 2), 0.6, -l / 2 + (l / 11) * i, g); }
  for (const sz of [-1, 1]) { box(w, 0.04, 0.04, MAT.white, 0, 0.9, sz * (l / 2), g); for (let i = 1; i < 6; i++) box(0.02, 0.56, 0.02, MAT.white, -w / 2 + (w / 6) * i, 0.6, sz * (l / 2), g); }
  return g;
}
/** Cômoda com trocador em cima. */
function changer(x, z, rot, w = 1.0, d = 0.5) {
  const g = group(x, z, rot);
  box(w, 0.86, d, MAT.white, 0, 0.45, 0, g); blob(g, w + 0.3, d + 0.35);
  for (let i = 0; i < 3; i++) { box(w - 0.06, 0.004, 0.004, MAT.black, 0, 0.3 + i * 0.25, d / 2 + 0.002, g); rbox(0.12, 0.02, 0.02, 0.008, MAT.wood, 0, 0.2 + i * 0.25, d / 2 + 0.012, g); }
  rbox(w * 0.75, 0.08, d - 0.06, 0.035, MAT.beige, -w * 0.1, 0.92, 0, g);
  box(0.12, 0.14, 0.1, MAT.white, w / 2 - 0.1, 0.95, -0.05, g);
  return g;
}
/** Fita de LED na parede (ao longo de z), com brilho na parede e luz no berço. */
function ledStrip(x, z, len, y) {
  const g = group(x, z);
  const col = new THREE.Color('#ffb98c');
  box(0.012, 0.018, len, MAT.white, 0, y, 0, g); // perfil de alumínio
  const ledMat = new THREE.MeshStandardMaterial({ color: '#fff3e6', emissive: col, emissiveIntensity: 0, roughness: 0.4 });
  const led = box(0.006, 0.008, len - 0.02, ledMat, -0.008, y - 0.006, 0, g); led.castShadow = false;
  // brilho na parede (faixa suave acima e abaixo da fita)
  const washMat = new THREE.MeshBasicMaterial({ map: washTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.5, 0.9), washMat); wash.rotation.y = -Math.PI / 2; wash.position.set(-0.004, y - 0.08, 0); g.add(wash);
  const lights = [-0.4, 0.4].map((dz) => { const l = new THREE.PointLight(col, 0, 3.2, 1.7); l.position.set(-0.15, y - 0.05, dz * len); g.add(l); return l; });
  g.traverse((o) => { o.userData.lamp = 'led-luiza'; o.userData.keep = true; });
  LAMPS.push({ auto: 'led-luiza', apply: (k) => { ledMat.emissiveIntensity = 2.4 * k; washMat.opacity = 0.75 * k; for (const l of lights) l.intensity = 2.2 * k; } });
  return g;
}
/** Ventilador de coluna (virado para a cama). As pás giram quando a automação “Ventilador” está ligada. */
function standFan(x, z) {
  const g = group(x, z, Math.PI / 2), wht = M({ color: '#f2f3f5', roughness: 0.4 }), gry = M({ color: '#9aa0a8', metalness: 0.6, roughness: 0.3 });
  cyl(0.17, 0.19, 0.04, wht, 0, 0.02, 0, g); blob(g, 0.55, 0.55);
  cyl(0.018, 0.018, 1.05, gry, 0, 0.56, 0, g);
  rbox(0.13, 0.15, 0.2, 0.04, wht, 0, 1.12, -0.06, g);                              // motor
  const head = new THREE.Group(); head.position.set(0, 1.12, 0.08); g.add(head);
  const cage = mesh(new THREE.TorusGeometry(0.22, 0.008, 6, 40), gry, 0, 0, 0.02, head); cage.castShadow = false;
  const cage2 = mesh(new THREE.TorusGeometry(0.22, 0.008, 6, 40), gry, 0, 0, -0.06, head); cage2.castShadow = false;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const r = box(0.004, 0.44, 0.004, gry, 0, 0, 0.03, head); r.rotation.z = a; r.castShadow = false; }
  const rotor = new THREE.Group(); rotor.position.z = -0.02; head.add(rotor);
  mesh(new THREE.SphereGeometry(0.035, 16, 10), wht, 0, 0, 0.01, rotor);
  for (let i = 0; i < 3; i++) { const bl = mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshStandardMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 0, 0, 0, rotor); bl.scale.set(0.55, 1, 1); bl.position.set(Math.cos(i * 2.094) * 0.1, Math.sin(i * 2.094) * 0.1, 0); bl.rotation.set(0, 0.35, i * 2.094 - Math.PI / 2); }
  g.traverse((o) => { o.userData.lamp = 'ventilador'; o.userData.keep = true; });
  let speed = 0;
  LAMPS.push({ auto: 'ventilador', apply: (k) => { speed = k; } });
  // ondas de vento saindo do ventilador em direção à cama (arcos “)))” que se abrem e somem)
  const waveMat = () => new THREE.MeshBasicMaterial({ color: '#bfe3ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const waves = [];
  for (let i = 0; i < 5; i++) for (const hy of [0.95, 1.25]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 40, 1, -Math.PI / 2 - 0.55, 1.1), waveMat());
    m.rotation.x = -Math.PI / 2; m.position.set(0, hy, 0.1); m.renderOrder = 4; m.raycast = () => {}; g.add(m);
    waves.push({ m, ph: i / 5 });
  }
  let tt = 0;
  FANS.push((dt) => {
    rotor.rotation.z -= speed * dt * 0.025;
    tt += dt / 1000 * 0.55;
    for (const w of waves) {
      const t = (tt + w.ph) % 1, r = 0.22 + t * 1.45;
      w.m.scale.set(r, r, 1);
      w.m.material.opacity = speed * Math.sin(Math.PI * t) * 0.75;
      w.m.visible = speed > 0.01;
    }
    return speed > 0.01;
  });
  return g;
}
function plant(x, z, s = 1) {
  const g = group(x, z);
  cyl(0.11 * s, 0.08 * s, 0.24 * s, MAT.pot, 0, 0.12 * s, 0, g);
  for (let i = 0; i < 9; i++) { const a = rnd() * Math.PI * 2, r = rnd() * 0.08 * s; mesh(new THREE.SphereGeometry((0.07 + rnd() * 0.05) * s, 10, 8), MAT.leaf, Math.cos(a) * r, (0.3 + rnd() * 0.25) * s, Math.sin(a) * r, g); }
  return g;
}
function rug(x, z, w, d, rot = 0) { const r = rbox(w, 0.012, d, 0.005, MAT.rug, x, 0.006, z); r.rotation.y = rot; r.castShadow = false; }
function stairs(x1, z1, x2, z2, n) {
  const step = (z2 - z1) / n;
  for (let i = 0; i < n; i++) { const y = -0.17 - i * 0.17; rbox(x2 - x1 - 0.02, 0.04, step + 0.02, 0.008, MAT.stair, (x1 + x2) / 2, y, z1 + step * (i + 0.5)); }
  // guarda-corpo de vidro com corrimão
  const g = box(0.012, 0.95, z2 - z1, MAT.glass, x2, 0.5, (z1 + z2) / 2); g.castShadow = false;
  const rail = cyl(0.022, 0.022, z2 - z1, MAT.wood, x2, 1.0, (z1 + z2) / 2); rail.rotation.x = Math.PI / 2;
  for (let i = 0; i <= 4; i++) cyl(0.012, 0.012, 0.95, MAT.chrome, x2, 0.5, z1 + ((z2 - z1) / 4) * i);
}

/** Escada que sobe (térreo): degraus do chão até o andar de cima, ao longo de z; depósito embaixo. */
function stairsUp(x1, z1, x2, z2, n, upToward = -1, railX = x2, mat = MAT.stair) {
  const step = (z2 - z1) / n;
  for (let i = 0; i < n; i++) {
    const k = upToward < 0 ? n - 1 - i : i; // degrau i sobe conforme se anda no sentido `upToward`
    const y = 0.17 * (k + 1);
    const st = rbox(x2 - x1 - 0.02, 0.06, step + 0.03, 0.006, mat, (x1 + x2) / 2, y, z1 + step * (i + 0.5));
    if (z1 + step * (i + 0.5) < 0.75 && FLOOR === 'terreo') st.userData.overLavabo = true; // degraus por cima do lavabo
  }
  // corrimão branco acompanhando a subida
  for (let i = 0; i <= 4; i++) {
    const z = z1 + ((z2 - z1) / 4) * i, k = upToward < 0 ? (z2 - z) / (z2 - z1) : (z - z1) / (z2 - z1);
    const top = 0.17 * n * k + 0.9; cyl(0.015, 0.015, top, MAT.white, railX, top / 2, z);
  }
}
function fridge(x, z, rot) {
  const g = group(x, z, rot);
  rbox(0.68, 1.78, 0.68, 0.03, M({ color: '#a7a9ad', metalness: 0.6, roughness: 0.35 }), 0, 0.89, 0, g); blob(g, 0.95, 0.95);
  box(0.66, 0.006, 0.006, MAT.black, 0, 1.25, 0.342, g);
  for (const y of [0.95, 1.55]) box(0.02, 0.32, 0.03, MAT.chrome, -0.26, y, 0.36, g);
  return g;
}
/** Bancada de cozinha ao longo de z (encostada na parede x=xw): armário, tampo escuro, pia e cooktop. */
function counter(xw, z1, z2, depth = 0.6) {
  const x = xw - Math.sign(xw) * depth / 2, len = z2 - z1, cz = (z1 + z2) / 2;
  box(depth, 0.86, len, M({ color: '#cfc6b2', roughness: 0.6 }), x, 0.43, cz); blob(house, depth + 0.3, len + 0.3, x, cz);
  box(depth + 0.03, 0.035, len + 0.02, MAT.black, x, 0.88, cz);
  for (let zz = z1 + 0.5; zz < z2 - 0.1; zz += 0.5) box(0.005, 0.7, 0.005, MAT.black, x - Math.sign(xw) * (depth / 2 + 0.002), 0.42, zz);
  // armários de cima
  box(0.35, 0.7, len, M({ color: '#cfc6b2', roughness: 0.6 }), xw - Math.sign(xw) * 0.175, 1.95, cz);
  return { x, cz };
}
function sinkAt(x, z) { box(0.38, 0.03, 0.5, MAT.chrome, x, 0.9, z); cyl(0.015, 0.015, 0.3, MAT.chrome, x + 0.2, 1.05, z).rotation.z = 0.0; }
function cooktop(x, z) { box(0.5, 0.012, 0.58, MAT.black, x, 0.905, z); for (const [a, b] of [[-0.12, -0.14], [0.12, -0.14], [-0.12, 0.14], [0.12, 0.14]]) cyl(0.07, 0.07, 0.005, M({ color: '#3a3a3e' }), x + a, 0.913, z + b); }
function washerMachine(x, z, rot) {
  const g = group(x, z, rot);
  rbox(0.6, 0.85, 0.6, 0.03, M({ color: '#cfd2d6', metalness: 0.3, roughness: 0.4 }), 0, 0.425, 0, g); blob(g, 0.9, 0.9);
  const door = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 32), M({ color: '#2c3038', roughness: 0.1, metalness: 0.4 }), 0, 0.42, 0.3, g); door.rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 32), MAT.chrome, 0, 0.42, 0.31, g);
  box(0.55, 0.1, 0.02, MAT.black, 0, 0.78, 0.3, g);
  return g;
}
function litterBox(x, z, rot = -Math.PI / 2) { // caixa de areia automática (redonda)
  const g = group(x, z, rot); blob(g, 0.75, 0.75);
  rbox(0.52, 0.1, 0.52, 0.05, MAT.white, 0, 0.05, 0, g);
  mesh(new THREE.SphereGeometry(0.27, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), MAT.white, 0, 0.1, 0, g);
  const hole = mesh(new THREE.CircleGeometry(0.12, 24), MAT.black, 0, 0.22, 0.25, g); hole.rotation.x = -0.35;
  return g;
}
function sofa(x, z, rot, len, mat) {
  const g = group(x, z, rot);
  rbox(len, 0.42, 0.9, 0.06, mat, 0, 0.25, 0, g); blob(g, len + 0.3, 1.2);
  rbox(len, 0.48, 0.2, 0.06, mat, 0, 0.6, -0.35, g);
  for (const s of [-1, 1]) rbox(0.18, 0.6, 0.9, 0.06, mat, s * (len / 2 - 0.09), 0.36, 0, g);
  for (let i = 0; i < 3; i++) rbox((len - 0.4) / 3 - 0.03, 0.12, 0.62, 0.05, mat, -len / 2 + 0.2 + ((len - 0.4) / 3) * (i + 0.5), 0.5, 0.08, g);
  return g;
}
/** Painel de madeira com a TV presa nele, móvel baixo embaixo, luminária redonda à direita (luz para baixo)
 *  e, embaixo da luminária, o robô aspirador Xiaomi na base com torre de aspiração. Local +x = lado direito. */
function tvPanel(x, z, rot, w = 2.2) {
  const g = group(x, z, rot);
  box(w, 2.3, 0.04, MAT.wood, 0, 1.15, -0.02, g);
  // móvel (rack) com portas, deslocado para a esquerda: à direita fica o robô
  const rw = w - 0.62, rx = -0.31;
  rbox(rw, 0.45, 0.42, 0.015, MAT.white, rx, 0.3, 0.21, g); blob(g, rw + 0.3, 0.8, rx, 0.21);
  for (let i = 1; i < 3; i++) box(0.005, 0.38, 0.005, MAT.black, rx - rw / 2 + (rw / 3) * i, 0.3, 0.422, g);
  for (const sx of [-1, 1]) box(0.04, 0.08, 0.36, MAT.black, rx + sx * (rw / 2 - 0.1), 0.04, 0.21, g);
  // TV presa no painel
  const tv = new THREE.Group(); tv.position.set(rx, 1.2, 0.04); g.add(tv);
  rbox(1.23, 0.71, 0.035, 0.008, MAT.black, 0, 0, 0, tv); box(1.2, 0.68, 0.004, MAT.screen, 0, 0, 0.019, tv);
  tv.traverse((o) => (o.userData.keep = true));
  // Luminária pendente (automação “Luminária”: liga/desliga, intensidade e cor), à direita do painel
  const lx = w / 2 - 0.3, pz = 0.38;
  cyl(0.05, 0.05, 0.02, MAT.black, lx, 2.58, pz, g);                                   // canopla
  cyl(0.004, 0.004, 0.86, MAT.black, lx, 2.15, pz, g);                                 // fio
  const shade = mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.2, 32, 1, true), M({ color: '#151517', roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide }), lx, 1.62, pz, g);
  const bulbM = M({ color: '#fff6e6', emissive: '#ffd8a8', emissiveIntensity: 1.6 });
  mesh(new THREE.SphereGeometry(0.045, 16, 12), bulbM, lx, 1.55, pz, g);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), new THREE.MeshBasicMaterial({ map: haloTex, color: 0xffd8a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(lx, 0.012, pz); g.add(pool);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffd8a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  halo.scale.set(0.5, 0.5, 1); halo.position.set(lx, 1.52, pz); g.add(halo);
  const sp = new THREE.SpotLight(0xffd8a8, 5, 3, 0.6, 0.6, 1.4); sp.position.set(lx, 1.55, pz); g.add(sp);
  sp.target.position.set(lx, 0, pz + 0.05); g.add(sp.target);
  g.children.slice(-8).forEach((o) => { o.userData.lamp = 'luminaria'; o.userData.keep = true; });
  LAMPS.push({ auto: 'luminaria', apply: (k, a) => {
    const c = new THREE.Color(a?.hex ?? '#ffd8a8');
    bulbM.emissive.copy(c); bulbM.emissiveIntensity = 2 * k; sp.color.copy(c); sp.intensity = 7 * k;
    pool.material.color.copy(c); pool.material.opacity = 0.6 * k; halo.material.color.copy(c); halo.material.opacity = 0.7 * k;
  } });
  // robô aspirador Xiaomi na base com torre de aspiração (embaixo da luminária)
  const white = M({ color: '#f3f4f6', roughness: 0.35 });
  rbox(0.34, 0.42, 0.26, 0.04, white, lx, 0.21, 0.13, g); blob(g, 0.6, 0.6, lx, 0.25);    // torre
  box(0.36, 0.02, 0.3, white, lx, 0.01, 0.33, g);                                            // rampa
  rbox(0.2, 0.02, 0.12, 0.01, M({ color: '#2b2d31' }), lx, 0.43, 0.13, g);                   // tampa
  const robot = cyl(0.175, 0.175, 0.09, white, lx, 0.07, 0.5, g, 40);                        // robô
  cyl(0.045, 0.045, 0.02, M({ color: '#d9dbe0' }), lx, 0.125, 0.47, g);                      // laser (LDS)
  box(0.18, 0.012, 0.01, MAT.black, lx, 0.08, 0.675, g);                                     // para-choque
  return g;
}
function catHouse(x, z, rot) { // casinha de gato
  const g = group(x, z, rot);
  box(0.5, 0.35, 0.45, M({ color: '#5a4a3c', roughness: 0.9 }), 0, 0.175, 0, g); blob(g, 0.8, 0.75);
  for (const s of [-1, 1]) { const r = box(0.04, 0.36, 0.5, M({ color: '#3e332a' }), s * 0.13, 0.47, 0, g); r.rotation.z = s * 0.85; }
  const h = mesh(new THREE.CircleGeometry(0.1, 20), MAT.black, 0, 0.17, 0.226, g);
  return g;
}
/** Churrasqueira de alvenaria encostada na parede x=xw (ao longo de z). */
function bbq(xw, z1, z2) {
  const d = 0.62, x = xw - Math.sign(xw) * d / 2, len = z2 - z1, cz = (z1 + z2) / 2;
  const brick = M({ map: brickTex, roughness: 0.95 });
  box(d, 0.9, len, brick, x, 0.45, cz); blob(house, d + 0.3, len + 0.3, x, cz);
  box(d - 0.12, 0.5, len - 0.16, MAT.black, x - Math.sign(xw) * 0.07, 0.62, cz);  // boca
  box(d + 0.04, 0.05, len + 0.04, M({ color: '#3a3a3c' }), x, 0.92, cz);           // tampo de granito
  for (let i = 0; i < 6; i++) box(0.005, 0.01, len - 0.25, MAT.chrome, x - 0.2 + i * 0.08, 0.86, cz);
  box(d * 0.75, 1.3, len * 0.75, brick, xw - Math.sign(xw) * d * 0.4, 1.9, cz);      // coifa / chaminé
}
/** Pia de área (tampo sobre pés) com a caixa de areia automática embaixo. */
function serviceSink(xw, z1, z2) {
  const d = 0.58, x = xw - Math.sign(xw) * d / 2, len = z2 - z1, cz = (z1 + z2) / 2;
  box(d + 0.02, 0.05, len, M({ color: '#3a3a3c', roughness: 0.4 }), x, 0.9, cz);
  for (const zz of [z1 + 0.04, z2 - 0.04]) box(0.04, 0.88, 0.04, MAT.chrome, x - Math.sign(xw) * (d / 2 - 0.04), 0.44, zz);
  box(0.4, 0.03, 0.42, MAT.chrome, x, 0.93, cz); cyl(0.015, 0.015, 0.3, MAT.chrome, xw - Math.sign(xw) * 0.06, 1.05, cz);
  litterBox(x - Math.sign(xw) * 0.02, cz);
}
/** Tanque de lavar roupa. */
function laundryTub(xw, cz, w = 0.6) {
  const d = 0.55, x = xw - Math.sign(xw) * d / 2;
  box(0.18, 0.75, 0.18, MAT.white, x, 0.375, cz); blob(house, 0.8, 0.8, x, cz);
  box(d, 0.28, w, MAT.ceramic, x, 0.88, cz); box(d - 0.12, 0.05, w - 0.12, M({ color: '#c9ced3' }), x - Math.sign(xw) * 0.04, 1.0, cz);
  cyl(0.015, 0.015, 0.25, MAT.chrome, xw - Math.sign(xw) * 0.05, 1.12, cz);
}
/** Peças da parede do fundo da área de serviço (frente virada para a casa, +z). */
const BACK = -7.14 + T / 2;
function bbqBack(x1, x2) {
  const w = x2 - x1, g = group((x1 + x2) / 2, BACK + 0.31), brick = M({ map: brickTex, roughness: 0.95 });
  box(w, 0.9, 0.62, brick, 0, 0.45, 0, g); blob(g, w + 0.3, 0.9);
  box(w - 0.16, 0.5, 0.02, MAT.black, 0, 0.6, 0.31, g);
  box(w + 0.04, 0.05, 0.66, M({ color: '#3a3a3c' }), 0, 0.92, 0, g);
  for (let i = 0; i < 6; i++) box(w - 0.25, 0.01, 0.005, MAT.chrome, 0, 0.86, -0.2 + i * 0.08, g);
  // coifa em tijolinho afunilando e chaminé subindo acima do telhado
  box(w, 0.45, 0.62, brick, 0, 1.35, 0, g);
  box(w * 0.7, 0.4, 0.45, brick, 0, 1.77, -0.08, g);
  const ch = box(0.36, 1.6, 0.32, brick, 0, 2.75, -0.14, g); ch.userData.keep = true;
  const cap = box(0.48, 0.06, 0.44, M({ color: '#3a3a3c' }), 0, 3.58, -0.14, g); cap.userData.keep = true;
}
/** Armário aéreo na parede do fundo. */
function backCabinet(x1, x2) {
  const w = x2 - x1, g = group((x1 + x2) / 2, BACK + 0.18), mat = M({ color: '#f1efea', roughness: 0.5 });
  box(w, 0.7, 0.35, mat, 0, 1.95, 0, g);
  const n = Math.max(2, Math.round(w / 0.45));
  for (let i = 1; i < n; i++) box(0.005, 0.66, 0.005, MAT.black, -w / 2 + (w / n) * i, 1.95, 0.177, g);
  for (let i = 0; i < n; i++) box(0.12, 0.015, 0.02, MAT.chrome, -w / 2 + (w / n) * (i + 0.5), 1.66, 0.185, g);
}
function sinkBack(x1, x2) {
  const w = x2 - x1, g = group((x1 + x2) / 2, BACK + 0.29);
  box(w, 0.05, 0.6, M({ color: '#3a3a3c', roughness: 0.4 }), 0, 0.9, 0, g);
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) box(0.04, 0.88, 0.04, MAT.chrome, x, 0.44, 0.26, g);
  box(0.42, 0.03, 0.4, MAT.chrome, 0, 0.93, 0.02, g); cyl(0.015, 0.015, 0.3, MAT.chrome, 0, 1.05, -0.24, g);
  litterBox((x1 + x2) / 2, BACK + 0.3, 0);   // banheiro automático dos gatos embaixo da pia
}
function tubBack(cx) {
  const g = group(cx, BACK + 0.28);
  box(0.18, 0.75, 0.18, MAT.white, 0, 0.375, 0, g); blob(g, 0.8, 0.8);
  box(0.55, 0.28, 0.55, MAT.ceramic, 0, 0.88, 0, g); box(0.43, 0.05, 0.43, M({ color: '#c9ced3' }), 0, 1.0, 0.03, g);
  cyl(0.015, 0.015, 0.25, MAT.chrome, 0, 1.12, -0.22, g);
}
/** Peugeot 2008 (1ª geração): carroceria “lofted” — cortes transversais suaves ao longo do comprimento
 *  (como num modelo de carro real), com vidros, colunas, molduras pretas, faróis e lanternas pintados
 *  na própria superfície. Rodas de liga separadas. Frente para +z. */
function car2008(x, z, color = '#b9bcc2') {
  const g = group(x, z); blob(g, 2.4, 5.0, 0, 0, 1.1);
  const L = 2.08;
  // curva suave por pontos (s → valor)
  const prof = (pts) => { const tab = new THREE.SplineCurve(pts.map(([a, b]) => new THREE.Vector2(a, b))).getSpacedPoints(800).sort((p, q) => p.x - q.x); return (sv) => { let i = 1; while (i < tab.length - 1 && tab[i].x < sv) i++; const a = tab[i - 1], b = tab[i], t = b.x === a.x ? 0 : Math.min(1, Math.max(0, (sv - a.x) / (b.x - a.x))); return a.y + (b.y - a.y) * t; }; };
  const yTop = prof([[-2.08, 0.72], [-2.03, 1.0], [-1.92, 1.36], [-1.7, 1.52], [-1.0, 1.585], [-0.2, 1.58], [0.15, 1.52], [0.5, 1.27], [0.9, 1.02], [1.4, 0.95], [1.8, 0.9], [2.0, 0.82], [2.09, 0.62]]);
  const yBelt = prof([[-2.08, 0.72], [-2.03, 0.96], [-1.9, 1.02], [-1.2, 1.03], [0.0, 1.01], [0.9, 0.99], [1.4, 0.94], [1.8, 0.89], [2.0, 0.81], [2.09, 0.62]]);
  const yBot = prof([[-2.09, 0.5], [-2.03, 0.3], [-1.85, 0.24], [1.8, 0.23], [2.02, 0.3], [2.09, 0.48]]);
  const hw = prof([[-2.09, 0.5], [-2.03, 0.76], [-1.85, 0.855], [-1.3, 0.875], [1.3, 0.875], [1.7, 0.86], [1.95, 0.79], [2.06, 0.66], [2.1, 0.45]]);
  const hwTop = prof([[-2.09, 0.4], [-1.95, 0.56], [-1.6, 0.63], [0.0, 0.65], [0.6, 0.68], [0.95, 0.74], [2.1, 0.5]]);
  const K = 150, NS = 34, ring = 2 * NS;
  const verts = [], cols = [], idx = [];
  const C = {
    paint: new THREE.Color(color).convertSRGBToLinear(), black: new THREE.Color('#151618').convertSRGBToLinear(),
    glass: new THREE.Color('#0d1218').convertSRGBToLinear(), head: new THREE.Color('#e9eef5').convertSRGBToLinear(),
    chrome: new THREE.Color('#d0d4da').convertSRGBToLinear(), tail: new THREE.Color('#8e0c12').convertSRGBToLinear(),
  };
  for (let i = 0; i <= K; i++) {
    const sv = -L + (2 * L * i) / K;
    const yb = yBot(sv), yl = yBelt(sv), yt = Math.max(yTop(sv), yl + 0.005), w = hw(sv), wt = Math.min(hwTop(sv), w * 0.85);
    // meia seção (de baixo-centro até topo-centro), suavizada
    const ctrl = [
      [0, yb], [w * 0.75, yb], [w * 0.97, yb + 0.07], [w, Math.min(0.55, yl - 0.05)], [w * 0.985, yl - 0.02], [w * 0.95, yl + 0.01],
      [wt + (w * 0.95 - wt) * 0.35, yl + (yt - yl) * 0.55], [wt, yt - 0.03], [wt * 0.55, yt], [0, yt + 0.004],
    ];
    const half = new THREE.SplineCurve(ctrl.map(([a, b]) => new THREE.Vector2(a, b))).getPoints(NS - 1);
    const sec = [...half, ...half.slice().reverse().map((p) => new THREE.Vector2(-p.x, p.y))];
    for (const p of sec) {
      verts.push(p.x, p.y, sv);
      // pintura por regiões
      const yy = p.y, ww = Math.abs(p.x), green = yy > yl + 0.03 && yt - yl > 0.12;
      let c = C.paint;
      const arch = (wz) => Math.hypot(sv - wz, yy - 0.34) < 0.5 && ww > w * 0.85;
      if (yy < 0.42 || arch(1.3) || arch(-1.3)) c = C.black;
      if (green) {
        const side = ww > wt * 0.9, roof = sv > -1.78 && sv < 0.14 && yy > yt - 0.035 && ww < wt * 0.92;
        const pillarA = sv > 0.12 && sv < 0.22, pillarB = sv > -0.52 && sv < -0.42, pillarC = sv > -1.78 && sv < -1.6;
        if (roof) c = C.paint;
        else if (sv > 0.18) c = C.glass;                                           // para-brisa
        else if (sv < -1.8) c = C.glass;                                           // vidro traseiro
        else if (side && !pillarA && !pillarB && !pillarC && yy < yt - 0.06) c = C.glass; // janelas
        else if (pillarB) c = C.black;
        if (Math.abs(yy - (yl + 0.035)) < 0.012 && side) c = C.chrome;            // friso da janela
      }
      if (sv > 1.9 && yy > 0.66 && yy < 0.8 && ww > 0.34 && ww > w * 0.55 && (sv > 2.0 || ww > w * 0.8)) c = C.head; // faróis (na quina, não no capô)
      if (sv > 2.0 && yy > 0.42 && yy < 0.66 && ww < 0.48) c = C.black;                    // grade inferior
      if (sv > 2.02 && yy > 0.7 && yy < 0.78 && ww < 0.32) c = C.black;                    // grade superior
      if (sv < -1.94 && yy > 0.78 && yy < 0.98 && ww > 0.38) c = C.tail;                   // lanternas
      if (sv < -2.0 && yy > 0.5 && yy < 0.62 && ww < 0.3) c = C.chrome;                    // placa
      cols.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < K; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + ((j + 1) % ring), c2 = (i + 1) * ring + j, d = (i + 1) * ring + ((j + 1) % ring);
    idx.push(a, c2, b, b, c2, d);
  }
  // tampas das pontas
  for (const i of [0, K]) { const cIdx = verts.length / 3; let cy = 0; for (let j = 0; j < ring; j++) cy += verts[(i * ring + j) * 3 + 1]; verts.push(0, cy / ring, i ? L : -L); const cc = i ? C.black : C.black; cols.push(cc.r, cc.g, cc.b); for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + ((j + 1) % ring); idx.push(...(i ? [a, b, cIdx] : [b, a, cIdx])); } }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, metalness: 0.35, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.18, side: THREE.DoubleSide }));
  body.castShadow = body.receiveShadow = true;
  const car = new THREE.Group(); car.add(body);
  const add = (geo2, mat, px, py, pz, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo2, mat); m.position.set(px, py, pz); m.rotation.set(rx, ry, rz); m.castShadow = true; car.add(m); return m; };
  const blackM = M({ color: '#151618', roughness: 0.55 }), railM = M({ color: '#c9ccd1', metalness: 0.9, roughness: 0.2 });
  for (const sd of [-1, 1]) {
    // rack de teto
    add(new THREE.CylinderGeometry(0.016, 0.016, 1.45, 10), railM, sd * 0.55, 1.635, -0.75, Math.PI / 2);
    for (const zz of [-0.05, -1.45]) add(new RoundedBoxGeometry(0.04, 0.05, 0.1, 2, 0.015), blackM, sd * 0.55, 1.6, zz);
    // retrovisores (capa preta)
    add(new RoundedBoxGeometry(0.2, 0.12, 0.13, 3, 0.05), blackM, sd * 0.94, 1.07, 0.62);
    // maçanetas
    for (const zz of [0.0, -0.95]) add(new RoundedBoxGeometry(0.02, 0.03, 0.14, 2, 0.01), railM, sd * 0.875, 0.92, zz);
    // rodas
    for (const wz of [1.3, -1.3]) {
      const wg = new THREE.Group(); wg.position.set(sd * 0.76, 0.34, wz); wg.rotation.y = Math.PI / 2; car.add(wg);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.1, 16, 40), M({ color: '#111113', roughness: 0.92 })); tire.scale.z = 1.15; tire.castShadow = true; wg.add(tire);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.2, 36), M({ color: '#26282c', metalness: 0.6, roughness: 0.4 })); barrel.rotation.x = Math.PI / 2; wg.add(barrel);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.015, 40), M({ color: '#cfd3d8', metalness: 0.95, roughness: 0.18 })); face.rotation.x = Math.PI / 2; face.position.z = sd * 0.1; wg.add(face);
      for (let k = 0; k < 10; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.02), M({ color: '#1d1f22' })); const a2 = k * Math.PI / 5; sp.position.set(Math.cos(a2) * 0.12, Math.sin(a2) * 0.12, sd * 0.11); sp.rotation.z = a2 - Math.PI / 2; sp.scale.x = k % 2 ? 0.6 : 1; wg.add(sp); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), M({ color: '#9aa0a8', metalness: 1, roughness: 0.2 })); hub.rotation.x = Math.PI / 2; hub.position.z = sd * 0.12; wg.add(hub);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 24), M({ color: '#5b5f66', metalness: 0.8, roughness: 0.4 })); disc.rotation.x = Math.PI / 2; disc.position.z = sd * 0.06; wg.add(disc);
    }
  }
  // emblema e faróis de neblina
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 20), railM, 0, 0.74, 2.085, Math.PI / 2);
  for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20), M({ color: '#f1f4f8', emissive: '#cfe0ff', emissiveIntensity: 0.3 }), sd * 0.62, 0.45, 2.04, Math.PI / 2);
  g.add(car);
  return g;
}
/** Mesa de jantar (comprida em z) com 4 cadeiras: duas do lado da sala e uma em cada cabeceira. */
function diningSet(cx, cz, w = 0.8, l = 1.2) {
  const wood = MAT.wood, g = group(cx, cz); blob(g, w + 1.0, l + 1.2, 0, 0, 0.8);
  // tampo de vidro branco leitoso
  rbox(w, 0.025, l, 0.008, new THREE.MeshPhysicalMaterial({ color: '#f4f5f6', roughness: 0.25, transparent: true, opacity: 0.9, clearcoat: 1, clearcoatRoughness: 0.08 }), 0, 0.755, 0, g);
  box(w - 0.12, 0.03, l - 0.12, MAT.black, 0, 0.73, 0, g);                       // estrutura sob o vidro
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, 0.73, 0.05, MAT.black, sx * (w / 2 - 0.06), 0.365, sz * (l / 2 - 0.06), g);
  const chair = (x, z, rot) => {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = rot; g.add(c);
    rbox(0.44, 0.05, 0.44, 0.015, M({ map: fabricTex('#c9b79c'), roughness: 1 }), 0, 0.46, 0, c);
    rbox(0.44, 0.45, 0.04, 0.015, wood, 0, 0.72, -0.2, c);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.035, 0.45, 0.035, MAT.black, sx * 0.19, 0.225, sz * 0.19, c);
  };
  chair(w / 2 + 0.28, -l / 4, -Math.PI / 2); chair(w / 2 + 0.28, l / 4, -Math.PI / 2);   // lado da sala
  chair(0, -l / 2 - 0.3, 0); chair(0, l / 2 + 0.3, Math.PI);                            // cabeceiras
  // centro de mesa
  cyl(0.08, 0.06, 0.16, MAT.pot, 0, 0.85, 0, g); for (let i = 0; i < 5; i++) mesh(new THREE.SphereGeometry(0.05, 8, 6), MAT.leaf, (rnd() - 0.5) * 0.08, 0.98 + rnd() * 0.06, (rnd() - 0.5) * 0.08, g);
  return g;
}
/** Quadros na parede x=xw (ao longo de z). */
function frames(xw, cz, y = 1.55) {
  const s = Math.sign(xw), arts = ['#c9b79c', '#7a8c7e', '#d9a679'];
  [[-0.55, 0.42, 0.55], [0, 0.5, 0.7], [0.55, 0.42, 0.55]].forEach(([dz, w, h], i) => {
    box(0.03, h, w, MAT.black, xw - s * 0.015, y, cz + dz);
    box(0.005, h - 0.08, w - 0.08, M({ color: '#f4f1ea' }), xw - s * 0.032, y, cz + dz);
    box(0.005, h - 0.2, w - 0.2, M({ color: arts[i], roughness: 0.9 }), xw - s * 0.036, y, cz + dz);
  });
}
/** Trilho no teto com spots apontados para os quadros e a mesa (luz acesa). */
function trackLight(x, cz, aimX, len = 1.4) {
  const g = group(x, cz);
  const bar = box(0.04, 0.03, len, MAT.black, 0, 2.31, 0, g);
  for (const dz of [-0.45, 0, 0.45]) {
    const can = cyl(0.04, 0.05, 0.14, MAT.black, 0, 2.22, dz, g); can.rotation.z = Math.sign(aimX - x) * 0.6;
    const glow = cyl(0.035, 0.035, 0.005, M({ color: '#fff4dc', emissive: '#ffd59a', emissiveIntensity: 2 }), Math.sign(aimX - x) * 0.04, 2.16, dz, g); glow.rotation.z = can.rotation.z;
    const sp = new THREE.SpotLight(0xffd8a8, 6, 4, 0.55, 0.6, 1.5); sp.position.set(x, 2.2, cz + dz); sp.target.position.set(aimX, 1.1, cz + dz * 1.2);
    scene.add(sp); scene.add(sp.target);
  }
  g.traverse((o) => (o.userData.keep = true));
}
/** Lustre com 8 pilas de cristais pendurado no teto. */
function chandelier(x, z, y0 = 2.58) {
  const g = group(x, z);
  const crystal = new THREE.MeshPhysicalMaterial({ color: '#f4f6f8', emissive: '#000000', emissiveIntensity: 0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 });
  cyl(0.07, 0.07, 0.03, MAT.chrome, 0, y0, 0, g);                       // canopla no teto
  const ring = mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), MAT.chrome, 0, y0 - 0.08, 0, g); ring.rotation.x = Math.PI / 2; // aro
  const bead = new THREE.OctahedronGeometry(0.028);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = 0.2, len = 0.5 + (i % 2) * 0.12;
    for (let k = 0; k < Math.round(len / 0.055); k++) { const m = mesh(bead, crystal, Math.cos(a) * r, y0 - 0.1 - k * 0.055, Math.sin(a) * r, g); m.castShadow = false; m.rotation.y = k; }
    const tip = mesh(new THREE.OctahedronGeometry(0.045), crystal, Math.cos(a) * r, y0 - 0.12 - len, Math.sin(a) * r, g); tip.scale.y = 1.6; tip.castShadow = false;
  }
  g.traverse((o) => (o.userData.keep = true));
  return g;
}
/** Plafon quadrado de teto (luz automatizada). */
function squareCeilingLight(x, z, id, y = 2.5) {
  const g = group(x, z);
  // vista de cima: a caixa do plafon fica translúcida para não tapar o carro
  box(0.5, 0.05, 0.5, new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }), 0, y, 0, g);
  const dif = M({ color: '#fffaf0', emissive: '#fff1d6', emissiveIntensity: 0, roughness: 0.4, transparent: true, opacity: 0.6, depthWrite: false });
  box(0.44, 0.012, 0.44, dif, 0, y - 0.031, 0, g);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xfff1d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.scale.set(1.6, 1.6, 1); glow.position.set(0, y - 0.1, 0); g.add(glow);
  const l = new THREE.PointLight(0xfff1d6, 0, 6, 1.4); l.position.set(0, y - 0.15, 0); g.add(l);
  g.traverse((o) => { o.userData.keep = true; o.userData.lamp = id; if (o.isMesh) o.castShadow = false; });
  LAMPS.push({ auto: id, apply: (k) => { dif.emissiveIntensity = 1.8 * k; glow.material.opacity = 0.8 * k; l.intensity = 4 * k; } });
  return g;
}
function brooms(x, z) { for (let i = 0; i < 4; i++) { cyl(0.012, 0.012, 1.25, M({ color: ['#d23a3a', '#2a9d8f', '#d23a3a', '#e9c46a'][i] }), x, 0.75, z + i * 0.14); box(0.05, 0.12, 0.25, M({ color: '#333' }), x, 0.12, z + i * 0.14); } }
function dryingRack(x, z) { // varal de chão (abas ao longo de z)
  const g = group(x, z);
  for (let i = 0; i < 6; i++) cyl(0.006, 0.006, 1.2, MAT.chrome, -0.25 + i * 0.1, 0.95, 0, g).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) for (const t of [-1, 1]) { const l = cyl(0.01, 0.01, 1.0, M({ color: '#3a7bd5' }), s * 0.22, 0.48, t * 0.5, g); l.rotation.x = t * 0.3; }
  blob(g, 0.8, 1.4, 0, 0, 0.5);
  return g;
}

if (FLOOR === 'terreo') {
  // ---------- Área de serviço: tudo na parede do fundo (da esquerda para a direita) ----------
  bbqBack(-1.52, -0.78);                            // churrasqueira
  sinkBack(-0.74, 0.18);                            // pia, com o banheiro automático embaixo
  tubBack(0.5);                                     // tanque
  washerMachine(1.15, BACK + 0.31, 0);              // lava e seca
  backCabinet(-0.76, 1.52);                         // armário aéreo de ponta a ponta (ao lado da churrasqueira)
  // ---------- Cozinha em L ----------
  // perna na parede da janela (cozinha | lavanderia): cooktop com forno e, ao lado, a pia embaixo da janela
  const cab = M({ color: '#cfc6b2', roughness: 0.6 });
  box(1.82, 0.86, 0.6, cab, 0.61, 0.43, -3.1); blob(house, 2.1, 0.9, 0.61, -3.1);
  box(1.84, 0.035, 0.62, MAT.black, 0.61, 0.88, -3.1);
  for (const x of [-0.3, 0.3, 0.9]) box(0.005, 0.7, 0.005, MAT.black, x, 0.42, -2.798);
  cooktop(0.02, -3.1);
  box(0.58, 0.5, 0.01, MAT.black, 0.02, 0.4, -2.795); box(0.4, 0.02, 0.02, MAT.chrome, 0.02, 0.68, -2.785);    // forno
  box(0.5, 0.03, 0.4, MAT.chrome, 0.92, 0.9, -3.12); cyl(0.015, 0.015, 0.3, MAT.chrome, 0.92, 1.05, -3.36);       // pia
  // perna na parede lateral: na ponta, micro-ondas e filtro de água
  box(0.6, 0.86, 1.48, cab, 1.22, 0.43, -2.06); blob(house, 0.9, 1.7, 1.22, -2.06);
  box(0.62, 0.035, 1.5, MAT.black, 1.21, 0.88, -2.06);
  rbox(0.36, 0.28, 0.48, 0.02, M({ color: '#2b2d31', roughness: 0.4 }), 1.3, 1.04, -1.68); box(0.005, 0.2, 0.3, M({ color: '#0d0f14', roughness: 0.1 }), 1.118, 1.04, -1.68); // micro-ondas
  cyl(0.09, 0.09, 0.4, MAT.white, 1.33, 1.1, -1.42); cyl(0.07, 0.07, 0.04, M({ color: '#7fb3d5' }), 1.33, 1.32, -1.42); // filtro de água
  fridge(1.17, -0.93, -Math.PI / 2);
  // ---------- Lavabo (embaixo da escada) ----------
  toilet(1.27, 0.35, -Math.PI / 2);
  vanity(0.95, -0.4, 0, 0.45);
  // ---------- Escada de pedra preta (sobe da sala, por cima do lavabo) ----------
  stairsUp(0.57, -0.6, 1.5, 3.3, 16, -1, 0.57, M({ color: '#1c1c1f', roughness: 0.35, metalness: 0.1 }));
  // embaixo da escada é fechado: parede acompanhando a inclinação, do lavabo até o pé da escada
  {
    const z1 = 0.75, z2 = 3.3, hAt = (z) => 0.17 * 16 * (3.3 - z) / 3.9 + 0.02;
    const sh = new THREE.Shape(); sh.moveTo(z1, 0); sh.lineTo(z2, 0); sh.lineTo(z2, hAt(z2)); sh.lineTo(z1, hAt(z1)); sh.closePath();
    const wallUnder = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false }), MAT.wall);
    wallUnder.rotation.y = -Math.PI / 2; wallUnder.position.set(0.55 + T / 2, 0, 0); wallUnder.castShadow = wallUnder.receiveShadow = true; house.add(wallUnder);
    wallBox([0.55, 0.75, 0.55, 3.3], 0.07, 0, MAT.base, T + 0.024); // rodapé
  }
  // ---------- Sala ----------
  // Copa (entre a cozinha e a sala, na parede comprida): mesa de 4 lugares, 3 quadros e luz no teto
  diningSet(-0.98, 0.45);
  frames(-1.52 + T / 2, 0.45);
  trackLight(-0.85, 0.45, -1.47);
  car2008(0.0, 9.9);                                // Peugeot 2008 prata                           // Peugeot 2008 (modelo enviado pelo usuário)                                    // Peugeot 2008 na garagem
  catHouse(1.12, 3.62, -Math.PI / 2);               // casinha do pet, entre a escada e a TV
  tvPanel(1.45, 5.05, -Math.PI / 2, 2.0);       // painel na frente da parede
  chandelier(0.2, 5.0);                             // lustre de cristais (8 pilas) sobre a sala
  squareCeilingLight(0.0, 9.9, 'luz-garagem');      // Luz da Garagem (automação)
  sofa(-1.02, 5.0, Math.PI / 2, 1.9, M({ map: fabricTex('#232326'), roughness: 0.9 }));
  rug(0.25, 5.0, 1.3, 1.9);
  desk(0.0, 6.65, Math.PI, 1.1, 0.55);
  officeChair(0.0, 6.1, Math.PI, MAT.red);
} else {
// ---------- Suíte ----------
bed(0.47, -5.93, -Math.PI / 2, 1.58, 2.0, MAT.duvet); // cabeceira na parede da direita
nightstand(1.25, -4.7, -Math.PI / 2); nightstand(1.25, -7.15, -Math.PI / 2);
rackTV(-1.24, -5.93, Math.PI / 2, 1.8);
standFan(-1.22, -4.62);                            // ventilador de coluna ao lado da TV (automação “Ventilador”)
rug(0.25, -5.93, 2.2, 2.3);
// ---------- Banheiro da suíte ----------
toilet(0.26, -3.5, 0);
showerBox(0.62, -3.73, 1.47, -2.9, 'z2');
vanity(1.22, -2.35, -Math.PI / 2, 0.6);
// ---------- Escada e corredor ----------
stairs(-1.47, 0.71, -0.55, 4.63, 14);
plant(0.1, -1.62, 1.1);
// ---------- Escritório ----------
desk(0.93, 2.55, Math.PI, 1.05, 0.56);
officeChair(0.93, 1.95, Math.PI, MAT.red);
plant(1.3, -1.65, 0.9);
// ---------- Banheiro ----------
toilet(1.27, 3.4, -Math.PI / 2);
vanity(0.72, 3.13, 0, 0.55);
showerBox(0.45, 4.25, 1.47, 5.02, 'z1');
// ---------- Quarto 2 ----------
crib(1.1, 5.95, 0);
ledStrip(1.455, 5.95, 1.3, 1.24);
armchair(1.1, 7.2, Math.PI, MAT.armchair, 0.82);
changer(-1.24, 6.95, Math.PI / 2, 1.0, 0.5);
wardrobe(-1.24, 5.84, Math.PI / 2, 0.98, 0.5, 2);
rug(-0.45, 6.3, 1.1, 1.4);
}

/* ---------- Planta: paredes e móveis altos baixam para 1,1 m; o que está acima some ---------- */
let tall = null;
function lowerTall(cut) {
  if (!tall) {
    tall = []; house.updateMatrixWorld(true);
    house.traverse((o) => {
      if (!o.isMesh || floors.includes(o) || o.userData.keep) return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.max.y > 1.0) tall.push({ o, y: o.position.y, s: o.scale.y, h: b.max.y - b.min.y, min: b.min.y, sy: o.getWorldScale(new THREE.Vector3()).y / o.scale.y });
    });
  }
  for (const t of tall) {
    t.o.scale.y = t.s; t.o.position.y = t.y; t.o.visible = true; t.o.userData.cutHidden = false;
    if (cut == null) continue;
    if (t.min >= cut) { t.o.visible = false; t.o.userData.cutHidden = true; continue; }
    if (t.min + t.h > cut) { const k = (cut - t.min) / t.h; t.o.scale.y = t.s * k; t.o.position.y = t.y - (t.h * (1 - k)) / 2 / t.sy; }
  }
}
// Teto e luz ambiente para a vista por dentro
const ceiling = box(3.14, 0.05, 15.22, M({ color: '#fbfaf7' }), 0, WALL_H + 0.025, 0); ceiling.visible = false; ceiling.castShadow = false;
const inLight = new THREE.AmbientLight(0xfff3e4, 0); scene.add(inLight);

/* ================= Cômodos: etiquetas, botões e câmera ================= */
const NAMES_KEY = 'luna.casa3d.nomes';
let saved = {}; try { saved = JSON.parse(localStorage.getItem(NAMES_KEY) || '{}'); } catch {}
const labels = document.getElementById('labels'), roomsBar = document.getElementById('rooms');
const PLACES = ROOMS.filter((r) => !r.muted); // ordem do menu
const allBtn = document.createElement('button'); allBtn.className = 'btn on'; allBtn.textContent = 'Casa toda'; allBtn.addEventListener('click', () => select(null)); roomsBar.appendChild(allBtn);
for (const r of ROOMS) {
  if (saved[r.id]) r.name = saved[r.id];
  const el = document.createElement('button'); el.className = 'lbl'; el.textContent = r.name; el.addEventListener('click', () => select(r));
  labels.appendChild(el); r.el = el; r.labelAt = new THREE.Vector3(r.label[0], 0.9, r.label[1]);
  // caixa do cômodo (para enquadrar)
  const xs = r.rects.flatMap((q) => [q[0], q[2]]), zs = r.rects.flatMap((q) => [q[1], q[3]]);
  r.box = { x1: Math.min(...xs), x2: Math.max(...xs), z1: Math.min(...zs), z2: Math.max(...zs) };
  if (!r.muted) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = r.name; b.addEventListener('click', () => select(r)); roomsBar.appendChild(b); r.btn = b; }
}
let sel = null;
const lampBtn = document.getElementById('lampBtn'), lampTxt = document.getElementById('lampTxt');
const extraH = () => (lampBtn.classList.contains('show') ? 60 : 0) + (document.getElementById('dimmer')?.classList.contains('show') ? 75 : 0);
const card = document.getElementById('card'), cardT = document.getElementById('cardT'), cardS = document.getElementById('cardS');
const area = (r) => r.rects.reduce((s, [x1, z1, x2, z2]) => s + (x2 - x1) * (z2 - z1), 0);
function select(r) {
  sel = r;
  for (const x of ROOMS) { x.el.classList.toggle('sel', x === r); x.el.classList.toggle('dim', !!r && x !== r); for (const m of x.mats) m.emissive.set(x === r ? '#3a3226' : '#000'); x.btn?.classList.toggle('on', x === r); }
  allBtn.classList.toggle('on', !r);
  if (!r) lampBtn.classList.remove('show');
  card.classList.toggle('show', !!r); invalidate(4, true);
  house.traverse((o) => { if (o.userData.overLavabo) o.visible = r?.id !== 'lavabo' && !o.userData.cutHidden; }); // ver o lavabo por baixo da escada
  (r?.btn ?? allBtn).scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  if (!r) return home();
  cardT.textContent = r.name; cardS.textContent = `${r.kind} · ${area(r).toFixed(1).replace('.', ',')} m²`;
  renderBtn();
  focusRoom(r);
}
function step(d) { const i = PLACES.indexOf(sel); select(PLACES[(i + d + PLACES.length) % PLACES.length]); }
document.getElementById('prev').addEventListener('click', () => step(-1));
document.getElementById('next').addEventListener('click', () => step(1));
cardT.addEventListener('click', () => {
  if (!sel) return;
  const n = prompt('Nome do cômodo', sel.name); if (!n || !n.trim()) return;
  sel.name = n.trim().slice(0, 30); sel.el.textContent = sel.name; cardT.textContent = sel.name; if (sel.btn) sel.btn.textContent = sel.name;
  saved[sel.id] = sel.name; try { localStorage.setItem(NAMES_KEY, JSON.stringify(saved)); } catch {}
});
const spin = document.getElementById('spin');
spin.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; spin.classList.toggle('on', controls.autoRotate); spin.setAttribute('aria-pressed', controls.autoRotate); });

const ZS = ROOMS.flatMap((r) => r.rects.flatMap((q) => [q[1], q[3]]));
const SIZE = new THREE.Vector3(3.14, WALL_H, Math.max(...ZS) - Math.min(...ZS) + 0.1);
const CZ = (Math.max(...ZS) + Math.min(...ZS)) / 2;
const anim = { t: 1 };
function flyTo(pos, target, ms = 900) { anim.from = { p: camera.position.clone(), t: controls.target.clone() }; anim.to = { p: pos.clone(), t: target.clone() }; anim.t = 0; anim.ms = ms; anim.start = performance.now(); }
/** Distância para caber w (largura na tela) × h (altura na tela) entre o cabeçalho e o menu. */
function fitDist(w, h) {
  const v = THREE.MathUtils.degToRad(camera.fov) / 2;
  const free = Math.max(0.45, (innerHeight - (card.classList.contains('show') ? 330 : 270) - extraH()) / innerHeight);
  return Math.max((h / 2) / (Math.tan(v) * free), (w / 2) / (Math.tan(v) * camera.aspect));
}
/** Desloca o alvo para o meio da área livre (o menu de baixo é mais alto que o cabeçalho). */
function screenShift(dist) { const v = THREE.MathUtils.degToRad(camera.fov) / 2; return ((card.classList.contains('show') ? 210 : 150) + extraH() - 110) / 2 / innerHeight * 2 * Math.tan(v) * dist; }
function home() {
  const portrait = camera.aspect < 1;
  // + altura das paredes: o topo delas fica mais perto da câmera e aparece maior
  const dist = (portrait ? fitDist(SIZE.x + 1.0, SIZE.z * 0.97) : fitDist(SIZE.z + 0.6, SIZE.x + 1.2) * 1.08) + 2.6;
  const dir = (portrait ? new THREE.Vector3(0.0, 0.96, 0.28) : new THREE.Vector3(0.18, 0.98, 0.0)).normalize();
  const t = new THREE.Vector3(portrait ? 0 : 0.15, 0.3, CZ + (portrait ? 0.35 : 0));
  // empurra para cima na tela: no celular o "para cima" é -z; deitado é -x
  const sh = screenShift(dist); if (portrait) t.z += sh; else t.x += sh;
  flyTo(dir.multiplyScalar(dist).add(t), t);
}
/** Vista 3/4 do cômodo, de cima e de lado, com ele inteiro na tela. */
function focusRoom(r) {
  const { x1, x2, z1, z2 } = r.box, w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const portrait = camera.aspect < 1;
  if (r.view) {
    // ângulo escolhido para este cômodo (suíte: do lado da TV, olhando para a cabeceira)
    const t = new THREE.Vector3(r.view.at[0], 0.4, portrait ? r.view.at[1] : cz);
    const dist = (portrait ? Math.max(4.6 * (r.view.zoom ?? 1), fitDist(d + 0.6, w + 1.6) * 1.08 * (r.view.zoom ?? 1)) : fitDist(d + 1.0, w + 1.4) * 0.95 * (r.view.zoom ?? 1));
    // paredes mais altas: mesmo lado do ângulo escolhido, porém mais de cima, para a parede da frente não tapar o cômodo
    const vd = new THREE.Vector3(r.view.dir[0] * 0.5, r.view.dir[1], r.view.dir[2] * 0.5).normalize();
    flyTo(vd.multiplyScalar(dist + 1.2).add(t), t, 1000);
    return;
  }
  // no celular o comprido da casa fica na vertical; deitado, na horizontal (igual à casa toda)
  const sw = portrait ? w : d, sh = portrait ? d : w;
  const dist = Math.max(4.2, fitDist(sw + 1.2, sh + 1.4) * 1.3) + 1.6;
  const dir = (portrait ? new THREE.Vector3(0.1, 0.95, 0.2) : new THREE.Vector3(0.2, 0.95, 0.1)).normalize();
  const t = new THREE.Vector3(cx, 0.4, cz);
  const s = screenShift(dist); if (portrait) t.z += s; else t.x += s * 0.6;
  flyTo(dir.multiplyScalar(dist).add(t), t, 1000);
}

/* ================= Automações de luz (cada uma escurece o próprio cômodo quando apagada) ================= */
const AUTOS = [
  { id: 'cabeceira', name: 'Cabeceira', room: 'suite', on: true, mix: 1 },
  { id: 'led-luiza', name: 'Led Luiza', room: 'quarto2', on: true, mix: 1, masc: true },
  { id: 'ventilador', name: 'Ventilador', room: 'suite', on: false, mix: 0, darkness: 0, masc: true, icon: 'fan' },
  { id: 'luz-garagem', name: 'Luz da Garagem', room: 'garagem', on: true, mix: 1 },
  { id: 'luminaria', name: 'Luminária', room: 'sala', on: true, mix: 1, level: 80, hex: '#ffd8a8', dimmable: true, darkness: 1 },
];
// Cada cômodo com automação tem 2 retângulos; o material calcula pela posição no mundo se o ponto está
// dentro (borda suave na porta). Sem caixas por cima — paredes, chão e móveis escurecem por igual.
const RECTS = [], RDARK = [];
AUTOS.splice(0, AUTOS.length, ...AUTOS.filter((a) => ROOMS.some((r) => r.id === a.room)));
if (!AUTOS.length) AUTOS.push({ id: 'none', name: '', room: '__none', on: true, mix: 1 });
AUTOS.forEach((a, i) => { const r = ROOMS.find((x) => x.id === a.room) ?? { rects: [[99, 99, 99, 99]] }; a.roomRef = r; a.slot = i; for (let k = 0; k < 3; k++) { const q = r.rects[k] ?? r.rects[0]; RECTS.push(new THREE.Vector4(...q)); RDARK.push(0); } });
const dimU = { uR: { value: RECTS }, uD: { value: RDARK } };
const N = RECTS.length;
function patchDim(m) {
  if (!m || m.userData.dimPatched || !(m.isMeshStandardMaterial)) return;
  const keepTop = m === MAT.wallTop; // topo das paredes (borda creme) continua claro
  m.userData.dimPatched = true;
  m.customProgramCacheKey = () => (keepTop ? 'dim-top' : 'dim');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, dimU);
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vWP;\nuniform vec4 uR[${N}];\nuniform float uD[${N}];\nfloat inR(vec4 r){ float f = 0.06; return smoothstep(r.x - f, r.x + f, vWP.x) * (1.0 - smoothstep(r.z - f, r.z + f, vWP.x)) * smoothstep(r.y - f, r.y + f, vWP.z) * (1.0 - smoothstep(r.w - f, r.w + f, vWP.z)); }\n` +
      sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n  float dm = 0.0;\n  for (int i = 0; i < ${N}; i++) dm = max(dm, uD[i] * inR(uR[i]));\n  dm *= (1.0 - smoothstep(2.62, 2.7, vWP.y))` + (keepTop ? ' * (1.0 - smoothstep(1.2, 1.25, vWP.y))' : '') + ';\n  gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.17, 0.19, 0.27), dm);');
  };
  m.needsUpdate = true;
}
house.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(patchDim); });

/* ---------- Dentro da Luna: o estado vem do Home Assistant e os toques viram comandos ---------- */
const LUNA = new URLSearchParams(location.search).has('luna') && window.parent !== window;
const isDim = (a) => (LUNA ? !!a.canDim : !!a.dimmable);
const isColor = (a) => (LUNA ? !!a.canColor : !!a.dimmable);
const send = (msg) => { if (LUNA) window.parent.postMessage(msg, location.origin); };
const hexOf = (rgb) => '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
const autosOf = (room) => AUTOS.filter((a) => a.room === room?.id && (!LUNA || a.linked));
const autoOf = (room) => autosOf(room).find(isDim) ?? autosOf(room)[0];
const lampBtn2 = document.getElementById('lampBtn2'), lampTxt2 = document.getElementById('lampTxt2');
const dimmer = document.getElementById('dimmer'), lvl = document.getElementById('lvl'), lvlv = document.getElementById('lvlv'), swBox = document.getElementById('sw');
const COLORS = [['#ffd8a8', 'Branco quente'], ['#fff4e6', 'Branco neutro'], ['#dcebff', 'Branco frio'], ['#ff9f43', 'Âmbar'], ['#ff6b9a', 'Rosa'], ['#7c6bff', 'Roxo'], ['#4dabff', 'Azul'], ['#3ddc84', 'Verde']];
for (const [hex, name] of COLORS) { const b = document.createElement('button'); b.style.background = hex; b.title = name; b.setAttribute('aria-label', name); b.dataset.hex = hex; b.addEventListener('click', () => setCfg({ hex })); swBox.appendChild(b); }
{ const l = document.createElement('label'); l.title = 'Outra cor'; l.style.background = 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)'; const i = document.createElement('input'); i.type = 'color'; i.addEventListener('input', () => setCfg({ hex: i.value }, false)); i.addEventListener('change', () => setCfg({ hex: i.value })); l.appendChild(i); swBox.appendChild(l); }
lvl.addEventListener('input', () => setCfg({ level: Number(lvl.value) }, false)); lvl.addEventListener('change', () => setCfg({ level: Number(lvl.value) }));
function setCfg(patch, commit = true) {
  const a = autoOf(sel); if (!a || !isDim(a)) return;
  Object.assign(a, patch); if (!a.on) a.on = true;
  a.hold = performance.now() + 2500; // não deixa o estado antigo do servidor “puxar” o controle de volta
  if (LUNA) { if (commit) send({ type: 'casa3d-cmd', id: a.id, ...patch }); }
  else try { localStorage.setItem('luna.casa3d.' + a.id + '.cfg', JSON.stringify({ level: a.level, hex: a.hex })); localStorage.setItem('luna.casa3d.' + a.id, '1'); } catch {}
  renderBtn();
}
function renderBtn() {
  const list = autosOf(sel), d = list.find(isDim);
  [[lampBtn, lampTxt], [lampBtn2, lampTxt2]].forEach(([btn, txt], i) => {
    const a = list[i];
    btn.classList.toggle('show', !!a);
    if (!a) return;
    btn.dataset.auto = a.id;
    btn.classList.toggle('on', a.on); btn.classList.toggle('fan', a.icon === 'fan'); btn.setAttribute('aria-pressed', a.on);
    btn.disabled = LUNA && !a.available; btn.style.opacity = btn.disabled ? 0.5 : '';
    btn.querySelector('.dot').style.background = isColor(a) && a.on ? a.hex : '';
    txt.textContent = `${a.icon === 'fan' ? '🌀 ' : ''}${a.name} ${LUNA && !a.available ? 'indisponível' : (a.on ? 'ligad' : 'desligad') + (a.masc ? 'o' : 'a')}${isDim(a) && a.on ? ` · ${a.level}%` : ''}`;
  });
  dimmer.classList.toggle('show', !!d && d.on);
  if (d) { lvl.value = d.level; lvlv.textContent = d.level + '%'; swBox.style.display = isColor(d) ? '' : 'none'; swBox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.hex === d.hex)); }
  invalidate(4);
}
function setAuto(id, on) {
  const a = AUTOS.find((x) => x.id === id); if (!a) return;
  if (LUNA && (!a.linked || !a.available)) return;
  a.on = on ?? !a.on; a.hold = performance.now() + 2500;
  if (LUNA) send({ type: 'casa3d-cmd', id: a.id, on: a.on });
  else try { localStorage.setItem('luna.casa3d.' + a.id, a.on ? '1' : '0'); } catch {}
  renderBtn();
}
for (const btn of [lampBtn, lampBtn2]) btn.addEventListener('click', () => btn.dataset.auto && setAuto(btn.dataset.auto));
function applyLamps(dt) {
  let changing = false;
  for (const a of AUTOS) {
    const target = a.on ? 1 : 0;
    if (a.mix !== target) changing = true;
    a.mix += Math.sign(target - a.mix) * Math.min(Math.abs(target - a.mix), dt / 600);
    const k = a.mix * (isDim(a) ? Math.max(0.08, (a.level ?? 100) / 100) : 1);
    for (const L of LAMPS) if (L.auto === a.id) L.apply(k, a);
    RDARK[a.slot * 3] = RDARK[a.slot * 3 + 1] = RDARK[a.slot * 3 + 2] = (1 - k) * (a.darkness ?? 1);
  }
  return changing;
}
if (!LUNA) for (const a of AUTOS) { try { const st = JSON.parse(localStorage.getItem('luna.casa3d.' + a.id + '.cfg') || 'null'); if (st) Object.assign(a, { level: st.level ?? a.level, hex: st.hex ?? a.hex }); } catch {} try { if (localStorage.getItem('luna.casa3d.' + a.id) === '0' || (a.id === 'cabeceira' && localStorage.getItem('luna.casa3d.cabeceira') === '0')) { a.on = false; a.mix = 0; } } catch {} }
if (LUNA) {
  // Sem vínculo, a luz aparece acesa (cômodo claro) e sem botão; o ventilador, parado
  for (const a of AUTOS) { a.linked = false; a.available = false; a.on = a.icon !== 'fan'; a.mix = a.on ? 1 : 0; a.level = a.level ?? 100; }
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== window.parent || e.data?.type !== 'casa3d-state') return;
    for (const a of AUTOS) {
      const s = e.data.autos?.[a.id];
      if (!s) { a.linked = false; continue; }
      a.linked = true; a.available = !!s.available; a.canDim = !!s.dim; a.canColor = !!s.color;
      if (performance.now() < (a.hold ?? 0)) continue; // acabou de mexer aqui: espera o servidor confirmar
      a.on = !!s.on;
      if (s.level) a.level = s.level;
      if (s.rgb) a.hex = hexOf(s.rgb);
    }
    renderBtn();
  });
  send({ type: 'casa3d-ready', floor: FLOOR });
}
const suite = ROOMS.find((r) => r.id === 'suite');

/* ================= Toque ================= */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; if (controls.autoRotate) { controls.autoRotate = false; spin.classList.remove('on'); } });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 400) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(house.children, true).filter((h) => h.object.visible && h.object !== ceiling);
  if (!hits.length) return;
  const lampId = hits[0].object.userData.lamp;
  if (lampId) { const a = AUTOS.find((x) => x.id === lampId); setAuto(lampId); if (sel !== a.roomRef) select(a.roomRef); return; }
  const p = hits[0].point;
  const room = ROOMS.find((r) => !r.muted && r.rects.some(([x1, z1, x2, z2]) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2));
  if (room && room !== sel) select(room);
});
controls.minDistance = 1.5; controls.maxDistance = 40; controls.minPolarAngle = 0.05; controls.maxPolarAngle = 1.35;
lowerTall(2.35);

/* ================= Laço ================= */
setTimeout(() => (document.getElementById('hint').style.opacity = 0), 6000);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); invalidate(4); });
document.getElementById('load').remove();
const v = new THREE.Vector3(), ease = (x) => 1 - Math.pow(1 - x, 3);
home(); anim.t = 1; camera.position.copy(anim.to.p); controls.target.copy(anim.to.t);
addEventListener('resize', () => setTimeout(() => (sel ? focusRoom(sel) : home()), 50));
let lastT = performance.now(), slow = 0, lite = false;
sun.shadow.needsUpdate = true;
renderer.setAnimationLoop((now) => {
  const dtt = Math.min(1000, now - lastT); lastT = now;
  if (applyLamps(dtt)) invalidate();
  let fanOn = false; for (const f of FANS) fanOn = f(Math.min(dtt, 50)) || fanOn;
  if (fanOn || controls.autoRotate) invalidate();
  if (anim.t < 1) { anim.t = Math.min(1, (now - anim.start) / anim.ms); const k = ease(anim.t); camera.position.lerpVectors(anim.from.p, anim.to.p, k); controls.target.lerpVectors(anim.from.t, anim.to.t, k); invalidate(); }
  controls.update();
  if (need <= 0) return; // nada mudou: não redesenha (a maquete parada custa quase zero)
  need--;
  for (const r of ROOMS) {
    v.copy(r.labelAt).setY(1.45); v.project(camera);
    r.el.style.visibility = v.z > 1 || r.muted || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 ? 'hidden' : '';
    r.el.style.left = `${(v.x + 1) / 2 * innerWidth}px`; r.el.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
  }
  renderer.render(scene, camera);
  // Modo leve automático: se o aparelho não acompanha (abaixo de ~22 quadros/s em movimento), tira o
  // desfoque dos menus e reduz a resolução interna
  if (!lite && need > 0) { slow = dtt > 45 ? slow + 1 : Math.max(0, slow - 1); if (slow > 40) { lite = true; document.body.classList.add('lite'); renderer.setPixelRatio(1); invalidate(4); } }
});
window.house3d = { lite: () => lite, look: (p, t) => { anim.t = 1; camera.position.set(...p); controls.target.set(...t); controls.update(); }, auto: setAuto, select: (id) => select(ROOMS.find((r) => r.id === id) ?? null), ready: true };
