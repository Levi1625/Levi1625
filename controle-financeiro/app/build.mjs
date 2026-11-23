// Monta public/index.html a partir do app principal (../bolso-em-dia.html), o mesmo do Claude.
// Rodar sempre que o app principal mudar: npm run build
import { readFileSync, writeFileSync } from 'node:fs';
// No app instalado as fontes ficam guardadas junto (public/fonts): abre mais rápido e funciona sem internet.
const app0 = readFileSync(new URL('../bolso-em-dia.html', import.meta.url), 'utf8');
const app = app0.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/,
  '<link rel="preload" href="fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="fonts/fontes.css">');
if (app === app0) throw new Error('não achei o link das fontes do Google para trocar pelas fontes locais');
const d = new Date(Date.now() - 3 * 3600e3), p = (n) => String(n).padStart(2, '0');
const versao = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
const sw = new URL('./public/sw.js', import.meta.url);
writeFileSync(sw, readFileSync(sw, 'utf8').replace(/^const VERSAO = .*$/m, `const VERSAO = '${versao.replace(/\D/g, '')}';`));
const head = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1D3FBF">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Bolso em Dia"><meta name="apple-mobile-web-app-status-bar-style" content="default">
<script>window.__versao = '${versao}';</script>
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}</style>
<script src="shim.js"></script>
</head><body>
`;
writeFileSync(new URL('./public/index.html', import.meta.url), head + app + '\n</body></html>\n');
console.log('public/index.html gerado');
