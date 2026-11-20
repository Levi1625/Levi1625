// GET /api/lembretes?chave=...&enviar=1[&hoje=AAAA-MM-DD]
// Monta o lembrete do dia (contas, dinheiro que cai, agenda das viagens e do plano) a partir
// dos dados do app e, com enviar=1, manda pelo WhatsApp (CallMeBot). Chamado todo dia às 8h35.
// Variáveis no Cloudflare: LEMBRETES_CHAVE (segredo), LEMBRETES_EMAIL (de quem é a casa),
// CALLMEBOT_APIKEY (segredo) e WHATSAPP (número no formato que o CallMeBot ativou).
import { json, banco } from "../../lib/server.js";

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
  for (const c of dados.cartoes || []) {
    const total = lanc.filter((l) => l.cartaoId === c.id && l.mes === M && l.tipo !== "receita").reduce((s, l) => s + (+l.valor || 0), 0);
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
  if (!contas.length && !caiHoje.length && !hoje.length && !amanha.length) return null;

  const L = [];
  if (hoje.length) L.push(`📅 Hoje (${ddmm})`, ...hoje.map((t) => "• " + t));
  if (amanha.length) L.push("⏭️ Amanhã", ...amanha.map((t) => "• " + t));
  if (caiHoje.length) L.push("💰 Deve cair hoje", ...caiHoje.map((f) => `• ${f.desc} ${brl(valor(f))} → quando cair, escreva no app: recebi ${f.desc.split(/[:(–-]/)[0].trim().toLowerCase()} ${valor(f).toFixed(2).replace(".", ",")}`));
  if (contas.length) {
    L.push("💸 Contas", ...contas.map((c) => `• ${c.dia === D ? "Hoje" : c.dia < D ? `ATRASADA (dia ${c.dia})` : `Dia ${c.dia} (em ${c.dia - D} dia${c.dia - D > 1 ? "s" : ""})`}: ${c.desc} ${brl(c.v)}`));
    L.push(`Total: ${brl(contas.reduce((s, c) => s + c.v, 0))}`);
  }
  L.push("✍️ Depois de pagar ou gastar, lance o valor real no app (ex.: paguei aluguel 2478 · roupas sabrina 950 viagem).");
  return L.join("\n");
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  if (!env.LEMBRETES_CHAVE || u.searchParams.get("chave") !== env.LEMBRETES_CHAVE) return json({ erro: "Chave inválida." }, 403);
  const db = await banco(env);
  const usuario = await db.prepare("SELECT casa FROM usuarios WHERE email = ?").bind(String(env.LEMBRETES_EMAIL || "").toLowerCase()).first();
  if (!usuario) return json({ erro: "LEMBRETES_EMAIL não tem conta no app." }, 404);
  const r = await db.prepare("SELECT path, data FROM docs WHERE casa = ? AND del = 0").bind(usuario.casa).all();
  const dados = { lanc: [], fixos: [], cartoes: [], emprestimos: [], objetivos: [], config: {} };
  for (const d of r.results || []) { const [col, id] = d.path.split("/"); const x = { id, ...JSON.parse(d.data) }; if (col === "config") dados.config = x; else if (dados[col]) dados[col].push(x); }
  const HOJE = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("hoje") || "") ? u.searchParams.get("hoje") : hojeSP();
  let texto = montar(dados, HOJE);
  if (!texto) return json({ hoje: HOJE, enviado: false, nada: true });
  const base = new URL(request.url).origin;
  texto += "\n" + base;
  if (u.searchParams.get("hoje")) texto = `🧪 TESTE (simulando ${HOJE.slice(8)}/${HOJE.slice(5, 7)})\n` + texto;
  let enviado = false, resposta = "";
  if (u.searchParams.get("enviar") === "1" && env.CALLMEBOT_APIKEY && env.WHATSAPP) {
    const partes = []; let atual = "";
    for (const linha of texto.split("\n")) { if ((atual + "\n" + linha).length > 1400) { partes.push(atual); atual = linha; } else atual = atual ? atual + "\n" + linha : linha; }
    if (atual) partes.push(atual);
    for (const [i, p] of partes.entries()) {
      if (i) await new Promise((ok) => setTimeout(ok, 5000));
      const q = new URLSearchParams({ phone: "+" + String(env.WHATSAPP).replace(/\D/g, ""), text: p, apikey: env.CALLMEBOT_APIKEY });
      const resp = await fetch("https://api.callmebot.com/whatsapp.php?" + q.toString());
      resposta = (await resp.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 200);
      enviado = resp.ok && !/error/i.test(resposta);
    }
  }
  // Quando envia pelo WhatsApp, não devolve o texto (quem agenda a chamada não precisa ver seus dados).
  return json(u.searchParams.get("enviar") === "1" ? { hoje: HOJE, enviado, resposta } : { hoje: HOJE, enviado, texto });
}
