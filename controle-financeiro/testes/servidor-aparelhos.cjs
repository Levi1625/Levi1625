// Dois aparelhos no mesmo controle, no navegador, com o servidor local (veja servidor-controles.mjs; rode este depois dele,
// no mesmo banco novo: usa a conta dono@teste.com). Cada aparelho muda um ajuste diferente, um deles sem internet ou com o
// envio falhando; no fim os dois ajustes ficam nos dois aparelhos e no servidor. Só dados fictícios.
//   node controle-financeiro/testes/servidor-aparelhos.cjs
const { chromium } = require('playwright');
const U = process.env.URL_TESTE || 'http://localhost:8789';
const R = []; const ok = (c, m) => R.push((c ? 'OK   ' : 'ERRO ') + m);
const espera = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const pedidos = [];
  const aparelho = async () => { const ctx = await b.newContext(), p = await ctx.newPage(), erros = []; p.on('pageerror', e => erros.push(e.message)); p.on('request', r => pedidos.push(r.url()));
    const r = await ctx.request.post(U + '/api/entrar', {data:{email:'dono@teste.com', senha:'senha-do-dono'}, headers:{origin:U}});
    await p.goto(U + '/'); await p.waitForTimeout(3000); return {ctx, p, erros, entrou:r.ok()}; };
  const cfg = p => p.evaluate(async () => { const db = await window.claude.use('db'); return (await db.doc('config/geral').get()).data() || {}; });
  const muda = (p, patch) => p.evaluate(async patch => { const db = await window.claude.use('db'); await db.doc('config/geral').update(patch); }, patch);
  const sinc = async p => { await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(1500); };
  const A = await aparelho(), B = await aparelho();
  ok(A.entrou && B.entrou, 'os dois aparelhos entram na mesma conta');
  const fontes = await A.p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')); });
  ok(!pedidos.some(u => /fonts\.(googleapis|gstatic)\.com/.test(u)) && pedidos.some(u => /\/fonts\/fontes\.css$/.test(u)) && fontes.includes('Inter'), `fontes guardadas junto do app, sem buscar no Google (${[...new Set(fontes)].join(', ')})`);
  await muda(A.p, {testeA:0, testeB:0}); await A.p.waitForTimeout(1200); await sinc(B.p);
  // A sem internet muda um ajuste; B (com internet) muda outro
  await A.ctx.setOffline(true); await muda(A.p, {testeA:1}); await muda(B.p, {testeB:2}); await B.p.waitForTimeout(1200);
  ok((await cfg(A.p)).testeA === 1, 'sem internet, o aparelho já mostra a própria mudança');
  await A.ctx.setOffline(false); await sinc(A.p); await sinc(B.p);
  const a = await cfg(A.p), c = await cfg(B.p), srv = ((await (await A.ctx.request.get(U + '/api/sync?since=0')).json()).docs.find(d => d.path === 'config/geral') || {}).data || {};
  ok(a.testeA === 1 && a.testeB === 2 && c.testeA === 1 && c.testeB === 2 && srv.testeA === 1 && srv.testeB === 2, `quando a internet volta, os dois ajustes ficam nos dois aparelhos e no servidor (A ${a.testeA}/${a.testeB}, B ${c.testeA}/${c.testeB})`);
  // o envio de A falha, mas A continua recebendo: a mudança de B aparece e a de A continua por cima até ser enviada
  await A.p.route('**/api/doc', r => r.fulfill({status:500, contentType:'application/json', body:'{"erro":"falhou"}'}));
  await muda(A.p, {testeA:3}); await muda(B.p, {testeB:4}); await B.p.waitForTimeout(1200); await sinc(A.p);
  const d = await cfg(A.p);
  ok(d.testeA === 3 && d.testeB === 4, `envio falhando: A recebe a mudança de B e mantém a sua por cima (${d.testeA}/${d.testeB})`);
  await A.p.unroute('**/api/doc'); await sinc(A.p); await sinc(B.p);
  const e = await cfg(B.p);
  ok(e.testeA === 3 && e.testeB === 4, `quando o envio volta, B recebe a mudança de A (${e.testeA}/${e.testeB})`);
  // sair: com mudança sem enviar pergunta antes; sem internet não sai; com internet apaga a cópia do aparelho
  const copia = p => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('bolso:dono@teste.com:') || k === 'bolso:ultimo').length);
  await A.ctx.setOffline(true); await muda(A.p, {testeSair:1});
  let perguntou = 0; A.p.on('dialog', d => { perguntou++; d.dismiss(); });
  const s1 = await A.p.evaluate(() => window.__casa.sair().then(r => r, e => 'erro'));
  ok(perguntou === 1 && s1 === false && (await copia(A.p)) > 0, 'sair com mudança sem enviar: pergunta antes e, se não confirmar, nada muda');
  A.p.removeAllListeners('dialog'); A.p.on('dialog', d => d.accept());
  const s2 = await A.p.evaluate(() => window.__casa.sair().then(r => r, e => 'erro'));
  ok(s2 === 'erro' && (await copia(A.p)) > 0, 'sem internet não sai (a sessão continuaria valendo): a cópia fica');
  await A.ctx.setOffline(false); await A.p.waitForTimeout(500);
  await Promise.all([A.p.waitForNavigation({timeout:10000}).catch(() => {}), A.p.evaluate(() => window.__casa.sair().catch(() => {}))]); await A.p.waitForTimeout(1500);
  ok((await copia(A.p)) === 0 && (await A.p.evaluate(() => !!document.getElementById('bl-login'))), 'com internet, sai, apaga a cópia dos dados do aparelho e mostra o login');
  ok(!A.erros.length && !B.erros.length, `sem erro nas páginas${[...A.erros, ...B.erros][0] ? ' → ' + [...A.erros, ...B.erros][0] : ''}`);
  await b.close();
  console.log(R.join('\n')); console.log(R.some(x => x.startsWith('ERRO')) ? '❌ falhou' : '✅ tudo certo'); process.exit(R.some(x => x.startsWith('ERRO')) ? 1 : 0);
})();
