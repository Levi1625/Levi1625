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
  const aparelho = async () => { const ctx = await b.newContext(), p = await ctx.newPage(), erros = []; p.on('pageerror', e => erros.push(e.message));
    const r = await ctx.request.post(U + '/api/entrar', {data:{email:'dono@teste.com', senha:'123456'}, headers:{origin:U}});
    await p.goto(U + '/'); await p.waitForTimeout(3000); return {ctx, p, erros, entrou:r.ok()}; };
  const cfg = p => p.evaluate(async () => { const db = await window.claude.use('db'); return (await db.doc('config/geral').get()).data() || {}; });
  const muda = (p, patch) => p.evaluate(async patch => { const db = await window.claude.use('db'); await db.doc('config/geral').update(patch); }, patch);
  const sinc = async p => { await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(1500); };
  const A = await aparelho(), B = await aparelho();
  ok(A.entrou && B.entrou, 'os dois aparelhos entram na mesma conta');
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
  ok(!A.erros.length && !B.erros.length, `sem erro nas páginas${[...A.erros, ...B.erros][0] ? ' → ' + [...A.erros, ...B.erros][0] : ''}`);
  await b.close();
  console.log(R.join('\n')); console.log(R.some(x => x.startsWith('ERRO')) ? '❌ falhou' : '✅ tudo certo'); process.exit(R.some(x => x.startsWith('ERRO')) ? 1 : 0);
})();
