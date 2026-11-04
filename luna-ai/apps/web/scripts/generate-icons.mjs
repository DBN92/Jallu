// Gera os ícones PNG do PWA a partir de public/favicon.svg (requer Playwright/Chromium).
// Uso: node scripts/generate-icons.mjs
import { readFileSync } from 'node:fs';
const pw = await import(process.env.PW_PATH ?? 'playwright');
const chromium = pw.chromium ?? pw.default.chromium;

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
// Versão "full-bleed" (sem cantos arredondados) para maskable e Apple
const fullBleed = svg.replace('rx="112"', 'rx="0"');

const targets = [
  { file: 'icon-192.png', size: 192, src: svg, pad: 0 },
  { file: 'icon-512.png', size: 512, src: svg, pad: 0 },
  { file: 'icon-maskable-512.png', size: 512, src: fullBleed, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, src: fullBleed, pad: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${t.src.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/${t.file}`, import.meta.url).pathname, omitBackground: t.file === 'icon-192.png' || t.file === 'icon-512.png' });
  console.log('✓', t.file);
}
await browser.close();
