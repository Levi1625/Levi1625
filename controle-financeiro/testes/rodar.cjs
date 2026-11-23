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
  await ir(p, '#inicio'); ok(/Conserto do portão \(agendado\)/.test(await texto(p)), 'Hoje › Próximos 7 dias mostra o agendado');
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
  await ir(p, '#inicio'); ok(/Falta tirando tudo: .* em mar\/27/.test(await texto(p)), 'Hoje mostra "Falta tirando tudo … em mar/27"');
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
  await ir(p, '#inicio'); ok(/Falta tirando tudo/.test(await texto(p)), 'Hoje mostra "Falta tirando tudo"');
  ok(!erros.length, `regras: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
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
