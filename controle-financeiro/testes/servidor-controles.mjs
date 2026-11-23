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
let r = await post(dono, '/api/criar', {email:'dono@teste.com', senha:'123456', nome:'Dono'}); ok(r.s === 400, `senha nova com menos de 8 é recusada (${r.s})`);
r = await post(dono, '/api/criar', {email:'dono@teste.com', senha:'senha-do-dono', nome:'Dono'}); ok(r.s === 200, `dono cria a conta (${r.s})`);
const casaFam = (await dono('/api/eu')).j.casa.id; await put(dono, 'lanc/da-familia', {desc:'Mercado da família', valor:100});
r = await post(dono, '/api/casa', {acao:'add', email:'parceira@teste.com', papel:'ve'}); ok(r.s === 200, 'dono libera a parceira só para ver');
r = await post(par1, '/api/criar', {email:'parceira@teste.com', senha:'senha-da-parceira', nome:'Parceira'}); ok(r.s === 200, 'parceira cria a senha');
r = await post(dono, '/api/admin', {acao:'add', email:'parceira@teste.com', nome:'Casa da mãe'}); ok(r.s === 200, `o mesmo e-mail vira cliente "Casa da mãe" (antes: "Esse e-mail já tem um controle") (${r.s})`);
r = await par1('/api/eu'); const mae = (r.j.casas || []).find(c => c.nome === 'Casa da mãe');
ok((r.j.casas || []).length === 2 && mae && mae.papel === 'dono' && r.j.casa.id === casaFam, 'ela passa a ter os 2 controles e continua no da família');
r = await post(par2, '/api/entrar', {email:'parceira@teste.com', senha:'senha-da-parceira'}); ok(((await par2('/api/eu')).j.casas || []).length === 2, 'entrar de novo não apaga o controle vazio da mãe');
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
r = await post(dono, '/api/admin', {acao:'remover', id:idMae}); const par3 = cli(); await post(par3, '/api/entrar', {email:'parceira@teste.com', senha:'senha-da-parceira'});
ok(r.s === 200 && (await par3('/api/eu')).j.casa.id === casaFam, 'remover o cliente apaga a Casa da mãe, e ela continua com a conta da família');
// Ajustes gravados por campo: dois aparelhos mudando ao mesmo tempo não apagam a mudança um do outro
const ap1 = cli(), ap2 = cli(); await post(ap1, '/api/entrar', {email:'dono@teste.com', senha:'senha-do-dono'}); await post(ap2, '/api/entrar', {email:'dono@teste.com', senha:'senha-do-dono'});
const campos = (f, patch) => f('/api/doc', {method:'PUT', body:JSON.stringify({path:'config/geral', patch})});
const cfgDe = async f => ((await f('/api/sync?since=0')).j.docs.find(d => d.path === 'config/geral' && !d.del) || {}).data || {};
await put(ap1, 'config/geral', {orc:{Mercado:500, Lazer:100}, saldo:{v:1000}});
const [c1, c2] = await Promise.all([campos(ap1, {orc:{Mercado:600}}), campos(ap2, {saldo:{v:2000, d:'2026-11-22'}})]);
let cfg = await cfgDe(ap1);
ok(c1.s === 200 && c2.s === 200 && cfg.orc && cfg.orc.Mercado === 600 && !('Lazer' in cfg.orc) && cfg.saldo.v === 2000, `dois aparelhos mudam campos diferentes ao mesmo tempo e os dois ficam (orc ${JSON.stringify(cfg.orc)}, saldo ${cfg.saldo && cfg.saldo.v})`);
await Promise.all(Array.from({length:10}, (_, i) => campos(i % 2 ? ap1 : ap2, {['k' + i]:i})));
cfg = await cfgDe(ap2);
ok(Array.from({length:10}, (_, i) => cfg['k' + i] === i).every(Boolean) && cfg.orc.Mercado === 600 && cfg.saldo.v === 2000, '10 mudanças ao mesmo tempo, nenhuma se perde');
const antes = (await ap1('/api/sync?since=0')).j.agora; await campos(ap1, {k0:'novo'});
ok(((await ap2('/api/sync?since=' + antes)).j.docs || []).some(d => d.path === 'config/geral' && d.data.k0 === 'novo'), 'o outro aparelho recebe a mudança na próxima sincronização');
ok((await campos(ap1, {'a"b':1})).s === 400 && (await campos(ap1, {})).s === 400, 'campo com nome inválido ou vazio é recusado');
r = await par3('/api/doc', {method:'PUT', body:JSON.stringify({path:'config/geral', patch:{x:1}})}); ok(r.s === 403, 'quem só vê não grava ajustes');
// Mudanças por caminho: duas pessoas mudando categorias diferentes do mesmo ajuste ao mesmo tempo não se atropelam
const ops = (f, o) => f('/api/doc', {method:'PUT', body:JSON.stringify({path:'config/geral', ops:o})});
await put(ap1, 'config/geral', {orc:{Mercado:500, Compras:100, Lazer:100}, saldo:{v:1000}});
const [o1, o2] = await Promise.all([ops(ap1, [{p:['orc', 'Compras'], v:195}]), ops(ap2, [{p:['orc', 'Lazer'], v:300}])]);
cfg = await cfgDe(ap1);
ok(o1.s === 200 && o2.s === 200 && cfg.orc.Compras === 195 && cfg.orc.Lazer === 300 && cfg.orc.Mercado === 500 && cfg.saldo.v === 1000, `Compras num aparelho e Lazer no outro, ao mesmo tempo: os dois ficam (${JSON.stringify(cfg.orc)})`);
await Promise.all(Array.from({length:8}, (_, i) => ops(i % 2 ? ap1 : ap2, [{p:['orcMes', '2026-12', 'Cat' + i], v:i}])));
cfg = await cfgDe(ap2);
ok(Array.from({length:8}, (_, i) => cfg.orcMes && cfg.orcMes['2026-12'] && cfg.orcMes['2026-12']['Cat' + i] === i).every(Boolean), '8 mudanças no mesmo mês, ao mesmo tempo, nenhuma se perde (e o mês é criado)');
r = await ops(ap1, [{p:['orc', 'Lazer'], del:true}]); cfg = await cfgDe(ap1); ok(r.s === 200 && !('Lazer' in cfg.orc) && cfg.orc.Compras === 195, 'tirar uma categoria (voltar para a média) apaga só ela');
ok((await ops(ap1, [{p:['__proto__', 'x'], v:1}])).s === 400 && (await ops(ap1, [{p:[], v:1}])).s === 400 && (await ops(ap1, [])).s === 400, 'mudança com caminho inválido é recusada');
r = await par3('/api/doc', {method:'PUT', body:JSON.stringify({path:'config/geral', ops:[{p:['x'], v:1}]})}); ok(r.s === 403, 'quem só vê não muda ajustes por caminho');
// Lembretes: a chave do agendador nunca mostra o texto; quem entrou no app vê o do controle aberto
r = await dono('/api/lembretes?chave=chave-teste&hoje=2026-11-22'); ok(r.s === 200 && !('texto' in (r.j || {})) && 'casasComWhats' in (r.j || {}), 'o endereço com a chave só diz se está tudo certo, sem o texto do lembrete');
r = await cli()('/api/lembretes?ver=1'); ok(r.s === 401, 'ver o lembrete sem entrar no app é recusado');
r = await ap1('/api/lembretes?ver=1&hoje=2026-11-22'); ok(r.s === 200 && 'texto' in (r.j || {}), 'quem entrou no app vê o lembrete de hoje do controle aberto');
// Sair dos outros aparelhos (ex.: celular perdido): este continua, os outros pedem a senha de novo
r = await post(ap1, '/api/sair', {outros:true}); ok(r.s === 200 && r.j.aparelhos >= 2, `sair dos outros aparelhos desconecta os outros (${r.j && r.j.aparelhos})`);
ok((await ap1('/api/eu')).s === 200 && (await ap2('/api/eu')).s === 401 && (await dono('/api/eu')).s === 401, 'este aparelho continua; os outros pedem a senha de novo');
ok((await par3('/api/eu')).s === 200, 'os aparelhos de outra pessoa não são afetados');
// Cliente que esqueceu a senha: quem administra libera uma nova; os dados dele continuam
const cl1 = cli(), cl2 = cli();
r = await post(ap1, '/api/admin', {acao:'add', email:'cliente@teste.com', nome:'Casa da Ana'}); ok(r.s === 200, 'quem administra libera um cliente novo');
r = await post(cl1, '/api/criar', {email:'cliente@teste.com', senha:'senha-da-ana-1', nome:'Ana'}); ok(r.s === 200, 'o cliente cria a senha em Primeiro acesso');
await put(cl1, 'lanc/da-ana', {desc:'Mercado da Ana', valor:80});
ok((await post(cl2, '/api/criar', {email:'cliente@teste.com', senha:'outra-senha-9', nome:'Ana'})).s === 409, 'sem liberar, ninguém troca a senha de quem já tem');
const idAna = (await ap1('/api/admin')).j.casas.find(c => c.cliente === 'Casa da Ana').id;
r = await post(ap1, '/api/admin', {acao:'novaSenha', id:idAna}); ok(r.s === 200 && (await cl1('/api/eu')).s === 401, 'quem administra libera nova senha: os aparelhos do cliente saem');
r = await post(cl2, '/api/criar', {email:'cliente@teste.com', senha:'outra-senha-9', nome:'Ana'});
ok(r.s === 200 && paths(await cl2('/api/sync?since=0')).includes('lanc/da-ana'), 'o cliente cria outra senha em Primeiro acesso e os dados dele continuam');
ok((await post(par3, '/api/admin', {acao:'novaSenha', id:idAna})).s === 403, 'só quem administra libera nova senha');
// trocar a senha sabendo a atual: este aparelho continua, os outros saem
const cl3 = cli(); await post(cl3, '/api/entrar', {email:'cliente@teste.com', senha:'outra-senha-9'});
ok((await post(cl2, '/api/senha', {atual:'errada-123', nova:'senha-nova-77'})).s === 401, 'trocar senha com a atual errada é recusado');
ok((await post(cl2, '/api/senha', {atual:'outra-senha-9', nova:'curta'})).s === 400, 'senha nova com menos de 8 é recusada');
r = await post(cl2, '/api/senha', {atual:'outra-senha-9', nova:'senha-nova-77'});
ok(r.s === 200 && (await cl2('/api/eu')).s === 200 && (await cl3('/api/eu')).s === 401, 'troca a senha: este aparelho continua e o outro pede a senha nova');
ok((await post(cli(), '/api/entrar', {email:'cliente@teste.com', senha:'senha-nova-77'})).s === 200 && (await post(cli(), '/api/entrar', {email:'cliente@teste.com', senha:'outra-senha-9'})).s === 401, 'entra com a senha nova; a antiga não vale mais');
// o dono do controle dá nova senha para quem esqueceu (dados continuam; ela cria outra em Primeiro acesso)
ok((await post(cl2, '/api/casa', {acao:'novaSenha', email:'parceira@teste.com'})).s === 400, 'só para quem é do controle');
const dono2 = cli(); await post(dono2, '/api/entrar', {email:'dono@teste.com', senha:'senha-do-dono'}); r = await post(dono2, '/api/casa', {acao:'novaSenha', email:'parceira@teste.com'});
const par4 = cli(); ok(r.s === 200 && (await post(par4, '/api/criar', {email:'parceira@teste.com', senha:'senha-nova-parc', nome:'Parceira'})).s === 200 && (await par4('/api/eu')).s === 200 && (await par3('/api/eu')).s === 401, 'o dono dá nova senha: os aparelhos dela saem e ela cria outra em Primeiro acesso');
console.log(R.join('\n')); console.log(R.some(x => x.startsWith('ERRO')) ? '❌ falhou' : '✅ tudo certo'); process.exit(R.some(x => x.startsWith('ERRO')) ? 1 : 0);
