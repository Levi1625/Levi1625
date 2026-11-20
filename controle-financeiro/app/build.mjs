// Monta public/index.html a partir do app principal (../bolso-em-dia.html), o mesmo do Claude.
// Rodar sempre que o app principal mudar: npm run build
import { readFileSync, writeFileSync } from 'node:fs';
const app = readFileSync(new URL('../bolso-em-dia.html', import.meta.url), 'utf8');
const head = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1D3FBF">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png">
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}</style>
<script src="vendor/firebase-app-compat.js"></script>
<script src="vendor/firebase-auth-compat.js"></script>
<script src="vendor/firebase-firestore-compat.js"></script>
<script src="config.js"></script>
<script src="shim.js"></script>
</head><body>
`;
writeFileSync(new URL('./public/index.html', import.meta.url), head + app + '\n</body></html>\n');
console.log('public/index.html gerado');
