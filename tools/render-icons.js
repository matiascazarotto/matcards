// Renderiza os PNGs do ícone a partir do icon.svg usando Chrome headless.
// Uso: node tools/render-icons.js
//
// Por que existir: tools/make-icons.html exige abrir no browser e clicar 4 vezes.
// Este script automatiza usando o Chrome local. PNGs gerados ficam pixel-perfect
// idênticos ao que o browser renderiza do SVG.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const CHROME = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const ROOT = path.resolve(__dirname, '..');
const ICONS_DIR = path.join(ROOT, 'icons');
const SVG_PATH = path.join(ICONS_DIR, 'icon.svg');

const SVG = fs.readFileSync(SVG_PATH, 'utf8');

// Para versão maskable: SVG full-bleed com design constrained a 80% do safe area
const MASKABLE_SVG = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="80%" cy="15%" r="65%">
      <stop offset="0%" stop-color="#8b7cff" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#8b7cff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="#0a0a0c"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <g transform="translate(102.4 102.4) scale(0.8)">
    <rect x="240" y="180" width="544" height="664" rx="68" fill="none" stroke="#8b7cff" stroke-width="15" opacity="0.55"/>
    <text x="512" y="680" font-family="ui-monospace, 'SF Mono', Cascadia Code, Consolas, Menlo, monospace" font-size="540" font-weight="500" fill="#a594ff" text-anchor="middle">m</text>
  </g>
</svg>`;

const TARGETS = [
  { name: 'icon-180.png', size: 180, svg: SVG },
  { name: 'icon-192.png', size: 192, svg: SVG },
  { name: 'icon-512.png', size: 512, svg: SVG },
  { name: 'icon-512-maskable.png', size: 512, svg: MASKABLE_SVG }
];

function buildHtml(svg, size) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  html,body { margin:0; padding:0; background: transparent; }
  body { width: ${size}px; height: ${size}px; }
  svg { display: block; width: 100%; height: 100%; }
</style></head><body>${svg.replace(
    "ui-monospace, 'SF Mono', Menlo, Monaco, monospace",
    "ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, Menlo, Monaco, monospace"
  )}</body></html>`;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matcards-icon-'));

for (const { name, size, svg } of TARGETS) {
  const htmlPath = path.join(tmp, `${name}.html`);
  fs.writeFileSync(htmlPath, buildHtml(svg, size), 'utf8');

  const outPath = path.join(ICONS_DIR, name);

  console.log(`[render] ${name} (${size}x${size})`);
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--screenshot=${outPath}`,
    `--window-size=${size},${size}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('[render] done. Files in icons/');
