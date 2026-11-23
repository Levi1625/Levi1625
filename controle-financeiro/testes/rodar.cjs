// Testes do Bolso em Dia com uma família fictícia (testes/familia-teste.json). Nenhum dado real.
// Rode antes de publicar: node controle-financeiro/testes/rodar.cjs   (sai com código 1 se algo falhar)
// Cada erro corrigido no app ganha um teste aqui, para não voltar.
const { chromium } = require('playwright');
const montar = require('./montar.cjs');
const ARQ = 'file://' + montar();
const R = []; let falhas = 0;
const ok = (c, t) => { R.push((c ? 'OK   ' : 'ERRO ') + t); if (!c) falhas++; };
const secao = t => R.push('\n== ' + t);

async function abrir(b, data, espera = 6000) {
  const p = await b.newPage({viewport:{width:390, height:844}}); const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.clock.setFixedTime(new Date(data + 'T10:00:00'));
  await p.goto(ARQ); await p.waitForTimeout(espera);   // espera as correções únicas do app rodarem
  return {p, erros};
}
const texto = p => p.evaluate(() => document.querySelector('main').innerText);
const ir = async (p, h) => { await p.evaluate(h => { location.hash = h; }, h); await p.waitForTimeout(350); };

// 1) As contas batem entre si (projeção, Contas dia a dia, Guardado, saldo de hoje, tela Hoje)
async function contasBatem(b, data) {
  const {p, erros} = await abrir(b, data);
  const r = await p.evaluate(() => {
    const T = window.__T, S = T.S; T.render(); const fut = T.fluxo(), near = (a, b, t = 1) => Math.abs((+a || 0) - (+b || 0)) <= t, ruim = [];
    const cx0 = S.objs.filter(o => o.nome === 'Sobras (reserva livre)' && o.status !== 'concluido').reduce((t, o) => t + T.objGuardado(o), 0);
    if (!near((T.saldoHoje() ?? 0) + cx0 + fut[0].entra - fut[0].sai - fut[0].cobre, fut[0].livre)) ruim.push('mês atual não parte do saldo de hoje');
    fut.forEach((x, i) => { if (!near(x.contaFim + x.cx, x.livre)) ruim.push(`${x.m}: conta + caixinha ≠ total`);
      const P = T.partesMes(x, i); if (!near(P.fx + P.fat + P.dia + Object.values(P.obj).reduce((t, v) => t + v, 0), x.sai + x.cobre)) ruim.push(`${x.m}: partes do mês ≠ o que sai`); });
    fut.slice(1).forEach(x => { const lm = T.linhaMes(x.m); if (!lm.saldoD) return; const v = Object.values(lm.saldoD);
      if (Math.min(...v) < -1) ruim.push(`${x.m}: conta fica negativa (${Math.round(Math.min(...v))})`);
      if (!near(lm.saldoD[lm.nd], Math.max(0, x.contaFim), 1.5)) ruim.push(`${x.m}: Contas termina ${Math.round(lm.saldoD[lm.nd])}, projeção ${Math.round(x.contaFim)}`); });
    // saldo de hoje refeito à mão: já no saldo o que é de antes do dia do saldo; data futura = agendado
    const sd = S.cfg.saldo, hoje = T.hoje(); let v = +sd.v;
    S.lanc.forEach(l => { const em = String(l.criado || '') <= sd.em, no = !l.data || !sd.d ? em : (l.data < sd.d || (l.data === sd.d && em)); if (no || (l.data && l.data > hoje)) return;
      if (l.tipo === 'receita') { if (!T.isVARec(l)) v += +l.valor; } else if (['pix', 'debito', 'dinheiro', 'boleto', 'transferencia'].includes(l.meio)) v -= +l.valor; });
    Object.values(S.cfg.faturasPagas || {}).forEach(fp => { if (fp && fp.em > sd.em) v -= +fp.v || 0; });
    S.objs.forEach(o => (o.movs || []).forEach(mv => { if (mv.em && mv.em > sd.em && mv.t !== 'passar') v -= +mv.v; }));
    if (!near(v, T.saldoHoje(), 0.02)) ruim.push(`saldo de hoje ${T.saldoHoje()} ≠ refeito ${v.toFixed(2)}`);
    const G = T.guardadoMesAMes(); G.out.forEach((l, i) => { if (!near(l.sobras, Math.max(0, fut[i].cx))) ruim.push(`${l.m}: Guardado Sobras ≠ projeção`); if (Object.values(l.cx).some(x => x < -0.5)) ruim.push(`${l.m}: caixinha negativa`); });
    return {ruim, pode:Math.round(T.podeGastar().total)};
  });
  ok(!r.ruim.length, `${data}: projeção, Contas, Guardado e saldo de hoje batem${r.ruim.length ? ' → ' + r.ruim.slice(0, 4).join('; ') : ''}`);
  await ir(p, '#inicio'); const h = (await texto(p)).match(/Pode gastar até [^\n]*\n+R\$\s*([\d.]+)/);
  if (h) ok(+h[1].replace(/\./g, '') === r.pode, `${data}: tela Hoje mostra o mesmo "pode gastar" (${h[1]} × ${r.pode})`);
  ok(!erros.length, `${data}: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`);
  await p.close();
}

