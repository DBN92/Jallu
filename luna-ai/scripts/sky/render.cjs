// Gera as camadas do tema “Céu”: node scripts/sky/render.cjs  (precisa do Playwright com Chromium)
// Saída em apps/web/public/sky/:
//   <fase>-<tempo>.jpg         fundo (gradiente, sol, lua, estrelas) 1600×1000
//   <fase>-<tempo>-nuvens.webp nuvens numa faixa larga e transparente (o app desliza devagar)
//   <fase>-<tempo>-serra.webp  serra e neblina na frente das nuvens
//   chuva-*.png, neve-*.png, neblina.webp, vento.png  quadros que se repetem (o app anima)
// Só os quadros repetidos: node scripts/sky/render.cjs --tiles
const path = require('node:path');
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const out = path.resolve(__dirname, '../../apps/web/public/sky');
const COVER = { limpo: 0.47, nublado: 0.62, chuva: 1 };

/** PNG transparente → WebP (opcionalmente reduzido), feito pelo próprio Chromium */
async function toWebp(page, png, scale, quality) {
  const b64 = await page.evaluate(
    async ({ src, scale, quality }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', quality).split(',')[1];
    },
    { src: `data:image/png;base64,${png.toString('base64')}`, scale, quality },
  );
  return Buffer.from(b64, 'base64');
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 3200, height: 1000 } });
  const save = (name, buf) => {
    fs.writeFileSync(path.join(out, name), buf);
    console.log(name, Math.round(buf.length / 1024), 'KB');
  };
  const load = async (q) => {
    await p.goto(`file://${__dirname}/sky.html?${q}`);
    await p.waitForFunction(() => document.title === 'pronto');
    await p.waitForTimeout(200);
  };
  const onlyTiles = process.argv.includes('--tiles');
  for (const phase of onlyTiles ? [] : ['manha', 'dia', 'tarde', 'noite'])
    for (const wx of ['limpo', 'nublado', 'chuva']) {
      await load(`phase=${phase}&wx=${wx}&layer=ceu`);
      save(`${phase}-${wx}.jpg`, await p.screenshot({ type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1600, height: 1000 } }));
      await load(`phase=${phase}&wx=${wx}&layer=nuvens`);
      const cl = await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 3200, height: Math.round(1000 * COVER[wx]) } });
      save(`${phase}-${wx}-nuvens.webp`, await toWebp(p, cl, 0.5, 0.75));
      await load(`phase=${phase}&wx=${wx}&layer=serra`);
      const se = await p.screenshot({ omitBackground: true, clip: { x: 0, y: 360, width: 1600, height: 640 } });
      save(`${phase}-${wx}-serra.webp`, await toWebp(p, se, 1, 0.82));
    }
  // Gotas: quadro de 256×512 que se repete sem emenda (as que passam da borda voltam do outro lado)
  for (const [name, n, len, wid, alpha] of [['chuva-longe', 110, [18, 34], [0.8, 1.3], 0.45], ['chuva-perto', 32, [40, 70], [1.4, 2.2], 0.7]]) {
    const b64 = await p.evaluate(
      ({ n, len, wid, alpha }) => {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 512;
        const g = c.getContext('2d');
        let seed = 7;
        const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        g.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const x = r() * 256, y = r() * 512, l = len[0] + r() * (len[1] - len[0]);
          const grad = g.createLinearGradient(0, y, 0, y + l);
          grad.addColorStop(0, 'rgba(220,232,245,0)');
          grad.addColorStop(1, `rgba(220,232,245,${alpha * (0.5 + r() * 0.5)})`);
          g.strokeStyle = grad;
          g.lineWidth = wid[0] + r() * (wid[1] - wid[0]);
          for (const dy of [-512, 0, 512]) {
            g.beginPath();
            g.moveTo(x, y + dy);
            g.lineTo(x, y + dy + l);
            g.stroke();
          }
        }
        return c.toDataURL('image/png').split(',')[1];
      },
      { n, len, wid, alpha },
    );
    save(`${name}.png`, Buffer.from(b64, 'base64'));
  }
  // Neve: flocos macios (círculos com borda suave) num quadro que se repete
  for (const [name, n, size, alpha] of [['neve-longe', 70, [1.5, 3], 0.7], ['neve-perto', 22, [3.5, 6.5], 0.9]]) {
    const b64 = await p.evaluate(
      ({ n, size, alpha }) => {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 512;
        const g = c.getContext('2d');
        let seed = 13;
        const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < n; i++) {
          const x = r() * 256, y = r() * 512, rad = size[0] + r() * (size[1] - size[0]), a = alpha * (0.6 + r() * 0.4);
          for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 512], [0, -512]]) {
            const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
            gr.addColorStop(0, `rgba(255,255,255,${a})`);
            gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.75})`);
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr;
            g.beginPath();
            g.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
            g.fill();
          }
        }
        return c.toDataURL('image/png').split(',')[1];
      },
      { n, size, alpha },
    );
    save(`${name}.png`, Buffer.from(b64, 'base64'));
  }
  // Neblina: faixa de névoa que se repete na horizontal (o app desliza)
  {
    const b64 = await p.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1600;
      c.height = 420;
      const g = c.getContext('2d');
      let seed = 21;
      const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 70; i++) {
        const x = r() * 1600, y = 120 + r() * 260, rx = 140 + r() * 260, a = 0.12 + r() * 0.14;
        for (const dx of [-1600, 0, 1600]) {
          const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rx);
          gr.addColorStop(0, `rgba(235,240,245,${a})`);
          gr.addColorStop(1, 'rgba(235,240,245,0)');
          g.fillStyle = gr;
          g.save();
          g.translate(x + dx, y);
          g.scale(1, 0.35);
          g.translate(-(x + dx), -y);
          g.beginPath();
          g.arc(x + dx, y, rx, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
      return c.toDataURL('image/webp', 0.7).split(',')[1];
    });
    save('neblina.webp', Buffer.from(b64, 'base64'));
  }
  // Vento: riscos finos e longos (passam rápido para a esquerda)
  {
    const b64 = await p.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 400;
      const g = c.getContext('2d');
      let seed = 5;
      const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      g.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const x = r() * 800, y = r() * 400, l = 120 + r() * 260, a = 0.12 + r() * 0.18;
        for (const dx of [-800, 0, 800]) {
          const gr = g.createLinearGradient(x + dx, 0, x + dx + l, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0)');
          gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.strokeStyle = gr;
          g.lineWidth = 1 + r() * 1.2;
          g.beginPath();
          g.moveTo(x + dx, y);
          g.quadraticCurveTo(x + dx + l / 2, y - 6 + r() * 12, x + dx + l, y);
          g.stroke();
        }
      }
      return c.toDataURL('image/png').split(',')[1];
    });
    save('vento.png', Buffer.from(b64, 'base64'));
  }
  await b.close();
})();
