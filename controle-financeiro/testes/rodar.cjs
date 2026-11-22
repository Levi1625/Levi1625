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
  ok(Math.abs(d.dia - a.dia) < 0.6 && Math.abs(d.pode - Math.max(0, d.dia - d.reserva)) < 1, 'o dia a dia de hoje não muda (só segura se um mês à frente ficar negativo)');
  ok(Math.abs(d.nov - a.nov + 300) < 0.6 && Math.abs(d.jan - a.jan + 2800) < 0.6, `cada um entra no mês da data (nov ${Math.round(d.nov - a.nov)}, jan acumulado ${Math.round(d.jan - a.jan)})`);
  ok(Math.abs(d.fimJan - d.contaFimJan) < 2, 'Contas de janeiro fecha igual à projeção');
  await ir(p, '#contas'); ok(/28 NOV[\s\S]{0,200}Conserto do portão[\s\S]{0,40}agendado/i.test(await texto(p)), 'Contas de novembro: conserto no dia 28, "agendado"');
  await ir(p, '#inicio'); ok(/Conserto do portão \(agendado\)/.test(await texto(p)), 'Hoje › Próximos 7 dias mostra o agendado');
  await p.clock.setFixedTime(new Date('2027-01-31T10:00:00')); const z = await p.evaluate(() => { window.__T.render(); return window.__T.saldoHoje(); });
  ok(Math.abs(d.conta - z - 2800) < 0.6, `quando a data chega, sai da conta (${Math.round(d.conta - z)})`);
  ok(!erros.length, `agendado: sem erro na página${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
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

// 6) Todas as telas abrem sem erro
async function telas(b) {
  const {p, erros} = await abrir(b, '2026-11-22', 2500);
  for (const v of ['inicio', 'contas', 'planos', 'ajuda', 'extrato', 'guardado', 'mes', 'fixos', 'cartoes', 'emprestimos', 'ajustes']) await ir(p, '#' + v);
  await ir(p, '#contas'); for (let i = 0; i < 4; i++) { await p.click('[data-a="calMes"][data-d="1"]'); await p.waitForTimeout(200); }
  await ir(p, '#inicio'); await p.click('[data-a="porDiaDet"]').catch(() => {}); await p.waitForTimeout(300);
  ok(!erros.length, `todas as telas abrem sem erro${erros.length ? ' → ' + erros[0] : ''}`); await p.close();
}

(async () => {
  const b = await chromium.launch();
  try {
    secao('As contas batem'); for (const d of ['2026-11-22', '2026-11-26', '2026-12-31', '2027-02-28']) await contasBatem(b, d);
    secao('Cada gasto mexe no número certo'); await gastos(b);
    secao('Gasto com data futura é agendado'); await agendado(b);
    secao('Datas no chat'); await datasChat(b);
    secao('Reserva do carro'); await reserva(b);
    secao('Telas'); await telas(b);
  } catch (e) { ok(false, 'o teste quebrou: ' + e.message); }
  await b.close();
  console.log(R.join('\n')); console.log(`\n${falhas ? `❌ ${falhas} falha(s)` : '✅ tudo certo'}`); process.exit(falhas ? 1 : 0);
})();
