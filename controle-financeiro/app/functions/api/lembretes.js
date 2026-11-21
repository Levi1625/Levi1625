// GET /api/lembretes?chave=...&enviar=1[&hoje=AAAA-MM-DD]
// Monta o lembrete do dia (contas, dinheiro que cai, agenda das viagens e do plano) a partir
// dos dados do app e, com enviar=1, manda pelo WhatsApp (CallMeBot). Chamado todo dia de manhã (8h) pelo cron-job.org.
// Cada casa cadastra o próprio WhatsApp e a chave do CallMeBot em Ajustes. Para a casa de LEMBRETES_EMAIL,
// se ela não tiver cadastro próprio, valem as variáveis WHATSAPP e CALLMEBOT_APIKEY do Cloudflare.
// LEMBRETES_CHAVE (segredo) protege esta rota; o cron-job.org chama com ?chave=...&enviar=1.
import { json, banco, enviarWhats, normEmail } from "../../lib/server.js";

const brl = (v) => "R$ " + (+v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const addDia = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hojeSP = () => new Date().toLocaleString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 10);
const ORIGEM = (m) => !m ? "conta" : m === "va" ? "vale" : m === "vr" ? "vale refeição" : m.startsWith("cc:") ? "crédito " + m.slice(3) : m;

export function montar(dados, HOJE) {
  const M = HOJE.slice(0, 7), D = +HOJE.slice(8), AMANHA = addDia(HOJE, 1), ddmm = HOJE.slice(8) + "/" + HOJE.slice(5, 7);
  const lanc = dados.lanc || [], cfg = dados.config || {};
  const ativo = (f) => f.ativo !== false && (!f.inicio || f.inicio <= M) && (!f.fim || f.fim >= M) && !(f.ajustes && f.ajustes[M] && f.ajustes[M].pular);
  const dia = (f) => +((f.ajustes && f.ajustes[M] && f.ajustes[M].dia) || f.dia || 1);
  const valor = (f) => +((f.ajustes && f.ajustes[M] && f.ajustes[M].v != null) ? f.ajustes[M].v : f.valor) || 0;
  const pago = (f) => lanc.some((l) => l.fixoId === f.id && (l.refMes || l.mes) === M);

  const contas = [];
  for (const f of dados.fixos || []) {
    if ((f.tipo || "despesa") !== "despesa" || f.repasse || f.cartaoId || !ativo(f) || pago(f)) continue;
    const dd = dia(f); if (dd - D <= 3) contas.push({ dia: dd, desc: f.desc, v: valor(f) });
  }
  // Fatura = compras lançadas + assinaturas/contas fixas no crédito ainda não lançadas (mesma regra do app).
  const addM = (ym, n) => { const [y, m] = ym.split("-").map(Number), t = y * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")}`; };
  const ajM = (f, m) => (f.ajustes && f.ajustes[m]) || null;
  const ativoM = (f, m) => f.ativo !== false && !f.repasse && (!f.inicio || f.inicio <= m) && (!f.fim || f.fim >= m) && !(ajM(f, m) && ajM(f, m).pular);
  const mesFatura = (y, m, d, c) => { const F = +c.fecha || 1, V = +c.vence || 10, ym = `${y}-${String(m).padStart(2, "0")}`, fech = d >= F ? addM(ym, 1) : ym; return V > F ? fech : addM(fech, 1); };
  const fixosNaFatura = (c) => { let t = 0; for (const mm of [addM(M, -2), addM(M, -1), M]) for (const f of dados.fixos || []) {
    if (f.cartaoId !== c.id || f.tipo === "receita" || !ativoM(f, mm) || lanc.some((l) => l.fixoId === f.id && (l.refMes || l.mes) === mm)) continue;
    const [y, m] = mm.split("-").map(Number), a = ajM(f, mm), dd = Math.min(+((a && a.dia) || f.dia || 1), new Date(Date.UTC(y, m, 0)).getUTCDate());
    if (mesFatura(y, m, dd, c) === M) t += +((a && a.v != null) ? a.v : f.valor) || 0;
  } return t; };
  for (const c of dados.cartoes || []) {
    const total = lanc.filter((l) => l.cartaoId === c.id && l.mes === M && l.tipo !== "receita").reduce((s, l) => s + (+l.valor || 0), 0) + fixosNaFatura(c);
    if (total > 0 && !(cfg.faturasPagas && cfg.faturasPagas[`${c.id}_${M}`]) && (+c.vence || 1) - D <= 3) contas.push({ dia: +c.vence || 1, desc: "Fatura " + c.nome, v: total });
  }
  contas.sort((a, b) => a.dia - b.dia);
  const caiHoje = (dados.fixos || []).filter((f) => f.tipo === "receita" && ativo(f) && !pago(f) && dia(f) === D);

  const hoje = [], amanha = [];
  for (const o of dados.objetivos || []) {
    if (o.status === "concluido") continue;
    for (const p of o.passos || []) { if (p.d === HOJE) hoje.push(`${p.t} (${o.nome})`); else if (p.d === AMANHA) amanha.push(`${p.t} (${o.nome})`); }
    for (const it of o.itens || []) if (it.quando && it.quando.includes(ddmm)) hoje.push(`${it.cat}: até ${brl(it.prev)} · sai de ${ORIGEM(it.meio)}${it.onde ? " · " + it.onde : ""}`);
  }
  // Guardar para objetivos (caixinhas) no dia em que o dinheiro cai.
  const guardar = [];
  if (caiHoje.length) for (const o of dados.objetivos || []) {
    if (o.status === "concluido" || !o.alvo || o.alvo <= M) continue;
    const movs = o.movs || [], usa = o.guardar === true || movs.some((mv) => mv.em && mv.t !== "passar" && +mv.v > 0);
    if (!usa) continue;
    const prev = (o.itens || []).reduce((t, it) => t + (+it.prev || 0), 0), g = movs.reduce((t, mv) => t + (+mv.v || 0), 0);
    const gasto = lanc.filter((l) => l.objId === o.id).reduce((t, l) => t + (+l.valor || 0), 0);
    const feito = movs.filter((mv) => (mv.d || "").slice(0, 7) === M && +mv.v > 0 && mv.t !== "passar").reduce((t, mv) => t + (+mv.v || 0), 0);
    const [ya, ma] = M.split("-").map(Number), [yb, mb] = o.alvo.split("-").map(Number), meses = Math.max(1, (yb - ya) * 12 + (mb - ma));
    const resto = (Math.max(0, prev - gasto - g) + feito) / meses - feito;
    if (resto >= 1) guardar.push(`• ${o.nome}: ${brl(resto)} (escreva no app: guardei ${Math.round(resto)} ${o.nome.split(/[ (]/)[0].toLowerCase()})`);
  }
  // Resumo da semana aos domingos.
  const semana = [];
  if (new Date(HOJE + "T12:00:00Z").getUTCDay() === 0) {
    const ini = addDia(HOJE, -6), fim7 = addDia(HOJE, 7);
    const gastos = lanc.filter((l) => l.tipo !== "receita" && l.data >= ini && l.data <= HOJE && l.cat !== "Repasse" && !l.fixoId);
    const tot = gastos.reduce((t, l) => t + (+l.valor || 0), 0), porCat = {};
    gastos.forEach((l) => { porCat[l.cat || "Outros"] = (porCat[l.cat || "Outros"] || 0) + (+l.valor || 0); });
    const top = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} ${brl(v)}`).join(" · ");
    const prox = (dados.fixos || []).filter((f) => (f.tipo || "despesa") === "despesa" && !f.repasse && !f.cartaoId && ativo(f) && !pago(f)).map((f) => ({ d: `${M}-${String(dia(f)).padStart(2, "0")}`, desc: f.desc, v: valor(f) })).filter((x) => x.d > HOJE && x.d <= fim7);
    const guard = (dados.objetivos || []).filter((o) => o.status !== "concluido").reduce((t, o) => t + (o.movs || []).reduce((s2, mv) => s2 + (+mv.v || 0), 0), 0);
    semana.push(`📊 Resumo da semana`, `• Gastos do dia a dia: ${brl(tot)}${top ? ` (${top})` : ""}`);
    if (prox.length) semana.push(`• Contas nos próximos 7 dias: ${prox.map((x) => `${x.desc} ${brl(x.v)} dia ${+x.d.slice(8)}`).join(" · ")}`);
    if (guard > 0) semana.push(`• Guardado nas caixinhas: ${brl(guard)}`);
  }
  if (!contas.length && !caiHoje.length && !hoje.length && !amanha.length && !guardar.length && !semana.length) return null;

  const L = [];
  if (hoje.length) L.push(`📅 Hoje (${ddmm})`, ...hoje.map((t) => "• " + t));
  if (amanha.length) L.push("⏭️ Amanhã", ...amanha.map((t) => "• " + t));
  if (caiHoje.length) L.push("💰 Deve cair hoje", ...caiHoje.map((f) => `• ${f.desc} ${brl(valor(f))} → quando cair, escreva no app: recebi ${f.desc.split(/[:(–-]/)[0].trim().toLowerCase()} ${valor(f).toFixed(2).replace(".", ",")}`));
  if (guardar.length) L.push("🏦 Guardar hoje (o dinheiro caiu)", ...guardar);
  if (contas.length) {
    L.push("💸 Contas", ...contas.map((c) => `• ${c.dia === D ? "Hoje" : c.dia < D ? `ATRASADA (dia ${c.dia})` : `Dia ${c.dia} (em ${c.dia - D} dia${c.dia - D > 1 ? "s" : ""})`}: ${c.desc} ${brl(c.v)}`));
    L.push(`Total: ${brl(contas.reduce((s, c) => s + c.v, 0))}`);
  }
  if (semana.length) L.push(...semana);
  L.push("✍️ Depois de pagar ou gastar, lance o valor real no app (ex.: paguei aluguel 2478 · roupas sabrina 950 viagem).");
  return L.join("\n");
}

async function dadosDaCasa(db, casa) {
  const r = await db.prepare("SELECT path, data FROM docs WHERE casa = ? AND del = 0").bind(casa).all();
  const dados = { lanc: [], fixos: [], cartoes: [], emprestimos: [], objetivos: [], config: {} };
  for (const d of r.results || []) { const [col, id] = d.path.split("/"); const x = { id, ...JSON.parse(d.data) }; if (col === "config") dados.config = x; else if (dados[col]) dados[col].push(x); }
  return dados;
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  if (!env.LEMBRETES_CHAVE || u.searchParams.get("chave") !== env.LEMBRETES_CHAVE) return json({ erro: "Chave inválida." }, 403);
  const db = await banco(env), base = u.origin, teste = u.searchParams.get("hoje");
  const HOJE = /^\d{4}-\d{2}-\d{2}$/.test(teste || "") ? teste : hojeSP();
  const dono = await db.prepare("SELECT casa FROM usuarios WHERE email = ?").bind(normEmail(env.LEMBRETES_EMAIL)).first();
  const casas = (await db.prepare("SELECT id, whatsapp, callmebot, lembretes, pausado FROM casas").all()).results || [];
  const destinos = [];
  for (const c of casas) {
    if (c.pausado || c.lembretes === 0) continue;
    let numero = c.whatsapp, chave = c.callmebot;
    if ((!numero || !chave) && dono && dono.casa === c.id) { numero = numero || env.WHATSAPP; chave = chave || env.CALLMEBOT_APIKEY; }
    if (numero && chave) destinos.push({ id: c.id, numero, chave });
  }
  // Sem enviar=1: só mostra o texto da sua casa (para conferir).
  if (u.searchParams.get("enviar") !== "1") {
    if (!dono) return json({ erro: "LEMBRETES_EMAIL não tem conta no app." }, 404);
    const t = montar(await dadosDaCasa(db, dono.casa), HOJE);
    return json({ hoje: HOJE, texto: t ? t + "\n" + base : null, casasComWhats: destinos.length });
  }
  let enviados = 0, falhas = 0;
  for (const d of destinos) {
    let t = montar(await dadosDaCasa(db, d.id), HOJE); if (!t) continue;
    t += "\n" + base; if (teste) t = `🧪 TESTE (simulando ${HOJE.slice(8)}/${HOJE.slice(5, 7)})\n` + t;
    const r = await enviarWhats(d.numero, d.chave, t); r.ok ? enviados++ : falhas++;
  }
  // Não devolve o conteúdo: quem agenda a chamada não vê os dados de ninguém.
  return json({ hoje: HOJE, casas: destinos.length, enviados, falhas });
}