// 2) Cada gasto mexe exatamente no número certo
async function gastos(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  const foto = () => p.evaluate(() => { const T = window.__T; T.render(); const g = T.podeGastar(), f = T.fluxo(); return {pode:g.total, comida:g.comida, vale:T.saldoVAHoje() || 0, conta:T.saldoHoje(), dez:f[1].livre}; });
  // dia = dia a dia fora comida (desconta do pode gastar) · comida = só da comida · fora = fora do dia a dia (sai da sobra do mês)
  const casos = [
    ['Padaria 30 no pix', 'comida', {valor:30, desc:'Padaria', cat:'Restaurantes e lanches', meio:'pix'}],
    ['Restaurante 40 no vale', 'comida', {valor:40, desc:'Restaurante', cat:'Restaurantes e lanches', meio:'va'}],
    ['Mercado 35 no cartão', 'comida', {valor:35, desc:'Mercado', cat:'Mercado', meio:'credito', cartaoId:'azul'}],
    ['Bar 50 no pix', 'dia', {valor:50, desc:'Bar', cat:'Bares e saídas', meio:'pix'}],
    ['Gasolina 100 no cartão', 'dia', {valor:100, desc:'Gasolina', cat:'Transporte', meio:'credito', cartaoId:'azul'}],
    ['Farmácia 25 no débito', 'dia', {valor:25, desc:'Farmácia', cat:'Saúde', meio:'debito'}],
    ['Presente 60 (categoria sem limite)', 'dia', {valor:60, desc:'Presente', cat:'Presentes & doações', meio:'pix'}],
    ['Multa 90 (fora do dia a dia)', 'fora', {valor:90, desc:'Multa', cat:'Impostos & taxas', meio:'pix'}],
    ['Consulta 200 (saúde fora da farmácia)', 'fora', {valor:200, desc:'Consulta médica', cat:'Saúde', meio:'pix'}],
  ];
  let a = await foto();
  for (const [nome, tipo, o] of casos) {
    await p.evaluate(async o => { const T = window.__T; await T.criarLanc({tipo:'despesa', data:T.hoje(), nparc:1, ...o}); }, o); await p.waitForTimeout(250);
    const d = await foto(), v = o.valor, dP = d.pode - a.pode, dC = d.comida - a.comida, dT = d.dez - a.dez;
    const eP = tipo === 'dia' ? Math.max(-v, -a.pode) : 0, eC = tipo === 'comida' ? Math.max(-v, -a.comida) : 0;
    const bom = Math.abs(dP - eP) < 0.6 && Math.abs(dC - eC) < 0.6 && (o.meio !== 'va' || Math.abs(d.vale - a.vale + v) < 0.6) && (tipo !== 'dia' || a.pode < v || Math.abs(dT) < 0.6) && (tipo !== 'fora' || (dT <= 0.6 && dT >= -v - 0.6));
    ok(bom, `${nome}: pode gastar ${dP.toFixed(0)} (esperado ${eP.toFixed(0)}) · comida ${dC.toFixed(0)} (esperado ${eC.toFixed(0)}) · fim de dez ${dT.toFixed(0)}`); a = d; }
  ok(!erros.length, `gastos: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3) Gasto com data no futuro é agendado (não sai da conta hoje)
async function agendado(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  const foto = () => p.evaluate(() => { const T = window.__T; T.render(); const f = T.fluxo(), g = T.podeGastar(), by = m => f.find(x => x.m === m), fim = m => { const lm = T.linhaMes(m); return lm.saldoD[lm.nd]; };
    return {conta:T.saldoHoje(), dia:g.dia, pode:g.total, reserva:g.reserva, nov:by('2026-11').livre, jan:by('2027-01').livre, fimJan:fim('2027-01'), contaFimJan:Math.max(0, by('2027-01').contaFim)}; });
  const a = await foto();
  await p.evaluate(async () => { const T = window.__T; await T.criarLanc({tipo:'despesa', valor:2500, desc:'Reforma do banheiro', cat:'Moradia', data:'2027-01-30', meio:'pix', nparc:1}); await T.criarLanc({tipo:'despesa', valor:300, desc:'Conserto do portão', cat:'Moradia', data:'2026-11-28', meio:'pix', nparc:1}); });
  await p.waitForTimeout(300); const d = await foto();
  ok(Math.abs(d.conta - a.conta) < 0.6, `"Na conta" não muda no dia em que lança (${a.conta} → ${d.conta})`);
  ok(Math.abs(d.pode - a.pode) < 0.6, `o "pode gastar" de hoje não muda (${Math.round(a.pode)} → ${Math.round(d.pode)})`);
  ok(Math.abs(d.nov - a.nov + 300) < 0.6 && Math.abs(d.jan - a.jan + 2800) < 0.6, `cada um entra no mês da data (nov ${Math.round(d.nov - a.nov)}, jan acumulado ${Math.round(d.jan - a.jan)})`);
  ok(Math.abs(d.fimJan - d.contaFimJan) < 2, 'Contas de janeiro fecha igual à projeção');
  await ir(p, '#contas'); ok(/28 NOV[\s\S]{0,200}Conserto do portão[\s\S]{0,40}agendado/i.test(await texto(p)), 'Contas de novembro: conserto no dia 28, "agendado"');
  await ir(p, '#inicio'); { const t = await texto(p); ok(/Próxima entrada: /.test(t) && /Próxima conta: /.test(t), 'Hoje › Próximos dias mostra a próxima entrada e a próxima conta (o calendário inteiro fica em Mês)'); }
  await p.clock.setFixedTime(new Date('2027-01-31T10:00:00')); const z = await p.evaluate(() => { window.__T.render(); return window.__T.saldoHoje(); });
  ok(Math.abs(d.conta - z - 2800) < 0.6, `quando a data chega, sai da conta (${Math.round(d.conta - z)})`);
  ok(!erros.length, `agendado: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3b) Mexer num mês à frente nunca muda o "pode gastar" de hoje (vira aviso)
async function futuroNaoMexe(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  const g = () => p.evaluate(() => { const T = window.__T; T.render(); const x = T.podeGastar(); return {pode:x.total, falta:x.falta, pior:x.pior, livre:x.livre}; });
  const a = await g();
  await p.evaluate(async () => { await window.__T.criarLanc({tipo:'despesa', valor:15000, desc:'Reforma grande', cat:'Moradia', data:'2027-03-15', meio:'pix', nparc:1}); }); await p.waitForTimeout(300);
  const d = await g();
  ok(d.falta > 0, `o gasto de março deixa um mês negativo (${d.pior})`);
  ok(Math.abs(d.pode - a.pode) < 0.6, `mesmo assim o "pode gastar" de hoje não muda (${Math.round(a.pode)} → ${Math.round(d.pode)})`);
  ok(d.livre < 0 && Math.abs(d.livre + d.falta) < 1, `"tirando tudo" fica negativo e mostra quanto falta (${Math.round(d.livre)})`);
  await ir(p, '#planos'); ok(/Falta tirando tudo: .* em mar\/27/.test(await texto(p)), 'Ano mostra "Falta tirando tudo … em mar/27"');
  ok(!erros.length, `mês futuro: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3c) Categoria estourada: novo gasto do dia a dia ainda desconta (as sem limite entram na mesma conta)
async function estourada(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  const pode = () => p.evaluate(() => { const T = window.__T; T.render(); return T.podeGastar().total; });
  const gasta = (desc, cat, valor) => p.evaluate(async o => { await window.__T.criarLanc({tipo:'despesa', data:window.__T.hoje(), meio:'pix', nparc:1, ...o}); }, {desc, cat, valor});
  const a = await pode();
  await gasta('Show grande', 'Lazer', Math.round(a - 60)); await p.waitForTimeout(250);
  const d = await pode();
  ok(Math.abs(d - 60) < 1, `estourou o Lazer: sobra o que falta no total do dia a dia (${Math.round(a)} → ${Math.round(d)}, esperado 60)`);
  await gasta('Bar', 'Bares e saídas', 30); await p.waitForTimeout(250);
  const e = await pode();
  ok(Math.abs(e - 30) < 1, `mais um gasto depois de estourar ainda desconta (${Math.round(d)} → ${Math.round(e)})`);
  await gasta('Cabeleireiro', 'Cuidados pessoais', 50); await p.waitForTimeout(250);
  const f = await pode();
  ok(Math.abs(f) < 1, `categoria sem limite também desconta, até zerar (${Math.round(e)} → ${Math.round(f)})`);
  ok(!erros.length, `estourada: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3d) A confirmação do lançamento diz o que mudou no "pode gastar" ou por que não mudou
async function confirmacao(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  const lanca = (txt, item) => p.evaluate(async ([txt, item]) => { const T = window.__T; window.__AI = {acao:'lancar', itens:[{data:T.hoje(), meio:'pix', ...item}]}; const r = await T.lancarTexto(txt); return T.resHTML(r).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }, [txt, item]);
  let h = await lanca('bar 50 pix', {tipo:'despesa', valor:50, desc:'Bar', cat:'Bares e saídas'});
  ok(/Pode gastar: R\$\s*[\d.]+ → R\$\s*[\d.]+/.test(h), `gasto do dia a dia mostra "Pode gastar: antes → depois" (${(h.match(/Pode gastar[^·]*/) || [''])[0].trim()})`);
  h = await lanca('padaria 9 pix', {tipo:'despesa', valor:9, desc:'Padaria', cat:'Restaurantes e lanches'});
  ok(/Pode gastar continua/.test(h) && /Comida: falta/.test(h) && /comida paga na conta/.test(h), 'comida pela conta explica: pode gastar continua, comida diminui');
  h = await lanca('reforma 500 dia 30/01 pix', {tipo:'despesa', valor:500, desc:'Reforma', cat:'Moradia', data:'2027-01-30'});
  ok(/agendado para/.test(h), 'agendado explica que só sai no dia');
  ok(!erros.length, `confirmação: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3e) Regras do "pode gastar": média (não o projetado), Saúde só farmácia, nunca mais que o dinheiro livre
async function regrasPode(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  const g = () => p.evaluate(() => { const T = window.__T; T.render(); const x = T.podeGastar(), d = T.diaDiaBase(), f = T.fluxo();
    return {total:x.total, livre:x.livre, somaFalta:d.lista.reduce((t, c) => t + c.falta, 0), resto:d.resto, projMedia:d.lista.every(c => c.mudou || Math.abs(c.proj - c.media) < 0.6), lazer:(d.lista.find(c => c.c === 'Lazer') || {}).media, dez:f[1].livre, orc:Object.keys(T.S.cfg.orc || {})}; });
  const a = await g();
  ok(!a.orc.some(c => ['Lazer', 'Compras', 'Bares e saídas', 'Transporte', 'Saúde', 'Outros'].includes(c)) && a.orc.includes('Mercado'), `valores antigos do dia a dia voltaram para a média; comida continua (${a.orc.join(', ')})`);
  ok(a.projMedia, 'sem valor mudado, o projetado de cada categoria é a média');
  ok(Math.abs(a.somaFalta - a.resto) < 1 && Math.abs(a.total - a.resto) < 0.6, `a soma do que falta em cada categoria é o pode gastar (${Math.round(a.somaFalta)} × ${Math.round(a.total)})`);
  await p.evaluate(v => { const S = window.__T.S; return S.db.doc('config/geral').set({...S.cfg, orcMes:{...(S.cfg.orcMes || {}), '2026-11':{Lazer:v + 500}}}); }, a.lazer); await p.waitForTimeout(300);
  const d = await g();
  ok(Math.abs(d.total - a.total - 500) < 0.6, `projetar R$ 500 a mais em Lazer aumenta o pode gastar em R$ 500 (${Math.round(a.total)} → ${Math.round(d.total)})`);
  ok(Math.abs(a.dez - d.dez - 500) < 0.6, `e o dinheiro no fim de dezembro diminui R$ 500 (${Math.round(a.dez)} → ${Math.round(d.dez)})`);
  await p.evaluate(() => { const S = window.__T.S; return S.db.doc('config/geral').set({...S.cfg, orcMes:{...(S.cfg.orcMes || {}), '2027-03':{Lazer:2000}}}); }); await p.waitForTimeout(300);
  const e = await g();
  ok(Math.abs(e.total - d.total) < 0.6, `mudar o projetado de março não muda o pode gastar de hoje (${Math.round(d.total)} → ${Math.round(e.total)})`);
  await p.evaluate(async () => { await window.__T.criarLanc({tipo:'despesa', valor:30, desc:'Drogaria', cat:'Saúde', data:window.__T.hoje(), meio:'pix', nparc:1}); }); await p.waitForTimeout(300);
  const f = await g();
  ok(Math.abs(f.total - e.total + 30) < 0.6, `farmácia desconta (${Math.round(e.total)} → ${Math.round(f.total)})`);
  await p.evaluate(() => { const S = window.__T.S; return S.db.doc('config/geral').set({...S.cfg, saldo:{...S.cfg.saldo, v:-9000}}); }); await p.waitForTimeout(300);
  const h = await g();
  ok(Math.abs(h.total - f.total) < 0.6 && h.livre < 0, `com pouco dinheiro, o pode gastar não some: o "tirando tudo" fica negativo para ajustar (${Math.round(h.total)} · ${Math.round(h.livre)})`);
  await ir(p, '#planos'); ok(/Falta tirando tudo/.test(await texto(p)), 'Ano mostra "Falta tirando tudo"');
  await ir(p, '#inicio'); ok(/a conta não fecha: faltam R\$/.test(await texto(p)), 'Hoje mostra a frase mais urgente: a conta não fecha até o salário');
  ok(!erros.length, `regras: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3f) Tela Hoje clara (pedido do dono + análise do Cursor): pode gastar é sempre o número grande; por dia = total ÷ dias contando hoje;
// a lista soma o total; quem passou vem primeiro; uma regra só (proporcional) para passar do projetado e para "Terminei";
// comida aparece (também com o vale vazio); um aviso só; próximo aperto no topo; Como calculei cabe no celular.
async function hojeClara(b) {
  const {p, erros} = await abrir(b, '2026-11-22'); await ir(p, '#inicio');
  const le = () => p.evaluate(() => { const T = window.__T; T.render(); const sec = document.getElementById('faltaGastar'), DD = T.diaDiaBase(), g = T.podeGastar();
    const rows = sec ? [...sec.querySelectorAll('.lw')].map(w => ({g:w.dataset.g, t:w.querySelector('.t1').textContent, s:w.querySelector('.t2').textContent, v:+w.querySelector('.am').textContent.replace(/\D/g, ''), manter:!!w.querySelector('[data-a="projManter"]')})) : [];
    const n2 = [...document.querySelectorAll('.hz .num2 b')].map(b => getComputedStyle(b).fontSize);
    return {dd:rows.filter(r => r.g === 'dia'), com:rows.filter(r => r.g === 'com'), rows, txt:sec ? sec.innerText : '', hero:(document.querySelector('.hz') || {}).innerText || '', main:document.querySelector('main').innerText, n2,
      total:g.total, porDia:g.porDia, dias:g.dias, livre:g.livre, pior:g.pior, lim:g.limCaixa, pdc:g.porDiaCaixa, livre1:g.pj.livre1, DD, CM:T.comidaMes(T.ymNow()), aj:T.ajusteMes(T.ymNow()),
      nAv:document.querySelectorAll('#aviso1 .av1').length, mais:!!document.querySelector('[data-a="avisosTodos"]'), av:T.avisosHoje(T.ymNow()).map(a => ({h:a.h, ap:!!a.ap})), ap:T.proxAperto()}; });
  const soma = a => a.reduce((t, x) => t + x.v, 0), gasta = (o, data) => p.evaluate(async ([o, data]) => { const T = window.__T; await T.criarLanc({tipo:'despesa', data:data || T.hoje(), meio:'pix', nparc:1, ...o}); }, [o, data || null]);
  const cfg = o => p.evaluate(o => { const S = window.__T.S; return S.db.doc('config/geral').set({...S.cfg, ...o}); }, o);
  let a = await le();
  ok(a.dias === 9 && Math.abs(a.porDia - a.total / 9) < 0.01, `por dia = pode gastar ÷ 9 dias, contando hoje (${Math.round(a.porDia)} = ${Math.round(a.total)} ÷ ${a.dias})`);
  ok(/9 dias \(com hoje\)/.test(a.txt), 'a lista diz os mesmos 9 dias do "por dia"');
  ok(soma(a.dd) === Math.round(a.total), `os valores da lista somam o pode gastar (${soma(a.dd)} × ${Math.round(a.total)})`);
  ok(soma(a.com) === Math.round(a.CM.falta) && a.com.length === a.CM.lista.length, `a comida da lista soma o "Comida à parte" (${soma(a.com)} × ${Math.round(a.CM.falta)})`);
  ok(/Pode gastar até/.test(a.hero) && !/Segure/.test(a.hero), 'o topo mostra o pode gastar como número grande');
  ok(a.n2.length === 2 && a.n2[0] === a.n2[1] && /Pode gastar até[\s\S]*Vale \(comida\)/.test(a.hero) && !/tirando tudo|Comprometido/.test(a.hero), `a decisão de agora: pode gastar (salário) e vale (comida), do mesmo tamanho (${a.n2.join(' × ')})`);
  await ir(p, '#planos'); const ano = await p.evaluate(() => document.querySelector('main').innerText); await ir(p, '#inicio');
  ok(a.livre >= 0 ? new RegExp(`O que segura ${a.pior.slice(5) === '11' ? 'nov' : '[a-z]{3}'}\\/\\d\\d\\s*R\\$\\s*[\\d.]+`).test(ano) && /O mês mais justo é (este \()?[a-z]{3}\/\d\d/.test(ano) : /Falta tirando tudo/.test(ano), `a sobra tem o nome do mês, na tela Ano (${(ano.match(/O que segura[^\n]*\n[^\n]*/) || [''])[0].replace(/\n/g, ' ')})`);
  // quem passou vem primeiro e o resto cobre proporcional ao que faltava em cada uma
  const lz = a.DD.lista.find(x => x.c === 'Lazer');
  if (!(lz.passou > 0.5)) { await gasta({valor:Math.round(lz.falta + 50), desc:'Show', cat:'Lazer'}); await p.waitForTimeout(250); a = await le(); }
  const ks = a.DD.lista.filter(x => x.era > 0.5).map(x => x.falta / x.era);
  ok(a.dd[0].t === 'Lazer' && /passou R\$\s*[\d.]+ do projetado/.test(a.dd[0].s), `quem passou do projetado vem primeiro (${a.dd[0].t}: ${a.dd[0].s.slice(0, 40)})`);
  ok(ks.length > 1 && ks.every(k => Math.abs(k - ks[0]) < 0.01), `o excesso sai das outras proporcional ao que faltava em cada uma (${ks.map(k => k.toFixed(3)).join(' ')})`);
  ok(a.dd.slice(1).some(x => /era R\$\s*[\d.]+; R\$\s*[\d.]+ cobri(ram|u) Lazer/.test(x.s)), 'a linha mostra "era R$ X; R$ Y cobriram Lazer"');
  ok(a.dd.slice(1).every(x => { const m = x.s.match(/era R\$\s*([\d.]+); R\$\s*([\d.]+) cobri/); return !m || +m[1].replace(/\./g, '') - +m[2].replace(/\./g, '') === x.v; }), '"era" menos "cobriram" fecha com o valor da linha');
  ok(soma(a.dd) === Math.round(a.total), `depois de passar, a lista ainda soma o pode gastar (${soma(a.dd)} × ${Math.round(a.total)})`);
  ok(a.DD.lista.every(x => Math.abs(a.aj.lim[x.c] - (x.gasto + x.falta)) < 0.02), 'a conta do mês (ajusteMes) usa o mesmo projetado do pode gastar');
  const al = (await p.evaluate(() => window.__T.alertasMes(window.__T.ymNow()).map(x => x.h).join(' | '))).replace(/<[^>]+>/g, '');
  ok(/Lazer passou R\$\s*[\d.,]+ do projetado/.test(al) && /proporcional ao que faltava/.test(al) && !/igualmente| cada \(/.test(al), 'o aviso diz "passou do projetado" e que saiu das outras proporcional');
  ok(a.nAv === Math.min(1, a.av.length) && a.mais === (a.av.length > 1) && !/Meta do mês/.test(a.main) && !a.av.some(x => /passou .* do projetado/.test(x.h)), `no máximo um aviso no topo (${a.nAv} de ${a.av.length}); o estouro fica na lista, com o botão`);
  ok(a.rows.filter(r => / passou R\$/.test(r.s)).every(r => r.manter) && a.rows.some(r => r.manter), 'quem passou tem o botão "manter este valor só neste mês"');
  const conf = await p.evaluate(async () => { const T = window.__T; window.__AI = {acao:'lancar', itens:[{data:T.hoje(), meio:'pix', tipo:'despesa', valor:20, desc:'Cinema', cat:'Lazer'}]}; const r = await T.lancarTexto('cinema 20 pix'); return T.resHTML(r).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); });
  ok(/passou R\$\s*[\d.,]+ do projetado do mês\. Saiu das outras categorias, proporcional/.test(conf) && !/igualmente/.test(conf), 'a confirmação do lançamento usa a mesma regra proporcional');
  // "Terminei este gasto": o que sobrou vai para as outras, o total não muda
  a = await le(); const fe = a.DD.lista.filter(x => x.c !== 'Lazer' && x.falta > 0.5).sort((x, y) => y.falta - x.falta)[0];
  await cfg({orcFech:{[await p.evaluate(() => window.__T.ymNow())]:[fe.c]}}); await p.waitForTimeout(250);
  const t = await le(), feD = t.DD.lista.find(x => x.c === fe.c);
  ok(Math.abs(t.total - a.total) < 0.6 && feD.falta === 0 && t.dd.some(x => /terminado no mês/.test(x.s)), `"Terminei" em ${fe.c}: o que sobrou vai para as outras e o pode gastar fica igual (${Math.round(a.total)} → ${Math.round(t.total)})`);
  ok(soma(t.dd) === Math.round(t.total), 'com uma categoria terminada, a lista ainda soma o pode gastar');
  await cfg({orcFech:{}}); await p.waitForTimeout(250);
  // comida: passou num limite de comida sai das outras de comida (proporcional); vale vazio aparece no topo
  const rs = a.CM.lista.find(x => x.c === 'Restaurantes e lanches');
  await gasta({valor:Math.round(rs.falta + 20), desc:'Restaurante', cat:'Restaurantes e lanches'}); await p.waitForTimeout(250);
  const c = await le(), rsC = c.CM.lista.find(x => x.c === 'Restaurantes e lanches'), outC = c.CM.lista.filter(x => x.tirado > 0.005).map(x => x.tirado / (x.falta + x.tirado));
  ok(Math.abs(rsC.passou - 20) < 1 && c.com[0].t === 'Restaurantes e lanches' && /passou R\$\s*20 do limite/.test(c.com[0].s), `comida que passou aparece na lista (${c.com[0].t}: ${c.com[0].s.slice(0, 30)})`);
  ok(outC.length > 1 && outC.every(k => Math.abs(k - outC[0]) < 0.01), `o que passou na comida sai das outras de comida, proporcional (${outC.map(k => k.toFixed(3)).join(' ')})`);
  ok(soma(c.com) === Math.round(c.CM.falta), 'a comida da lista ainda soma o total de comida');
  await cfg({saldoVA:{v:5, d:'2026-11-22', em:new Date('2026-11-22T12:00:00').toISOString()}}); await p.waitForTimeout(250);
  const v = await le();
  ok(/comida agora sai da conta e come o salário até o dia 26/.test(v.hero) && /o vale acabou: sai da conta até o dia 26/.test(v.txt) && v.com.every(r => /sai da conta/.test(r.s)), 'com o vale vazio, o número do vale avisa e a comida da lista vem com "sai da conta"');
  // a conta até o dinheiro cair: vira frase, não muda o número
  await cfg({saldo:{...(await p.evaluate(() => window.__T.S.cfg.saldo)), v:(await p.evaluate(() => window.__T.S.cfg.saldo.v)) - (v.livre1 - 60)}}); await p.waitForTimeout(250);
  const l = await le();
  ok(l.lim && Math.abs(l.porDia - l.total / l.dias) < 0.01 && /a conta aguenta R\$\s*[\d.]+ por dia/.test(l.hero), `pouco dinheiro até o salário: o por dia continua ${Math.round(l.porDia)} e a frase diz que a conta aguenta ${Math.round(l.pdc)} por dia`);
  await cfg({saldo:{...(await p.evaluate(() => window.__T.S.cfg.saldo)), v:(await p.evaluate(() => window.__T.S.cfg.saldo.v)) - 200}}); await p.waitForTimeout(250);
  const n = await le();
  ok(n.livre1 < 0 && /Pode gastar até/.test(n.hero) && /a conta não fecha: faltam R\$/.test(n.hero) && !/Segure/.test(n.hero), 'conta que não fecha até o salário: o pode gastar continua no topo e o aviso vira frase');
  await cfg({saldo:{...(await p.evaluate(() => window.__T.S.cfg.saldo)), v:2200}}); await p.waitForTimeout(250);
  // próximo aperto: dezembro precisa de mais do que novembro deixa
  const f0 = await p.evaluate(() => { const T = window.__T; return {livre:T.fluxo()[0].livre, folga:T.folgaInfo(T.ymNow()).v}; });
  await gasta({valor:Math.round(f0.livre - f0.folga + 300), desc:'Conserto grande', cat:'Moradia'}, '2026-12-02'); await p.waitForTimeout(300);
  const z = await le(), cv = await p.evaluate(() => { const T = window.__T; return {livre:T.fluxo()[0].livre, f:T.folgaInfo(T.ymNow())}; });
  ok(z.ap && z.ap.m === '2026-12' && Math.abs(z.ap.falta - (cv.f.v - cv.livre)) < 0.6 && z.ap.falta > 250, `próximo aperto em dez: faltam ${z.ap ? Math.round(z.ap.falta) : '?'} até o dinheiro entrar`);
  ok(z.ap && cv.livre + cv.f.curva[z.ap.dia - 1] < 0 && (z.ap.dia === 1 || cv.livre + cv.f.curva[z.ap.dia - 2] >= -0.5), `o dia do aperto é o dia em que a conta zera (${z.ap && z.ap.dia})`);
  ok(/Próximo aperto, \d+ de dez(: saem [^.]+)?\. Faltam R\$\s*[\d.]+ na conta até o dinheiro entrar/.test(z.hero) && !z.av.some(x => x.ap), `a frase do topo é o próximo aperto, com o que sai antes (${(z.hero.match(/Próximo aperto[^\n]*/) || [''])[0]})`);
  // Como calculei em cartões (cabe no celular)
  await p.locator('[data-a="porDiaDet"]').first().click(); await p.waitForTimeout(300);
  const det = await p.evaluate(() => ({t:document.body.innerText, n:document.querySelectorAll('.cc-row').length, larg:Math.max(...[...document.querySelectorAll('.cc-row')].map(e => e.scrollWidth - e.clientWidth))}));
  ok(/contando hoje/.test(det.t) && det.n >= z.DD.lista.length && det.larg <= 1, `Como calculei: ${det.n} cartões sem rolar para o lado e o por dia explicado`);
  // as mesmas regras nos itens de um plano e nas contas de apoio
  const u = await p.evaluate(() => { const T = window.__T, S = T.S, L0 = S.lanc;
    S.lanc = [...L0, {id:'tz1', tipo:'despesa', valor:400, objId:'planoTeste', objItem:'c', data:'2026-11-22', mes:'2026-11', cat:'Viagens', desc:'Comida da viagem'}];
    const r = T.objTetos({id:'planoTeste', itens:[{id:'a', cat:'Hotel', prev:1000}, {id:'b', cat:'Passeios', prev:500}, {id:'c', cat:'Comida', prev:300}]}); S.lanc = L0;
    return {a:r.a.teto, b:r.b.teto, c:r.c.teto, i:T.inteiros([1.4, 1.4, 1.2], 4), rp:T.repartir({x:100, y:300}, -40).d}; });
  ok(Math.abs(u.a - (1000 - 100 * 1000 / 1500)) < 0.01 && Math.abs(u.b - (500 - 100 * 500 / 1500)) < 0.01, `itens de um plano: o que passou sai dos outros proporcional (hotel ${u.a.toFixed(2)}, passeios ${u.b.toFixed(2)})`);
  ok(u.i.reduce((t, x) => t + x, 0) === 4 && Math.abs(u.rp.x + 10) < 0.01 && Math.abs(u.rp.y + 30) < 0.01, `arredonda somando o total (${u.i.join('+')}) e reparte proporcional (−10 / −30)`);
  ok(!erros.length, `tela Hoje: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3g) Contas e Planos claros (análise do Cursor): resumo que cabe no celular, falta receber separado em conta e vale,
// dia a dia sem impostos (outros à parte), a hipótese do "conta ≈", gráfico de Planos em reais e cada plano numa barra só
async function contasPlanos(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  // imposto que aparece todo mês na média (ex.: IPVA parcelado): não pode entrar no "Previsto no dia a dia"
  await p.evaluate(async () => { const T = window.__T; for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) await T.criarLanc({tipo:'despesa', valor:60, desc:'IPVA parcela', cat:'Impostos & taxas', data:m + '-10', meio:'pix', nparc:1}); });
  await p.waitForTimeout(300); await ir(p, '#contas');
  const c = await p.evaluate(() => { const T = window.__T, txt = document.querySelector('main').innerText, r3 = [...document.querySelectorAll('.res3 .r3')].map(e => e.innerText.replace(/\s+/g, ' ')), g = T.podeGastar();
    const cort = [...document.querySelectorAll('#cortar .li')].map(e => ({g:e.dataset.g, t:e.querySelector('.t1').textContent, s:e.querySelector('.t2').textContent, v:+e.querySelector('.am').textContent.replace(/\D/g, '')}));
    const main = document.querySelector('main'); return {txt, r3, cort, nao:(document.getElementById('naoCortar') || {}).innerText || '', h2:(document.querySelector('#cortar h2') || {}).textContent || '', pode:Math.round(g.total), com:Math.round(g.CM.falta), larg:main.scrollWidth - main.clientWidth}; });
  const rec = c.r3.find(x => /^Falta receber/.test(x)) || '', nums = (rec.match(/R\$\s*[\d.]+/g) || []).map(x => +x.replace(/\D/g, ''));
  ok(/^Falta receber na conta R\$\s*3\.000 e mais R\$\s*1\.800 no vale \(só para comida\)/.test(rec) && nums.length === 2, `"Falta receber" mostra grande só o que cai na conta; o vale vem à parte (${rec})`);
  ok(c.r3.length === 3 && c.larg <= 1, 'o resumo do Mês fica em linhas e nada passa da largura do celular');
  const dia = c.cort.filter(x => x.g === 'dia'), com = c.cort.filter(x => x.g === 'com'), soma = dia.reduce((t, x) => t + x.v, 0);
  ok(/Não dá para cortar/.test(c.nao) && /Aluguel|Financiamento|Energia|Academia/.test(c.nao), `Mês › "Não dá para cortar" lista o que o salário já deve`);
  ok(soma === c.pode && c.cort.every(x => /já foi R\$\s*[\d.]+ · previsto R\$\s*[\d.]+/.test(x.s)), `Mês › "Dá para cortar": o dia a dia soma o pode gastar e cada linha mostra já foi × previsto (${soma} × ${c.pode})`);
  ok(!c.cort.some(x => /Impostos/.test(x.t)) && /Impostos/.test(c.nao), 'imposto da média fica em "Não dá para cortar", fora do dia a dia');
  ok(com.length > 0 && com.reduce((t, x) => t + x.v, 0) === c.com, 'a comida está em "Dá para cortar", com a sua etiqueta');
  ok(/O "conta ≈" de cada dia vale se o dia a dia que falta sair aos poucos/.test(c.txt), 'Mês diz a hipótese dos saldos de cada dia');
  await ir(p, '#planos');
  const pl = await p.evaluate(() => { const main = document.querySelector('main'), T = window.__T; return {txt:main.innerText, larg:main.scrollWidth - main.clientWidth, rola:!!document.querySelector('.pl-rola'),
    planos:[...document.querySelectorAll('.plano')].map(e => ({t:e.innerText.replace(/\s+/g, ' '), barras:e.querySelectorAll('.pbar span').length})), prev:T.S.objs.filter(o => o.status !== 'concluido').map(o => (o.itens || []).reduce((t, i) => t + (+i.prev || 0), 0))}; });
  ok(!/R\$ mil|2,5 = R\$/.test(pl.txt) && /R\$\s*[\d.]+\s*\n?\s*nov\/26/.test(pl.txt) && pl.rola && pl.larg <= 1 && /▼/.test(pl.txt), 'Ano: o fim de cada mês em reais, o mais justo marcado, rolando para o lado sem estourar a tela');
  ok(pl.planos.length > 0 && pl.planos.every(x => { const v = ['já pago', 'guardado', 'falta'].map(k => +((x.t.match(new RegExp(k + ' R\\$\\s*([\\d.]+)')) || [])[1] || 'NaN').replace(/\./g, '')), tot = +((x.t.match(/· R\$\s*([\d.]+)/) || [])[1] || 'NaN').replace(/\./g, ''); return x.barras === 2 && v.every(n => !isNaN(n)) && v[0] + v[1] + v[2] === tot; }), `cada plano numa barra só: já pago + guardado + falta = total (${pl.planos.map(x => x.t.slice(0, 60)).join(' | ')})`);
  ok(!erros.length, `Contas e Planos: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3h) Segurança no aparelho: a senha de 4 números é oferecida uma vez no app instalado; depois de 5 erros, espera
// (e recarregar não zera); "Esqueci a senha" só funciona com internet (sem internet a trava continua).
async function seguranca(b) {
  const p = await b.newPage({viewport:{width:390, height:844}}), erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-22T10:00:00'));
  await p.addInitScript(() => { window.__sairChamado = []; window.__semNet = true; window.__casa = {papel:() => 'dono', email:() => 'dono@teste.com', dono:() => 'dono@teste.com', whats:() => ({}), casas:() => [],
    sair:async o => { window.__sairChamado.push(o || {}); if (window.__semNet) throw new Error('sem internet'); return true; }}; });
  await p.goto(ARQ); await p.waitForTimeout(2500);
  const tem = s => p.evaluate(s => !!document.querySelector(s), s), dig = async t => { for (const c of t) { await p.click(`#pinlock [data-pin="${c}"]`); await p.waitForTimeout(40); } };
  ok(await tem('#pinOferta'), 'no app instalado, a senha de 4 números é oferecida na tela Hoje');
  await p.click('#pinOferta [data-a="pinNao"]'); await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(2500);
  ok(!(await tem('#pinOferta')), '"Agora não" não pergunta de novo');
  await p.evaluate(() => { localStorage.removeItem('bolso:pinOferta'); }); await p.reload(); await p.waitForTimeout(2500);
  await p.click('#pinOferta [data-a="pinToggle"]'); await p.waitForTimeout(200); await dig('2580'); await dig('2580'); await p.waitForTimeout(300);
  ok(!!(await p.evaluate(() => localStorage.getItem('bolso:pin'))) && !(await tem('#pinOferta')), 'cria a senha pela oferta e a oferta some');
  await p.evaluate(() => sessionStorage.removeItem('bolso:liberado')); await p.reload(); await p.waitForTimeout(2500);
  ok(await tem('#pinlock'), 'ao abrir de novo, pede a senha');
  for (let i = 0; i < 5; i++) await dig('1111');
  let msg = await p.evaluate(() => document.querySelector('#pinlock').innerText);
  ok(/Espere 30 s/.test(msg), `depois de 5 erros, espera 30 s (${msg.match(/Senha errada[^\n]*/) || ''})`);
  await dig('2580'); msg = await p.evaluate(() => document.querySelector('#pinlock') && document.querySelector('#pinlock').innerText);
  ok(!!msg && /Muitas tentativas/.test(msg), 'durante a espera, nem a senha certa abre');
  await p.reload(); await p.waitForTimeout(2500); await dig('2580');
  ok(await tem('#pinlock'), 'recarregar a página não zera a espera');
  await p.clock.setFixedTime(new Date('2026-11-22T10:01:00')); await dig('2580'); await p.waitForTimeout(300);
  ok(!(await tem('#pinlock')), 'passada a espera, a senha certa abre');
  // esqueci a senha: sem internet a trava continua; com internet sai da conta e tira a senha do aparelho
  await p.evaluate(() => sessionStorage.removeItem('bolso:liberado')); await p.reload(); await p.waitForTimeout(2500);
  p.on('dialog', d => d.accept());
  await p.click('#pinlock [data-pin="esqueci"]'); await p.waitForTimeout(400);
  msg = await p.evaluate(() => document.querySelector('#pinlock') && document.querySelector('#pinlock').innerText);
  ok(!!msg && /Sem internet/.test(msg) && !!(await p.evaluate(() => localStorage.getItem('bolso:pin'))), '"Esqueci a senha" sem internet: a trava e a senha continuam');
  await p.evaluate(() => { window.__semNet = false; }); await p.click('#pinlock [data-pin="esqueci"]'); await p.waitForTimeout(400);
  const ch = await p.evaluate(() => window.__sairChamado);
  ok(ch.length === 2 && (ch[1].tirar || []).includes('bolso:pin'), '"Esqueci a senha" com internet sai da conta e tira a senha do aparelho');
  ok(!erros.length, `segurança: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3i) Celular: todo campo de texto com letra de 16 px (o iPhone não dá zoom ao tocar); no Lançar, a caixa de escrever fica embaixo
async function celular(b) {
  const {p, erros} = await abrir(b, '2026-11-22', 2500); await ir(p, '#inicio');
  const pequenos = () => p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(e => !['checkbox', 'radio', 'range', 'hidden', 'file'].includes(e.type) && e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 15.9).map(e => (e.id || e.name || e.className || e.tagName) + ' ' + getComputedStyle(e).fontSize));
  const ruins = [], abre = async (a, extra = {}) => { await p.evaluate(([a, extra]) => { const el = document.createElement('button'); el.dataset.a = a; Object.assign(el.dataset, extra); document.body.appendChild(el); el.click(); el.remove(); }, [a, extra]); await p.waitForTimeout(350); ruins.push(...(await pequenos()).map(x => a + ': ' + x)); };
  await abre('saldoEdit'); await abre('novo'); await p.evaluate(() => { const b = document.querySelector('[data-a="lkMais"]'); if (b) b.click(); }); await p.waitForTimeout(250); ruins.push(...(await pequenos()).map(x => 'novo+data: ' + x));
  await abre('prevCat', {c:'Lazer', m:'2026-11'}); await abre('editLimites', {m:'2026-11'}); await abre('lkModo', {v:'chat'});
  ok(!ruins.length, `campos de texto com letra de 16 px ou mais${ruins.length ? ' → ' + [...new Set(ruins)].slice(0, 5).join('; ') : ''}`);
  // Lançar escrevendo: depois de várias mensagens, a caixa continua embaixo e visível
  for (const t of ['quanto posso gastar hoje?', 'onde estou gastando mais?', 'quanto falta pagar este mês?', 'quanto tenho guardado?']) { await p.evaluate(t => window.__T.enviarChat(t), t); await p.waitForTimeout(250); }
  const cx = await p.evaluate(() => { const f = document.querySelector('.sh-panel .quick.fixo'), pn = document.querySelector('.sh-panel'); if (!f || !pn) return null; const a = f.getBoundingClientRect(), z = pn.getBoundingClientRect(); return {ultimo:f === pn.querySelector('.sh-body, .sh-panel > *:last-child') || !f.nextElementSibling, dentro:a.top >= z.top - 1 && a.bottom <= z.bottom + 1, rola:pn.scrollHeight > pn.clientHeight}; });
  ok(cx && cx.ultimo && cx.dentro, `no Lançar, a caixa de escrever fica embaixo e visível mesmo com várias mensagens${cx && cx.rola ? ' (rolando)' : ''}`);
  ok(!erros.length, `celular: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3j) Abrir rápido: com internet lenta, o app instalado abre com o que está guardado depois de 2 s (e a rede atualiza para a próxima vez)
async function swRapido() {
  const fs = require('fs'), path = require('path'), vm = require('vm'), src = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'sw.js'), 'utf8');
  const ouv = {}, guardado = {url:'https://app/', v:'guardado'}, poe = [];
  const ctx = {self:{addEventListener:(t, f) => { ouv[t] = f; }, skipWaiting:async () => {}, clients:{claim:async () => {}}}, location:{origin:'https://app'}, URL, setTimeout, clearTimeout, Promise, Response:{error:() => ({v:'erro'})}, console,
    caches:{match:async k => { const u = typeof k === 'string' ? 'https://app/' + k.replace(/^\.\//, '') : k.url; return u === guardado.url || u === 'https://app/index.html' ? guardado : undefined; }, open:async () => ({put:async (k, r) => { poe.push(r.v); }, addAll:async () => {}}), keys:async () => [], delete:async () => true}};
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const pede = (url, rede, modo = 'navigate') => new Promise(ok2 => { ctx.fetch = rede; const t0 = Date.now(); let fim = null; ouv.fetch({request:{url, method:'GET', mode:modo}, respondWith:pr => { fim = pr; }, waitUntil:() => {}}); fim.then(r => ok2({v:r && r.v, ms:Date.now() - t0})); });
  const resp = (v, ms, falha) => () => new Promise((res, rej) => setTimeout(() => falha ? rej(new Error('sem rede')) : res({ok:true, v, clone() { return this; }}), ms));
  let r = await pede('https://app/', resp('rede', 5000));
  ok(r.v === 'guardado' && r.ms >= 1900 && r.ms < 2600, `internet lenta: abre com o guardado em ~2 s (${r.v}, ${r.ms} ms)`);
  r = await pede('https://app/', resp('rede', 100));
  ok(r.v === 'rede' && r.ms < 600, `internet boa: abre a versão da rede (${r.v}, ${r.ms} ms)`);
  r = await pede('https://app/', resp('', 50, true));
  ok(r.v === 'guardado' && r.ms < 600, `sem internet: abre direto do guardado (${r.ms} ms)`);
  r = await pede('https://app/fonts/nova.woff2', resp('rede', 2600), 'no-cors');
  ok(r.v === 'rede' && r.ms >= 2500, `o que não está guardado espera a rede (${r.ms} ms)`);
  await new Promise(res => setTimeout(res, 3200));
  ok(poe.includes('rede'), 'a resposta da rede fica guardada para a próxima vez, mesmo quando chega depois');
}

// 3k) Começar do zero (quem compra o app): 3 perguntas e quanto quer gastar; o menu só mostra o que a casa usa
async function comecarZero(b) {
  const {p, erros} = await abrir(b, '2026-11-22', 2500);
  await p.evaluate(async () => { const S = window.__T.S; for (const k of Object.keys(window.__store)) await S.db.doc(k).delete(); }); await p.waitForTimeout(500); await ir(p, '#inicio');
  ok(await p.evaluate(() => !!document.querySelector('#comecar [data-a="onb"]')), 'controle vazio: a tela Hoje mostra "Começar"');
  await p.click('#comecar [data-a="onb"]'); await p.waitForTimeout(300);
  const passo = async (vals, botao = 'button[type=submit]') => { for (const [n, v] of Object.entries(vals)) await p.fill(`#onb input[name="${n}"]`, v); await p.click(`#onb ${botao}`); await p.waitForTimeout(450); };
  await passo({v:'1.500', va:'300'}); await passo({v:'4000', dia:'5'}); await passo({v:'600', dia:'1'}); await passo({v:'900'});
  const r = await p.evaluate(() => { const T = window.__T, S = T.S, g = T.podeGastar(); return {txt:document.querySelector('#onb').innerText, saldo:S.cfg.saldo && S.cfg.saldo.v, va:S.cfg.saldoVA && S.cfg.saldoVA.v, sal:S.fixos.find(f => f.cat === 'Salário'), vale:S.fixos.find(f => f.meio === 'va'), teto:S.cfg.tetoDia, pode:g && g.total}; });
  ok(r.saldo === 1500 && r.va === 300 && r.sal && r.sal.valor === 4000 && r.sal.dia === 5 && r.vale && r.vale.valor === 600 && r.teto === 900, `as respostas viram saldo, salário (dia 5), vale e o teto do mês (${r.saldo}/${r.va}/${r.sal && r.sal.valor}/${r.vale && r.vale.valor}/${r.teto})`);
  ok(Math.abs(r.pode - 900) < 0.6 && /Pronto! Você pode gastar R\$\s*900/.test(r.txt) && /mercado 80/.test(r.txt), `no fim mostra quanto pode gastar e o próximo passo (${(r.txt.match(/Pronto![^\n]*/) || [''])[0]})`);
  await p.evaluate(() => { document.querySelector('[data-a="closeSheet"], .sh-x') && document.querySelector('[data-a="closeSheet"], .sh-x').click(); }); await p.waitForTimeout(300); await ir(p, '#inicio');
  ok(/Pode gastar até[\s\S]*R\$\s*900[\s\S]*Vale \(comida\)/.test(await p.evaluate(() => (document.querySelector('.hz') || {}).innerText || '')), 'depois de responder, o topo já mostra o pode gastar (R$ 900) e o vale');
  await p.click('#tabbar ~ * [data-a="menu"], header [data-a="menu"]').catch(() => p.evaluate(() => document.querySelector('[data-a="menu"]').click())); await p.waitForTimeout(350);
  const m = await p.evaluate(() => ({grade:[...document.querySelectorAll('.mgrid a, .mgrid button')].map(e => e.innerText.trim()), mais:[...document.querySelectorAll('.menu-mais a')].map(e => e.textContent.trim())}));
  ok(!m.grade.some(t => /Guardado|Cartões|Dívidas|Reservas/.test(t)) && m.grade.some(t => /Lançamentos/.test(t)) && m.mais.some(t => /Cartões/.test(t)) && m.mais.some(t => /Relatórios do ano/.test(t)) && !m.mais.some(t => /Análise do mês/.test(t)), `menu de quem está começando: só o que usa; o resto em "Mais" (${m.grade.join(', ')} | ${m.mais.length} em Mais)`);
  await ir(p, '#contas'); ok(!(await p.evaluate(() => !!document.querySelector('[data-a="contasAba"]'))), 'sem cartão, Contas não mostra a aba Cartões');
  ok(!erros.length, `começar do zero: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
  // com a família (tem cartões e caixinhas), o menu mostra os dois
  const f = await abrir(b, '2026-11-22', 2500); await f.p.evaluate(() => document.querySelector('[data-a="menu"]').click()); await f.p.waitForTimeout(350);
  const g = await f.p.evaluate(() => [...document.querySelectorAll('.mgrid a')].map(e => e.innerText.trim()));
  ok(g.some(t => /Cartões/.test(t)) && g.some(t => /Guardado/.test(t)), `quem já usa cartão e caixinha vê os dois no menu (${g.join(', ')})`); await f.p.close();
}

// 3l) Auditoria (outra IA): teto de quem começou do zero não soma por cima da média; frase do item de plano; quem só vê
// não baixa backup; ajustes gravados por caminho (duas categorias ao mesmo tempo não se atropelam)
async function auditoria2(b) {
  const {p, erros} = await abrir(b, '2026-11-22', 2500);
  await p.evaluate(async () => { const S = window.__T.S; for (const k of Object.keys(window.__store)) await S.db.doc(k).delete(); }); await p.waitForTimeout(400); await ir(p, '#inicio');
  await p.click('#comecar [data-a="onb"]'); await p.waitForTimeout(300);
  const passo = async vals => { for (const [n, v] of Object.entries(vals)) await p.fill(`#onb input[name="${n}"]`, v); await p.click('#onb button[type=submit]'); await p.waitForTimeout(450); };
  await passo({v:'1500'}); await passo({v:'4000', dia:'5'}); await passo({v:'600', dia:'1'}); await passo({v:'900'});
  const pg = () => p.evaluate(() => { const T = window.__T; T.render(); const g = T.podeGastar(), d = T.projPool('2026-12'); return {total:g.total, outros:(T.S.cfg.orc || {}).Outros, teto:T.S.cfg.tetoDia, dez:Object.values(d.proj).reduce((t, v) => t + v, 0), lista:T.diaDiaBase().lista.map(x => [x.c, Math.round(x.proj), x.teto])}; });
  let a = await pg();
  ok(a.teto === 900 && a.outros === undefined && Math.abs(a.total - 900) < 0.6, `"quanto quer gastar" vira o teto do mês, não uma categoria (pode gastar ${Math.round(a.total)})`);
  // nasce a média (um mês de gastos): o teto é dividido pela média e o total continua 900
  await p.evaluate(async () => { const T = window.__T; for (const [c, v] of [['Transporte', 300], ['Lazer', 100]]) await T.criarLanc({tipo:'despesa', valor:v, desc:c, cat:c, data:'2026-10-15', meio:'pix', nparc:1}); }); await p.waitForTimeout(400);
  a = await pg(); const tr = a.lista.find(x => x[0] === 'Transporte') || [], lz = a.lista.find(x => x[0] === 'Lazer') || [];
  ok(Math.abs(a.total - 900) < 0.6 && Math.abs(a.dez - 900) < 0.6 && tr[1] === 675 && lz[1] === 225 && tr[2], `com média, o teto é dividido pela média e não soma por cima (pode gastar ${Math.round(a.total)}, dez ${Math.round(a.dez)}, Transporte ${tr[1]}, Lazer ${lz[1]})`);
  await p.evaluate(() => { location.hash = '#inicio'; window.__T.render(); }); await p.waitForTimeout(300);
  await p.evaluate(() => { const el = document.createElement('button'); el.dataset.a = 'porDiaDet'; document.body.appendChild(el); el.click(); el.remove(); }); await p.waitForTimeout(300);
  ok(/Teto do dia a dia: R\$\s*900 por mês/.test(await p.evaluate(() => document.body.innerText)) && await p.evaluate(() => !!document.querySelector('#tetoBox [data-a="tetoMedia"]')), 'Como calculei mostra o teto, com "Usar a média" ao lado');
  await p.click('#tetoBox [data-a="tetoMedia"]'); await p.waitForTimeout(400);
  a = await pg(); ok(!a.teto && Math.abs(a.total - 400) < 0.6, `"Usar a média" tira o teto: o pode gastar vira a média (${Math.round(a.total)})`);
  await p.close();
  // frase do item de plano: proporcional, como a conta
  const f = await abrir(b, '2026-11-22', 2500);
  const t = await f.p.evaluate(() => { const T = window.__T, o = T.S.objs.find(x => (x.itens || []).length > 1), it = o.itens[0];
    return T.resHTML({itens:[{tipo:'despesa', valor:(+it.prev || 0) + 500, desc:'Gasto do plano', cat:'Viagens', data:T.hoje(), meio:'pix', nparc:1, objId:o.id, objItem:it.id}], ids:[]}).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); });
  ok(/passou R\$\s*[\d.,]+ do teto\. O excesso sai dos outros itens .* proporcional ao que falta em cada um/.test(t) && !/igualmente/.test(t), 'a confirmação de item de plano diz a regra certa (proporcional)');
  // ajustes por caminho: mudar uma categoria manda só ela
  const d = await f.p.evaluate(async () => { const T = window.__T, S = T.S; window.__opsLog = [];
    const u1 = T.difCfg({Mercado:1600, Lazer:100}, {Mercado:1600, Lazer:300, Compras:50}, ['orc']), u2 = T.difCfg({a:1, b:2}, {a:1}, ['orc']), u3 = T.difCfg({'2026-12':{Lazer:1}}, {'2026-12':{Lazer:2}, '2027-01':{Lazer:0}}, ['orcMes']);
    await T.saveCfg({orc:{...(S.cfg.orc || {}), Lazer:321}}); return {u1, u2, u3, log:window.__opsLog, lazer:(S.cfg.orc || {}).Lazer, merc:(S.cfg.orc || {}).Mercado}; });
  ok(JSON.stringify(d.u1) === JSON.stringify([{p:['orc', 'Lazer'], v:300}, {p:['orc', 'Compras'], v:50}]) && JSON.stringify(d.u2) === JSON.stringify([{p:['orc', 'b'], del:true}]) && JSON.stringify(d.u3) === JSON.stringify([{p:['orcMes', '2026-12', 'Lazer'], v:2}, {p:['orcMes', '2027-01'], v:{Lazer:0}}]), 'a diferença de um ajuste vira mudanças por caminho (mudar, tirar, mês novo)');
  ok(d.log.length === 1 && JSON.stringify(d.log[0]) === JSON.stringify([{p:['orc', 'Lazer'], v:321}]) && d.lazer === 321 && d.merc > 0, `mudar o projetado de Lazer manda só "orc › Lazer" (${JSON.stringify(d.log)})`);
  ok(!erros.length && !f.erros.length, `auditoria: sem erro na página${[...erros, ...f.erros][0] ? ' → ' + [...erros, ...f.erros][0] : ''}`); await f.p.close();
  // quem só vê não baixa o backup
  const v = await b.newPage({viewport:{width:390, height:844}}); const ev = []; v.on('pageerror', e => ev.push(e.message));
  await v.clock.setFixedTime(new Date('2026-11-22T10:00:00')); await v.addInitScript(() => { window.__casa = {papel:() => 've', email:() => 'parceira@teste.com', dono:() => 'dono@teste.com', whats:() => null, casas:() => [], membros:() => [], papelDe:() => 've'}; });
  await v.goto(ARQ); await v.waitForTimeout(2500); await ir(v, '#ajustes');
  const r = await v.evaluate(async () => { const bt = [...document.querySelectorAll('[data-a="exportJSON"], [data-a="exportCSV"]')], vis = bt.filter(x => getComputedStyle(x).display !== 'none').length; let baixou = false; const S = window.__T.S;
    const el = document.createElement('button'); el.dataset.a = 'exportJSON'; document.body.appendChild(el); const t0 = document.querySelector('#toast') ? document.querySelector('#toast').innerText : ''; el.click(); el.remove(); await new Promise(r => setTimeout(r, 300));
    return {vis, toast:(document.querySelector('#toast') || {}).innerText || ''}; });
  ok(r.vis === 0 && /só para ver|só ver|só vê/i.test(r.toast), `quem só vê não baixa o backup nem os lançamentos (botões visíveis: ${r.vis}; ${r.toast.slice(0, 50)})`);
  ok(!ev.length, `só ver: sem erro na página${ev.length ? ' → ' + ev[0] : ''}`); await v.close();
}

// 3m) Hoje, Mês e Ano (reorganização pedida pelo dono): barra Hoje · Lançar · Mês · Ano; Mês em três blocos; Ano com o mês mais justo
// e o dinheiro a mais com destino; Lançar mostra o efeito antes de gravar; passou do pode gastar diz quanto cai o mês mais justo
async function telasNovas(b) {
  const {p, erros} = await abrir(b, '2026-11-22'); await ir(p, '#inicio');
  const barra = await p.evaluate(() => [...document.querySelectorAll('#tabbar a, #tabbar button')].map(e => e.getAttribute('aria-label') || e.innerText.trim().split('\n')[0]));
  ok(barra.join(' · ') === 'Hoje · Lançar um gasto · Mês · Ano', `barra de baixo: ${barra.join(' · ')}`);
  await p.evaluate(() => document.querySelector('[data-a="menu"]').click()); await p.waitForTimeout(300);
  ok(await p.evaluate(() => [...document.querySelectorAll('.mgrid a')].some(a => a.getAttribute('href') === '#ajuda') && !!document.querySelector('#sheet a[href="#ajustes"]')), 'Ajuda e ajustes ficam no menu ☰');
  await p.evaluate(() => { const x = document.querySelector('[data-a="closeSheet"], .sh-x'); if (x) x.click(); }); await p.waitForTimeout(200);
  // "manter este valor só neste mês": o estouro vira o projetado do mês, sem tirar das outras
  const a0 = await p.evaluate(() => { const T = window.__T; T.render(); return {total:T.podeGastar().total, lz:T.diaDiaBase().lista.find(x => x.c === 'Lazer')}; });
  await p.click('[data-a="projManter"][data-c="Lazer"]'); await p.waitForTimeout(500);
  const a1 = await p.evaluate(() => { const T = window.__T; T.render(); return {total:T.podeGastar().total, lz:T.diaDiaBase().lista.find(x => x.c === 'Lazer'), om:(T.S.cfg.orcMes || {})['2026-11']}; });
  ok(a0.lz.passou > 0.5 && a1.lz.passou < 0.5 && Math.abs(a1.om.Lazer - a0.lz.gasto) < 0.01 && Math.abs(a1.total - a0.total - a0.lz.passou) < 0.6, `"Manter R$ ${Math.round(a0.lz.gasto)} só em nov": Lazer fica no que gastou e as outras voltam (pode gastar ${Math.round(a0.total)} → ${Math.round(a1.total)})`);
  await p.evaluate(() => { const x = document.querySelector('[data-a="closeSheet"], .sh-x'); if (x) x.click(); }); await p.waitForTimeout(200);
  // Mês de janeiro: o bônus entra com destino, antes de parecer sobra
  await ir(p, '#contas'); for (let i = 0; i < 2; i++) { await p.click('[data-a="calMes"][data-d="1"]'); await p.waitForTimeout(250); }
  const jan = await p.evaluate(() => ({mais:(document.getElementById('aMais') || {}).innerText || '', nao:!!document.getElementById('naoCortar'), cort:!!document.getElementById('cortar')}));
  const dj = await p.evaluate(() => window.__T.destinoExtras('2027-01', 9000, 1).reduce((t, d) => t + d.v, 0));
  ok(jan.nao && jan.cort && /No dia 13 entra Bônus anual \(R\$\s*9\.000\)/.test(jan.mais) && /Já está combinado: /.test(jan.mais) && Math.abs(dj - 9000) < 1 && /sobra de verdade R\$\s*[\d.]+ \(o que segura [a-z]{3}\/\d\d\)/.test(jan.mais), `Mês de jan/27: o bônus tem destino que soma o que entrou (${Math.round(dj)}; ${jan.mais.replace(/\s+/g, ' ').slice(0, 140)}…)`);
  // Ano: dinheiro a mais com destino, e "Guardar" só com o dinheiro na conta
  await ir(p, '#planos');
  const ano = await p.evaluate(() => { const T = window.__T; return {txt:(document.getElementById('aMaisAno') || {}).innerText || '', guardar:document.querySelectorAll('.plano [data-a="guardMov"]').length, planos:document.querySelectorAll('.plano').length, tem:T.S.objs.length}; });
  const din = await p.evaluate(() => { const s = window.__T.S, T = window.__T; return T.saldoHoje(); });
  ok(/Bônus anual · jan\/27[\s\S]*vai para: /.test(ano.txt), `Ano › Dinheiro a mais: o bônus de janeiro já mostra o destino (${ano.txt.replace(/\s+/g, ' ').slice(0, 120)})`);
  await p.evaluate(() => { const S = window.__T.S; return S.db.doc('config/geral').set({...S.cfg, saldo:{...S.cfg.saldo, v:-5000}}); }); await p.waitForTimeout(300); await ir(p, '#contas'); await ir(p, '#planos');
  ok(await p.evaluate(() => document.querySelectorAll('.plano [data-a="guardMov"]').length === 0 && /vai guardar R\$\s*[\d.]+ quando o dinheiro cair/.test(document.querySelector('main').innerText)), 'sem dinheiro livre na conta, guardar é plano (texto), não botão');
  await p.evaluate(() => { const S = window.__T.S; return S.db.doc('config/geral').set({...S.cfg, saldo:{...S.cfg.saldo, v:2200}}); }); await p.waitForTimeout(300);
  // Lançar: o efeito aparece antes de gravar
  await ir(p, '#inicio'); await p.evaluate(() => document.querySelector('#tabbar [data-a="novo"]').click()); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = document.querySelector('[data-a="lkModo"][data-v="teclado"]'); if (b) b.click(); }); await p.waitForTimeout(250);
  for (const k of ['5', '0', '0', '0']) { await p.click(`[data-a="lkTecla"][data-k="${k}"]`); await p.waitForTimeout(40); }
  await p.click('[data-a="lkCat"][data-c="Lazer"]').catch(() => {}); await p.waitForTimeout(200);
  const e1 = await p.evaluate(() => (document.getElementById('lk-ef') || {}).innerText || '');
  await p.evaluate(() => { const b = document.querySelector('[data-a="lkCat"][data-c="Mercado"]'); if (b) b.click(); }); await p.waitForTimeout(150);
  await p.evaluate(() => { const b = document.querySelector('[data-a="lkMeio"][data-v="pix"]'); if (b) b.click(); }); await p.waitForTimeout(150);
  const e2 = await p.evaluate(() => (document.getElementById('lk-ef') || {}).innerText || '');
  ok((/Pode gastar: R\$\s*[\d.]+ → R\$\s*[\d.]+/.test(e1) || !e1) && /Comida na conta: isso sai do salário, não do pode gastar/.test(e2), `Lançar mostra o efeito antes de gravar (${e1} | ${e2.slice(0, 60)})`);
  await p.evaluate(() => { const x = document.querySelector('[data-a="closeSheet"], .sh-x'); if (x) x.click(); }); await p.waitForTimeout(200);
  // passou do pode gastar: a confirmação diz quanto cai o mês mais justo
  const conf = await p.evaluate(async () => { const T = window.__T, g = T.podeGastar(); window.__AI = {acao:'lancar', itens:[{data:T.hoje(), meio:'pix', tipo:'despesa', valor:Math.round(g.total + 200), desc:'Show', cat:'Lazer'}]}; const r = await T.lancarTexto(`show ${Math.round(g.total + 200)} pix`); return {h:T.resHTML(r).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), livre:g.livre, total:g.total}; });
  const mm = conf.h.match(/o mês mais justo, cai de R\$\s*([\d.]+) para R\$\s*([\d.]+)/);
  ok(!!mm && Math.abs(+mm[1].replace(/\./g, '') - Math.round(conf.livre)) <= 1 && Math.abs(+mm[1].replace(/\./g, '') - +mm[2].replace(/\./g, '') - 200) <= 1, `passou do pode gastar: "o mês mais justo cai de… para…" (${mm ? mm[0] : conf.h.slice(0, 80)})`);
  ok(!erros.length, `telas novas: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 3n) O que ainda enganava (outra IA) + teto calculado + resumo do WhatsApp
async function auditoria3(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  // dinheiro a mais: o destino cabe no que entrou (férias pequenas perto de uma viagem grande)
  await p.evaluate(async () => { const S = window.__T.S; await S.db.doc('fixos/ferias-teste').set({ativo:true, inicio:'2026-12', fim:'2026-12', tipo:'receita', desc:'Férias', valor:2000, cat:'Férias', dia:5, meio:'pix'}); }); await p.waitForTimeout(400);
  const dz = await p.evaluate(() => { const T = window.__T, d = T.destinoExtras('2026-12', 2000, 1); return {soma:d.reduce((t, x) => t + x.v, 0), parcial:d.some(x => x.de > x.v + 0.5), n:d.length}; });
  ok(Math.abs(dz.soma - 2000) < 1 && dz.n >= 1, `o destino das férias soma o que entrou, nunca mais (${Math.round(dz.soma)} de 2.000${dz.parcial ? ', com parte de um destino maior' : ''})`);
  await ir(p, '#contas'); await p.click('[data-a="calMes"][data-d="1"]'); await p.waitForTimeout(300);
  const dez = await p.evaluate(() => (document.getElementById('aMais') || {}).innerText || '');
  ok(/Já está combinado: /.test(dez) && !/[\d.]+ para dez\/26 não usar o cartão/.test(dez), `Mês de dez/26: a frase do dinheiro a mais (${dez.replace(/\s+/g, ' ').slice(0, 150)}…)`);
  await p.click('[data-a="calMes"][data-d="-1"]'); await p.waitForTimeout(300);
  // Mês: não dá para cortar = o que falta pagar; o já pago fica recolhido; atalho para o mês seguinte
  const nao = await p.evaluate(() => { const s = document.getElementById('naoCortar'); return {txt:s.innerText, det:!!s.querySelector('details'), prox:!!s.querySelector('[data-a="calMes"][data-d="1"]')}; });
  ok(/falta pagar R\$\s*[\d.]+/.test(nao.txt) && nao.det && /Já pago em novembro: R\$\s*[\d.]+ \(\d+ contas?\)/.test(nao.txt) && nao.prox && /Em dez\/26 o salário já deve R\$\s*[\d.]+/.test(nao.txt), 'Não dá para cortar mostra o que falta pagar; o já pago fica recolhido, com o mês seguinte num toque');
  // Mês: dá para cortar = o que passou do previsto; cada linha com o previsto (a média só se existir)
  const cor = await p.evaluate(() => { const s = document.getElementById('cortar'); return {h:s.querySelector('.sec2-h').innerText, linhas:[...s.querySelectorAll('.li .t2')].map(e => e.innerText)}; });
  ok(/R\$\s*[\d.]+\s*acima do previsto/.test(cor.h) && cor.linhas.every(t => /previsto R\$\s*[\d.]+/.test(t)) && !cor.linhas.some(t => /média R\$\s*0\b/.test(t)), `Dá para cortar: o número é o que passou do previsto e nenhuma linha usa média zero (${cor.h.replace(/\s+/g, ' ')})`);
  // Ano: a frase do mês mais justo não aponta meses que já têm destino
  await ir(p, '#planos'); const fr = await p.evaluate(() => (document.getElementById('anoGrafico') || {}).innerText || '');
  ok(!/ guarda(m)? o que /.test(fr) && /O mês mais justo é/.test(fr), 'Ano: a frase do mês mais justo não diz que outros meses o seguram');
  // Ajuda e menu: o desenho novo
  await ir(p, '#ajuda'); const aj = await p.evaluate(() => document.querySelector('main').textContent);
  ok(!/Comprometido|quadrinhos/.test(aj) && /Mês/.test(aj) && /Ano/.test(aj), 'a Ajuda explica Hoje, Mês e Ano (sem os quadrinhos velhos)');
  await ir(p, '#inicio'); await p.evaluate(() => document.querySelector('[data-a="menu"]').click()); await p.waitForTimeout(300);
  ok(!(await p.evaluate(() => /Análise do mês/.test(document.querySelector('#sheet').textContent) || [...document.querySelectorAll('#sidenav a')].some(a => a.getAttribute('href') === '#mes'))), 'a tela velha "Análise do mês" sai do menu');
  await p.evaluate(() => { const x = document.querySelector('[data-a="closeSheet"], .sh-x'); if (x) x.click(); }); await p.waitForTimeout(200);
  // teto calculado pelo que entra e sai
  const ct = await p.evaluate(() => window.__T.calcTeto());
  await p.evaluate(() => { const el = document.createElement('button'); el.dataset.a = 'tetoCalc'; document.body.appendChild(el); el.click(); el.remove(); }); await p.waitForTimeout(300);
  const v0 = await p.evaluate(() => (document.getElementById('tc-v') || {}).textContent || '');
  await p.fill('#tc-g', String(ct.g + 100)); await p.waitForTimeout(200); const v1 = await p.evaluate(() => (document.getElementById('tc-v') || {}).textContent || '');
  const num = t => +String(t).replace(/\D/g, '');
  ok(ct.entra > 0 && ct.fixas > 0 && num(v0) === ct.teto && num(v1) === Math.max(0, ct.teto - 100), `calcula o teto: entra ${Math.round(ct.entra)} − contas ${Math.round(ct.fixas)} − parcelas ${Math.round(ct.parc)} − comida ${Math.round(ct.com)} − planos ${Math.round(ct.planos)} − guardar ${Math.round(ct.g)} = ${ct.teto} (guardando 100 a mais: ${num(v1)})`);
  await p.click('#sheet form[data-f="tetoCalc"] button[type=submit]'); await p.waitForTimeout(400);
  ok(await p.evaluate(t => window.__T.S.cfg.tetoDia === t, Math.max(0, ct.teto - 100)), '"Usar como teto do mês" grava o valor calculado');
  ok(!erros.length, `o que enganava: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
  // quem começa do zero e não sabe quanto gastar: "Não sei ainda" e o convite para calcular depois das contas
  const z = await abrir(b, '2026-11-22', 2500);
  await z.p.evaluate(async () => { const S = window.__T.S; for (const k of Object.keys(window.__store)) await S.db.doc(k).delete(); }); await z.p.waitForTimeout(400); await ir(z.p, '#inicio');
  await z.p.click('#comecar [data-a="onb"]'); await z.p.waitForTimeout(300);
  const passo = async vals => { for (const [n, v] of Object.entries(vals)) await z.p.fill(`#onb input[name="${n}"]`, v); await z.p.click('#onb button[type=submit]'); await z.p.waitForTimeout(450); };
  await passo({v:'1500'}); await passo({v:'4000', dia:'5'}); await z.p.click('#onb [data-a="onbPular"]'); await z.p.waitForTimeout(300); await z.p.click('#onb [data-a="onbPular"]'); await z.p.waitForTimeout(500);
  const fim = await z.p.evaluate(() => ({txt:document.querySelector('#onb').innerText, calc:!!document.querySelector('#onb [data-a="tetoCalc"]')}));
  await z.p.evaluate(() => { const x = document.querySelector('[data-a="closeSheet"], .sh-x'); if (x) x.click(); }); await z.p.waitForTimeout(300); await ir(z.p, '#inicio');
  ok(/Falta saber quanto dá para gastar por mês/.test(fim.txt) && fim.calc && await z.p.evaluate(() => !!document.querySelector('#tetoConvite [data-a="tetoCalc"]')), '"Não sei ainda": o fim explica e a tela Hoje convida a calcular depois das contas fixas');
  ok(!z.erros.length, `começar sem saber o teto: sem erro na página${z.erros.length ? ' → ' + z.erros[0] : ''}`); await z.p.close();
  // resumo do dia para o WhatsApp: o app guarda; o lembrete começa por ele
  const w = await b.newPage({viewport:{width:390, height:844}}); const ew = []; w.on('pageerror', e => ew.push(e.message));
  await w.clock.setFixedTime(new Date('2026-11-22T10:00:00')); await w.addInitScript(() => { window.__casa = {papel:() => 'dono', email:() => 'dono@teste.com', dono:() => 'dono@teste.com', whats:() => ({numero:'5511912345678', temChave:true, ligado:true}), casas:() => []}; });
  await w.goto(ARQ); await w.waitForTimeout(2500); await w.clock.fastForward(7000); await w.waitForTimeout(600);
  const rw = await w.evaluate(() => { const T = window.__T; return {r:T.S.cfg.resumoWhats, pode:Math.round(T.podeGastar().total)}; });
  const { pathToFileURL } = require('url'), L = await import(pathToFileURL(require('path').join(__dirname, '..', 'app', 'functions', 'api', 'lembretes.js')).href);
  const txt = rw.r ? L.montar({lanc:[], fixos:[], cartoes:[], objetivos:[], config:{resumoWhats:rw.r}}, '2026-11-23') : '';
  ok(rw.r && rw.r.m === '2026-11' && rw.r.pode === rw.pode && /💰 Pode gastar até 30\/11: R\$\s*[\d.,]+ \(R\$\s*[\d.,]+ por dia\) · Vale: R\$/.test(txt || '') && (!rw.r.passou.length || /passou R\$/.test(txt)), `o lembrete do WhatsApp começa com o pode gastar e o vale do dia (${(txt || '').split('\n')[0]})`);
  ok(!ew.length, `resumo do WhatsApp: sem erro na página${ew.length ? ' → ' + ew[0] : ''}`); await w.close();
}

// 4) Datas escritas no chat
async function datasChat(b) {
  const {p, erros} = await abrir(b, '2026-11-22', 1500);
  const r = await p.evaluate(() => { const P = window.__T.parseRapido; return ['geladeira 2500 vai ser pago dia 30/01 pix', 'conserto 300 pagar dia 28 pix', 'luz 200 vence dia 10 pix', 'comprei tênis 15/11 200 pix', 'paguei farmácia 10/09 50 pix', 'mercado 80 pix'].map(x => P(x).data); });
  ok(r[0] === '2027-01-30', `"vai ser pago dia 30/01" → ${r[0]}`); ok(r[1] === '2026-11-28', `"pagar dia 28" → ${r[1]}`); ok(r[2] === '2026-12-10', `"vence dia 10" → ${r[2]}`);
  ok(r[3] === '2026-11-15', `"comprei 15/11" → ${r[3]}`); ok(r[4] === '2026-09-10', `"paguei 10/09" → ${r[4]}`); ok(r[5] === '2026-11-22', `sem data = hoje → ${r[5]}`);
  // trava: a IA respondeu "hoje", mas a frase diz 30/01 → vale 30/01
  const d = await p.evaluate(async () => { window.__AI = {acao:'lancar', itens:[{tipo:'despesa', valor:2500, desc:'Geladeira', cat:'Compras', data:'2026-11-22', meio:'pix'}]};
    const T = window.__T, r = await T.lancarTexto('geladeira 2500 vai ser pago dia 30/01 pix'); await new Promise(x => setTimeout(x, 200)); const l = T.S.lanc.find(x => x.id === (r && r.ids && r.ids[0])); return l ? l.data : (r && JSON.stringify(r).slice(0, 80)); });
  ok(d === '2027-01-30', `IA devolveu hoje, mas a data escrita manda → ${d}`);
  ok(!erros.length, `datas: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 5) Financiamento do carro: janeiro sai da conta (reserva formada dia 13); de fevereiro em diante sai da caixinha
async function reserva(b) {
  const {p, erros} = await abrir(b, '2027-02-02');
  const info = () => p.evaluate(() => { const T = window.__T, S = T.S, o = S.objs.find(x => /reserva do carro/i.test(x.nome)), f = T.fixoPagoPor(o), lin = T.guardadoMesAMes().out.find(l => l.m === '2027-02');
    return {fid:f && f.id, guardado:T.objGuardado(o), falta:T.objFalta(o), fev:lin ? lin.cx[o.id] : null, conta:T.saldoHoje(), pago:T.pagoFixo(f, '2027-02')}; });
  await p.evaluate(async () => { const T = window.__T, S = T.S, o = S.objs.find(x => /reserva do carro/i.test(x.nome)), f = T.fixoPagoPor(o);
    await T.criarLanc(T.lancDePendente('fixo', f, '2027-01', 700, '2027-01-01')); await T.movObj(o, 7700, {nota:'bônus'}); });
  await p.waitForTimeout(300); const a = await info();
  ok(a.fid === 'fx-carro', 'a reserva sabe que paga o financiamento');
  ok(Math.abs(a.falta) < 1 && Math.abs(a.fev - 7000) < 1, `janeiro pago pela conta + R$ 7.700 guardados: reserva completa e fevereiro com R$ 7.000 (${a.fev})`);
  await ir(p, '#contas'); ok(/sai da caixinha Reserva do carro 2027/.test(await texto(p)), 'Contas de fevereiro: financiamento sai da caixinha');
  await p.click(`[data-a="pagarDaCx"][data-f="${a.fid}"]`); await p.waitForTimeout(400); const d = await info();
  ok(Math.abs(d.guardado - 7000) < 1 && Math.abs(d.fev - 7000) < 1 && Math.abs(d.conta - a.conta) < 1 && d.pago, `Paguei: tira da caixinha uma vez só, conta não muda (caixinha ${d.guardado}, projeção ${d.fev})`);
  ok(!erros.length, `reserva: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 6) Mudar o valor de uma entrada no mês seguinte (Contas › próximo mês › Mudar)
async function mudarMes(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  const val = () => p.evaluate(() => { const T = window.__T, f = T.S.fixos.find(x => x.id === 'rec-sal25'); return {nov:T.valorFixo(f, '2026-11'), dez:T.valorFixo(f, '2026-12'), jan:T.valorFixo(f, '2027-01')}; });
  await ir(p, '#contas');
  ok(await p.locator('.ri[data-a="editFixoMes"][data-id="rec-sal25"]').count() === 1, 'mês atual: tocar na linha do salário abre o editor');
  await p.click('[data-a="calMes"][data-d="1"]'); await p.waitForTimeout(300);
  const bt = p.locator('button[data-a="editFixoMes"][data-id="rec-sal25"][data-m="2026-12"]');
  ok(await bt.count() === 1 && (await bt.innerText()).trim() === 'Mudar', 'dezembro: o salário tem o botão Mudar');
  await bt.click(); await p.waitForTimeout(300);
  ok(/Essa mudança vale/.test(await p.evaluate(() => document.querySelector('#sheet').innerText)), 'Mudar abre o editor com "só este mês" ou "daqui pra frente"');
  await p.evaluate(() => { const fm = document.querySelector('#sheet form[data-f="fixo"]'); fm.valor.value = '3500'; fm.querySelector('input[name="escopo"][value="mes"]').checked = true; fm.dispatchEvent(new Event('change')); });
  await p.click('#sheet button[type="submit"]'); await p.waitForTimeout(400);
  const v = await val();
  ok(v.dez === 3500 && v.nov === 3000 && v.jan === 3000, `"só em dezembro" muda só dezembro (nov ${v.nov} · dez ${v.dez} · jan ${v.jan})`);
  await p.click('button[data-a="editFixoMes"][data-id="fx-internet"][data-m="2026-12"]'); await p.waitForTimeout(300);
  ok(await p.locator('#sheet [data-a="pagar"][data-id="fx-internet"][data-m="2026-12"]').count() === 1, 'no editor de um mês à frente ainda dá para marcar "Já paguei" adiantado');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  for (let i = 0; i < 2; i++) { await p.click('[data-a="calMes"][data-d="1"]'); await p.waitForTimeout(300); }
  ok(/sai da caixinha Reserva do carro/.test(await texto(p)) && await p.locator('[data-a="editFixoMes"][data-id="fx-carro"]').count() === 0, 'fevereiro: o financiamento pago pela caixinha não tem Mudar (mudar ali apagaria o "sai da caixinha")');
  ok(!erros.length, `mudar: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 7) A folga do fim do mês é calculada (o que o mês seguinte precisa até o dinheiro entrar), não R$ 1.000 fixo;
//    e os meses à frente usam a mesma média do dia a dia do mês atual
async function folgaMedia(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  const r = await p.evaluate(() => { const T = window.__T, f = T.fluxo(), fi = T.folgaInfo('2026-11'), lm = T.linhaMes('2026-12');
    const poolMar = T.projMes('2027-03').linhas.filter(l => l.tipo === 'previsto' && T.ehPool(l.cat) && !/^Crédito /.test(l.lugar)).reduce((t, l) => t + l.v, 0) + T.projMes('2027-03', undefined, false, true).filter(l => l.tipo === 'previsto' && T.ehPool(l.cat)).reduce((t, l) => t + l.v, 0);
    const media = Object.values(T.mediaPool('2027-03')).reduce((t, v) => t + v, 0);
    return {conta:f[0].contaFim, folga:fi.v, ate:fi.ate, ponteDez:lm.usoP.cx + lm.usoP.cred + lm.usoP.cheque, itens:fi.itens.map(x => x.desc), poolMar, media}; });
  ok(Math.abs(r.conta - r.folga) < 0.6 && Math.abs(r.conta - 1000) > 1, `fim de novembro: fica na conta o que dezembro precisa (${Math.round(r.conta)}), não R$ 1.000 fixo`);
  ok(r.ponteDez < 0.5, 'dezembro não precisa tirar da caixinha antes do dinheiro entrar');
  ok(r.itens.includes('Financiamento do carro') && r.itens.includes('Academia'), `a folga conta as contas de dezembro até o dinheiro entrar no dia ${r.ate} (${r.itens.slice(0, 4).join(', ')}…)`);
  ok(Math.abs(r.poolMar - r.media) < 1, `março: dia a dia fora comida pela mesma média (${Math.round(r.poolMar)} × média ${Math.round(r.media)})`);
  await ir(p, '#contas'); ok(/o que dez\/26 precisa até o dinheiro entrar/.test(await texto(p)), 'Contas explica o que fica na conta no fim do mês');
  ok(!erros.length, `folga: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 8) Gasto previsto no crédito vai para o cartão principal, nunca para o de outra pessoa (mesmo se ele vier primeiro na lista)
async function cartaoPrincipal(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  await p.evaluate(async () => { const T = window.__T, S = T.S;
    await S.db.collection('cartoes').doc('aaa-mae').set({nome:'Mãe', fecha:25, vence:1, limite:1000});
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) await T.criarLanc({tipo:'despesa', valor:300, desc:'Fatura antiga', cat:'Cartão (sem detalhe)', data:m + '-10', meio:'credito', cartaoId:'azul', nparc:1});
    await T.criarLanc({tipo:'despesa', valor:200, desc:'Loja', cat:'Compras', data:'2026-09-12', meio:'credito', cartaoId:'aaa-mae', nparc:1}); });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => { const T = window.__T, S = T.S, mae = S.cartoes.find(c => c.id === 'aaa-mae'); S.cartoes = [mae, ...S.cartoes.filter(c => c !== mae)]; T.render();
    const ls = []; ['2026-11', '2026-12', '2027-01', '2027-02'].forEach(m => { [...T.projMes(m).linhas, ...T.projMes(m, undefined, false, true)].filter(l => l.tipo === 'previsto' && /^Crédito /.test(l.lugar)).forEach(l => ls.push(l.lugar)); });
    return {primeiro:S.cartoes[0].nome, principal:T.cartaoPrincipal().nome, lugares:[...new Set(ls)], rapido:T.parseRapido('gastei 50 no cartão')}; });
  ok(r.primeiro === 'Mãe' && r.principal === 'Cartão Azul', `com o cartão da Mãe primeiro na lista, o principal continua o Cartão Azul (${r.principal})`);
  ok(r.lugares.length > 0 && r.lugares.every(x => x === 'Crédito Cartão Azul'), `gasto previsto no crédito só no cartão principal (${r.lugares.join(', ')})`);
  ok(r.rapido.cartaoId === 'azul', `"gastei 50 no cartão" vai para o cartão principal (${r.rapido.cartaoId})`);
  await ir(p, '#contas'); await p.click('[data-a="contasAba"][data-v="cartoes"]'); await p.waitForTimeout(300);
  ok(/Cartão Azul principal/.test(await texto(p)), 'Contas › Cartões mostra qual é o principal');
  ok(!erros.length, `cartão principal: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 9) Mudar o projetado na hora: tocar no item em Hoje, mudar o valor, usar a média, zerar o cartão sem categoria
async function projManual(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  await p.evaluate(async () => { const T = window.__T;
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) await T.criarLanc({tipo:'despesa', valor:300, desc:'Fatura antiga', cat:'Cartão (sem detalhe)', data:m + '-10', meio:'credito', cartaoId:'azul', nparc:1}); });
  await p.waitForTimeout(400);
  const g = () => p.evaluate(() => { const T = window.__T; T.render(); const x = T.podeGastar(), d = T.diaDiaBase(), it = c => d.lista.find(y => y.c === c) || {};
    const csdFut = [...T.projMes('2027-01').linhas, ...T.projMes('2027-01', undefined, false, true)].filter(l => l.tipo === 'previsto' && l.cat === 'Cartão (sem detalhe)').reduce((t, l) => t + l.v, 0);
    return {total:x.total, lazer:it('Lazer').proj, lazerMedia:it('Lazer').media, csd:it('Cartão (sem detalhe)').proj, csdFut, orc:T.S.cfg.orc || {}}; });
  const a = await g(), novoV = Math.round(a.lazerMedia + 300);
  await ir(p, '#inicio'); await p.locator('.li[data-a="prevCat"][data-c="Lazer"]').first().click(); await p.waitForTimeout(300);
  ok(await p.locator('#sheet form[data-f="proj"]').count() === 1, 'tocar no item em Hoje abre a ficha para mudar o projetado');
  await p.fill('#sheet form[data-f="proj"] input[name="v"]', String(novoV)); await p.click('#sheet form[data-f="proj"] button[type="submit"]'); await p.waitForTimeout(400);
  const d = await g();
  ok(Math.abs(d.lazer - novoV) < 0.6 && Math.abs(d.total - a.total - (novoV - a.lazerMedia)) < 1, `Lazer projetado ${Math.round(a.lazerMedia)} → ${Math.round(d.lazer)}: o pode gastar sobe junto (${Math.round(a.total)} → ${Math.round(d.total)})`);
  ok(/Pode gastar: R\$/.test(await p.evaluate(() => document.body.innerText)), 'a mensagem mostra o efeito no pode gastar');
  await p.click('#sheet [data-a="projMedia"]'); await p.waitForTimeout(400);
  const e = await g();
  ok(Math.abs(e.total - a.total) < 0.6 && !('Lazer' in e.orc), `"Usar a média" volta como estava (${Math.round(e.total)})`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); await ir(p, '#inicio');
  ok(/Cartão sem categoria/.test(await texto(p)), 'o cartão sem categoria aparece com nome claro');
  await p.locator('.li[data-a="prevCat"][data-c="Cartão (sem detalhe)"]').first().click(); await p.waitForTimeout(300);
  ok(/De onde vem/.test(await p.evaluate(() => document.querySelector('#sheet').innerText)), 'a ficha explica de onde vem o cartão sem categoria');
  await p.evaluate(async () => { await window.__T.criarLanc({tipo:'despesa', valor:100, desc:'Fatura do mês', cat:'Cartão (sem detalhe)', data:window.__T.hoje(), meio:'credito', cartaoId:'azul', nparc:1}); }); await p.waitForTimeout(400);
  const e2 = await g();
  await p.click('#sheet [data-a="projZerar"]'); await p.waitForTimeout(400);
  const f = await g(), csdHoje = await p.evaluate(() => { const x = window.__T.diaDiaBase().lista.find(y => y.c === 'Cartão (sem detalhe)'); return {proj:x.proj, falta:x.falta, passou:x.passou}; });
  ok(Math.abs(csdHoje.proj - 100) < 0.6 && csdHoje.falta < 0.5 && csdHoje.passou < 0.5, `zerar não vira "passou do projetado": este mês fica no que já foi gasto (${Math.round(csdHoje.proj)}), sem estourar`);
  ok(f.csdFut < 0.5 && a.csdFut > 0.5 && f.total < e2.total, `zerar o cartão sem categoria tira a projeção dos próximos meses (jan: ${Math.round(a.csdFut)} → ${Math.round(f.csdFut)}) e o que faltava neste mês (pode gastar ${Math.round(e2.total)} → ${Math.round(f.total)})`);
  ok(!erros.length, `projetado manual: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 10) Mudar pelo texto (chat): projetado, contas fixas e o último lançamento, com Desfazer; gasto comum continua gasto
async function mudarTexto(b) {
  const {p, erros} = await abrir(b, '2026-11-22');
  const run = f => p.evaluate(async f => { const T = window.__T, S = T.S; S.chat = S.chat || []; await T.enviarChat(f); await new Promise(r => setTimeout(r, 600)); const d = document.createElement('div'); d.innerHTML = S.chat[S.chat.length - 1].h; return d.innerText.replace(/\s+/g, ' '); }, f);
  const est = () => p.evaluate(() => { const T = window.__T, S = T.S, f = id => S.fixos.find(x => x.id === id);
    return {orc:S.cfg.orc || {}, orcMes:S.cfg.orcMes || {}, sal:[T.valorFixo(f('rec-sal25'), '2026-12'), T.valorFixo(f('rec-sal25'), '2027-01')], net:[T.valorFixo(f('fx-internet'), '2026-12'), T.valorFixo(f('fx-internet'), '2027-01')], acadJan:(f('fx-academia').ajustes || {})['2027-01'], n:S.lanc.length}; });
  const a = await est();
  let r = await run('lazer 300 por mês'), e = await est();
  ok(e.orc.Lazer === 300 && e.n === a.n && /Pode gastar/.test(r), `"lazer 300 por mês" muda o projetado (não vira gasto) e mostra o efeito`);
  r = await run('compras 400 só em dezembro'); e = await est();
  ok((e.orcMes['2026-12'] || {}).Compras === 400 && !('Compras' in e.orc), '"compras 400 só em dezembro" muda só dezembro');
  r = await run('volta lazer para a média'); e = await est();
  ok(!('Lazer' in e.orc), '"volta lazer para a média" tira o valor');
  r = await run('salário de dezembro 3500'); e = await est();
  ok(e.sal[0] === 3500 && e.sal[1] === 3000 && e.n === a.n, `"salário de dezembro 3500" muda só a previsão de dezembro, sem lançar nada (dez ${e.sal[0]} · jan ${e.sal[1]})`);
  r = await run('internet 110 a partir de janeiro'); e = await est();
  ok(e.net[0] === 100 && e.net[1] === 110 && e.n === a.n, `"internet 110 a partir de janeiro" muda de janeiro em diante (dez ${e.net[0]} · jan ${e.net[1]})`);
  r = await run('não tem academia em janeiro'); e = await est();
  ok(e.acadJan && e.acadJan.pular, '"não tem academia em janeiro" tira só janeiro');
  r = await run('lazer 50'); e = await est();
  ok(/De onde saiu/.test(r) && !('Lazer' in e.orc), '"lazer 50" continua sendo gasto');
  await p.evaluate(async () => { await window.__T.criarLanc({tipo:'despesa', valor:23.5, desc:'Uber', cat:'Transporte', data:window.__T.hoje(), meio:'pix', nparc:1}); }); await p.waitForTimeout(300);
  await ir(p, '#ajuda'); r = await run('corrige o último para 50');
  ok(/Uber/.test(r) && await p.evaluate(() => window.__T.S.lanc.some(l => l.desc === 'Uber' && l.valor === 50)), '"corrige o último para 50" corrige o que acabou de lançar');
  await p.locator('#chatlog [data-a="desfazerMud"]').last().click(); await p.waitForTimeout(500);
  ok(await p.evaluate(() => window.__T.S.lanc.some(l => l.desc === 'Uber' && l.valor === 23.5)), 'Desfazer volta o valor de antes');
  r = await run('apaga o último');
  ok(/Apaguei/.test(r) && await p.evaluate(() => !window.__T.S.lanc.some(l => l.desc === 'Uber')), '"apaga o último" apaga');
  // pedido que a regra não entende: a IA só traduz para uma das ações (aqui, resposta simulada)
  await p.evaluate(() => { window.__T.S.sample = {json:async () => ({acao:'projetado', cat:'Lazer', valor:250, zerar:false, media:false, mes:null, aPartir:false})}; });
  r = await run('deixa o lazer mais em conta, uns duzentos e cinquenta'); e = await est();
  await p.evaluate(() => { window.__T.S.sample = null; });
  ok(e.orc.Lazer === 250, `pela IA: "deixa o lazer mais em conta…" vira projetado de Lazer R$ 250`);
  ok(!erros.length, `mudar pelo texto: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 11) Mais de um controle no mesmo e-mail (ex.: ver o da família e cuidar da casa da mãe): o topo mostra qual está aberto e o menu troca,
//     inclusive para quem só vê (o botão Abrir funciona no modo "só ver")
async function controles(b) {
  const {p, erros} = await abrir(b, '2026-11-22', 2500);
  await p.evaluate(() => { window.__trocouPara = null; window.__casa = {papel:() => 've', whats:() => null, casas:() => [{id:'fam', nome:'Controle da família', papel:'ve', ativa:true}, {id:'mae', nome:'Casa da mãe', papel:'dono'}], casaAtual:() => ({id:'fam', nome:'Controle da família'}), trocar:async id => { window.__trocouPara = id; }}; window.__T.render(); });
  await ir(p, '#inicio');
  ok(/Controle da família ▾/.test(await p.evaluate(() => document.querySelector('header').innerText)), 'o topo mostra qual controle está aberto');
  await p.click('header [data-a="menu"]'); await p.waitForTimeout(300);
  const menu = await p.evaluate(() => document.querySelector('#sheet').innerText);
  ok(/CONTROLES/.test(menu) && /Casa da mãe/.test(menu) && /você controla/.test(menu) && /só ver/.test(menu), 'o menu ☰ lista os controles e o papel em cada um');
  const bt = p.locator('#sheet [data-a="trocarCasa"]');
  ok(await bt.count() === 1 && await bt.isVisible(), 'quem só vê o controle da família ainda vê o botão Abrir da Casa da mãe');
  await bt.click(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__trocouPara) === 'mae', 'Abrir troca para a Casa da mãe');
  ok(!erros.length, `controles: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

// 12) As correções únicas combinadas com o dono para a casa dele (limites dele, dia 1, Nubank…) nunca mexem no controle de um cliente;
//     e o aviso de mês apertado diz quanto falta para o mês seguinte não usar o cartão (e não "livre de só R$ X")
async function controleCliente(b) {
  const roda = async cliente => { const p = await b.newPage({viewport:{width:390, height:844}}), erros = []; p.on('pageerror', e => erros.push(e.message));
    await p.clock.setFixedTime(new Date('2026-11-22T10:00:00'));
    if (cliente) await p.addInitScript(() => { window.__casa = {papel:() => 'dono', email:() => 'cliente@teste.com', dono:() => 'cliente@teste.com', whats:() => null}; });   // abre já como controle de cliente
    await p.goto(ARQ); await p.waitForTimeout(1500);
    await p.evaluate(async () => { const S = window.__T.S;
      const cfg = {...S.cfg, orc:{Mercado:500, Lazer:80}}; ['ajLim2611', 'ajDias2611', 'ajPago2611', 'ajMedia2611', 'ajCart2611', 'cartaoPrincipal'].forEach(k => { delete cfg[k]; });
      await S.db.doc('config/geral').set(cfg); window.__T.render(); });
    await p.waitForTimeout(9000);
    const r = await p.evaluate(() => { const o = window.__T.S.cfg.orc || {}; return {merc:o.Mercado, lazer:o.Lazer}; }); await p.close(); return {r, erros}; };
  const dono = await roda(false), cli = await roda(true);
  ok(dono.r.merc === 1700 && dono.r.lazer === undefined, `na casa do dono as correções combinadas rodam (Mercado ${dono.r.merc}, Lazer pela média)`);
  ok(cli.r.merc === 500 && cli.r.lazer === 80, `no controle de um cliente nada é trocado (Mercado ${cli.r.merc}, Lazer ${cli.r.lazer})`);
  const {p, erros} = await abrir(b, '2026-11-22', 1500);
  await p.evaluate(() => { const S = window.__T.S; return S.db.doc('config/geral').set({...S.cfg, folgaExtra:50000}); }); await p.waitForTimeout(300);
  const av = await p.evaluate(() => { window.__T.render(); return window.__T.alertasMes(window.__T.ymNow()).map(a => a.h).join(' | '); });
  ok(/não usar o cartão, faltam/.test(av) && !/fecha apertado: livre no fim de só/.test(av), `aviso de mês apertado diz quanto falta para o mês seguinte (${av.replace(/<[^>]+>/g, '').slice(0, 110)}…)`);
  ok(![...dono.erros, ...cli.erros, ...erros].length, `controle de cliente: sem erro na página${[...dono.erros, ...cli.erros, ...erros][0] ? ' → ' + [...dono.erros, ...cli.erros, ...erros][0] : ''}`); await p.close();
}

// 13) Todas as telas abrem sem erro
async function telas(b) {
  const {p, erros} = await abrir(b, '2026-11-22', 2500);
  for (const v of ['inicio', 'contas', 'planos', 'ajuda', 'extrato', 'guardado', 'mes', 'fixos', 'cartoes', 'emprestimos', 'ajustes']) await ir(p, '#' + v);
  await ir(p, '#contas'); for (let i = 0; i < 4; i++) { await p.click('[data-a="calMes"][data-d="1"]'); await p.waitForTimeout(200); }
  await ir(p, '#inicio'); await p.locator('[data-a="porDiaDet"]').first().click(); await p.waitForTimeout(300);
  ok(!erros.length, `todas as telas abrem sem erro${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

(async () => {
  const b = await chromium.launch();
  try {
    secao('As contas batem'); for (const d of ['2026-11-22', '2026-11-26', '2026-12-31', '2027-02-28']) await contasBatem(b, d);
    secao('Cada gasto mexe no número certo'); await gastos(b);
    secao('Gasto com data futura é agendado'); await agendado(b);
    secao('Mês à frente não mexe no pode gastar'); await futuroNaoMexe(b);
    secao('Categoria estourada ainda desconta'); await estourada(b);
    secao('Confirmação mostra o efeito'); await confirmacao(b);
    secao('Pode gastar pela média e pelo dinheiro'); await regrasPode(b);
    secao('Tela Hoje clara e regra proporcional única'); await hojeClara(b);
    secao('Contas e Planos claros'); await contasPlanos(b);
    secao('Senha do aparelho'); await seguranca(b);
    secao('Celular'); await celular(b);
    secao('Abrir rápido com internet lenta'); await swRapido();
    secao('Começar do zero e menu que cresce'); await comecarZero(b);
    secao('Auditoria: teto, frases, só ver e ajustes por caminho'); await auditoria2(b);
    secao('Hoje, Mês e Ano'); await telasNovas(b);
    secao('O que ainda enganava, teto calculado e WhatsApp'); await auditoria3(b);
    secao('Datas no chat'); await datasChat(b);
    secao('Reserva do carro'); await reserva(b);
    secao('Mudar valor no mês seguinte'); await mudarMes(b);
    secao('Folga calculada e média em todos os meses'); await folgaMedia(b);
    secao('Crédito previsto só no cartão principal'); await cartaoPrincipal(b);
    secao('Mudar o projetado na hora'); await projManual(b);
    secao('Mudar pelo texto (chat)'); await mudarTexto(b);
    secao('Mais de um controle no mesmo e-mail'); await controles(b);
    secao('Controle de cliente e aviso de mês apertado'); await controleCliente(b);
    secao('Telas'); await telas(b);
  } catch (e) { ok(false, 'o teste quebrou: ' + e.message); }
  await b.close();
  console.log(R.join('\n')); console.log(`\n${falhas ? `❌ ${falhas} falha(s)` : '✅ tudo certo'}`); process.exit(falhas ? 1 : 0);
})();
