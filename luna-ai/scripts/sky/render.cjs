// Gera os céus do tema “Céu”: node scripts/sky/render.cjs  (precisa do Playwright com Chromium)
// Saída: apps/web/public/sky/<fase>-<tempo>.jpg (1600×1000, JPEG)
const path = require('node:path');
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const out = path.resolve(__dirname, '../../apps/web/public/sky');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  for (const phase of ['manha', 'dia', 'tarde', 'noite'])
    for (const wx of ['limpo', 'nublado', 'chuva']) {
      await p.goto(`file://${__dirname}/sky.html?phase=${phase}&wx=${wx}`);
      await p.waitForFunction(() => document.title === 'pronto');
      await p.waitForTimeout(300);
      const file = path.join(out, `${phase}-${wx}.jpg`);
      await p.screenshot({ path: file, type: 'jpeg', quality: 80 });
      console.log(path.basename(file), Math.round(fs.statSync(file).size / 1024), 'KB');
    }
  await b.close();
})();
