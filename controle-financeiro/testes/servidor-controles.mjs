// Teste do servidor: um e-mail em mais de um controle (ex.: a parceira vê o controle da família e é dona do controle da casa da mãe).
// Só e-mails fictícios. Rode com o servidor local num banco novo (pasta temporária), em app/:
//   npx wrangler@4 pages dev public --d1 DB=bolso-local --persist-to /tmp/bolso-teste --port 8789 --binding EMAILS_PERMITIDOS=dono@teste.com --binding ADMIN_EMAIL=dono@teste.com
// e depois: node controle-financeiro/testes/servidor-controles.mjs
const U = process.env.URL_TESTE || 'http://localhost:8789';
const R = []; const ok = (c, m) => R.push((c ? 'OK   ' : 'ERRO ') + m);
const cli = () => { let ck = ''; return async (path, opt = {}) => { const r = await fetch(U + path, {...opt, headers:{'content-type':'application/json', origin:U, ...(ck ? {cookie:ck} : {})}}); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; let j = null; try { j = await r.json(); } catch (_) {} return {s:r.status, j}; }; };
const post = (f, p, b) => f(p, {method:'POST', body:JSON.stringify(b)}), put = (f, path, data) => f('/api/doc', {method:'PUT', body:JSON.stringify({path, data})});
const paths = r => (r.j && r.j.docs || []).filter(d => !d.del).map(d => d.path);
const dono = cli(), par1 = cli(), par2 = cli();
let r = await post(dono, '/api/criar', {email:'dono@teste.com', senha:'123456', nome:'Dono'}); ok(r.s === 200, `dono cria a conta (${r.s})`);
const casaFam = (await dono('/api/eu')).j.casa.id; await put(dono, 'lanc/da-familia', {desc:'Mercado da família', valor:100});
r = await post(dono, '/api/casa', {acao:'add', email:'parceira@teste.com', papel:'ve'}); ok(r.s === 200, 'dono libera a parceira só para ver');
r = await post(par1, '/api/criar', {email:'parceira@teste.com', senha:'abcdef', nome:'Parceira'}); ok(r.s === 200, 'parceira cria a senha');
r = await post(dono, '/api/admin', {acao:'add', email:'parceira@teste.com', nome:'Casa da mãe'}); ok(r.s === 200, `o mesmo e-mail vira cliente "Casa da mãe" (antes: "Esse e-mail já tem um controle") (${r.s})`);
r = await par1('/api/eu'); const mae = (r.j.casas || []).find(c => c.nome === 'Casa da mãe');
ok((r.j.casas || []).length === 2 && mae && mae.papel === 'dono' && r.j.casa.id === casaFam, 'ela passa a ter os 2 controles e continua no da família');
r = await post(par2, '/api/entrar', {email:'parceira@teste.com', senha:'abcdef'}); ok(((await par2('/api/eu')).j.casas || []).length === 2, 'entrar de novo não apaga o controle vazio da mãe');
r = await post(par1, '/api/trocar', {id:'naoexiste'}); ok(r.s === 403, 'não abre controle de que não faz parte');
r = await post(par1, '/api/trocar', {id:mae.id}); ok(r.s === 200 && (await par1('/api/eu')).j.papel === 'dono', 'troca para a Casa da mãe, onde é dona');
r = await put(par1, 'lanc/da-mae', {desc:'Luz da casa da mãe', valor:150}); ok(r.s === 200, 'lança na Casa da mãe');
r = await par1('/api/sync?since=0'); ok(paths(r).join() === 'lanc/da-mae', 'a Casa da mãe só tem o que é dela');
r = await par2('/api/sync?since=0'); ok(paths(r).includes('lanc/da-familia') && !paths(r).includes('lanc/da-mae'), 'o outro aparelho continua no da família, sem misturar');
r = await dono('/api/sync?since=0'); ok(!paths(r).includes('lanc/da-mae'), 'o dono não vê os dados da Casa da mãe');
r = await post(dono, '/api/casa', {acao:'remove', email:'parceira@teste.com'}); ok(r.s === 200 && (await par1('/api/eu')).s === 200, 'tirar a parceira do controle da família não apaga a conta nem a Casa da mãe');
r = await post(dono, '/api/casa', {acao:'add', email:'parceira@teste.com', papel:'ve'}); ok(r.s === 200, 'dá para pôr de volta mesmo ela usando outro controle');
const idMae = (await dono('/api/admin')).j.casas.find(c => c.cliente === 'Casa da mãe').id;
await post(dono, '/api/admin', {acao:'pausar', id:idMae, valor:true}); r = await par1('/api/eu'); ok(r.s === 200 && r.j.casa.id === casaFam, 'controle aberto pausado: abre o outro sozinho');
await post(dono, '/api/admin', {acao:'pausar', id:idMae, valor:false}); await post(par1, '/api/trocar', {id:idMae});
r = await post(dono, '/api/admin', {acao:'remover', id:idMae}); const par3 = cli(); await post(par3, '/api/entrar', {email:'parceira@teste.com', senha:'abcdef'});
ok(r.s === 200 && (await par3('/api/eu')).j.casa.id === casaFam, 'remover o cliente apaga a Casa da mãe, e ela continua com a conta da família');
console.log(R.join('\n')); console.log(R.some(x => x.startsWith('ERRO')) ? '❌ falhou' : '✅ tudo certo'); process.exit(R.some(x => x.startsWith('ERRO')) ? 1 : 0);
