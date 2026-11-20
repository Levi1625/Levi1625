// GET /api/iauso: gastos da IA (por tipo, por dia e últimos usos). Quem administra também vê os créditos da chave.
// POST /api/iauso {usd}: quem administra informa que colocou mais créditos na Anthropic.
import { json, banco, sessao, adminEmail, mesmaOrigem } from "../../lib/server.js";

async function creditos(db) { const r = await db.prepare("SELECT valor FROM ajustes_app WHERE chave = 'creditos'").first(); return r ? JSON.parse(r.valor) : []; }

export async function onRequestGet({ request, env }) {
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401);
  const db = await banco(env), admin = s.email === adminEmail(env);
  const ini = new Date(); ini.setUTCDate(1); ini.setUTCHours(0, 0, 0, 0); const desdeMes = ini.getTime(), desde30 = Date.now() - 30 * 864e5;
  const filtro = admin ? "" : "casa = ? AND ", arg = admin ? [] : [s.casa];
  const porTipo = (await db.prepare(`SELECT tipo, COUNT(*) AS n, SUM(usd) AS usd FROM ia_log WHERE ${filtro}quando >= ? GROUP BY tipo ORDER BY usd DESC`).bind(...arg, desdeMes).all()).results || [];
  const porDia = (await db.prepare(`SELECT strftime('%Y-%m-%d', quando / 1000, 'unixepoch', '-3 hours') AS dia, COUNT(*) AS n, SUM(usd) AS usd FROM ia_log WHERE ${filtro}quando >= ? GROUP BY dia ORDER BY dia`).bind(...arg, desde30).all()).results || [];
  const ultimos = (await db.prepare(`SELECT quando, tipo, usd, email FROM ia_log WHERE ${filtro}1 = 1 ORDER BY quando DESC LIMIT 15`).bind(...arg).all()).results || [];
  const out = { admin, porTipo, porDia, ultimos: ultimos.map((x) => ({ ...x, email: admin ? x.email : undefined })) };
  if (admin) {
    const cr = await creditos(db), colocado = cr.reduce((t, c) => t + (+c.usd || 0), 0), primeiro = cr.length ? Math.min(...cr.map((c) => c.quando)) : null;
    const usado = primeiro ? +(((await db.prepare("SELECT SUM(usd) AS t FROM ia_log WHERE quando >= ?").bind(primeiro).first()) || {}).t || 0) : 0;
    const porCasa = (await db.prepare("SELECT c.id, COALESCE(c.cliente, c.dono) AS nome, SUM(l.usd) AS usd, COUNT(*) AS n FROM ia_log l JOIN casas c ON c.id = l.casa WHERE l.quando >= ? GROUP BY c.id ORDER BY usd DESC").bind(desdeMes).all()).results || [];
    const ult7 = +(((await db.prepare("SELECT SUM(usd) AS t FROM ia_log WHERE quando >= ?").bind(Date.now() - 7 * 864e5).first()) || {}).t || 0);
    out.creditos = { lista: cr, colocado, usado, resta: colocado - usado, mediaDia: ult7 / 7, porCasa };
  }
  return json(out);
}

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env); if (!s || s.email !== adminEmail(env)) return json({ erro: "Só para quem administra o app." }, 403);
  const db = await banco(env), b = await request.json().catch(() => ({})), usd = Math.round((+b.usd || 0) * 100) / 100;
  let cr = await creditos(db);
  if (b.zerar) cr = [];
  else if (b.saldo != null) { const v = Math.round((+b.saldo || 0) * 100) / 100; if (!(v >= 0) || v > 10000) return json({ erro: "Valor inválido." }, 400); cr = [{ usd: v, quando: Date.now(), saldo: true }]; }
  else { if (!(usd > 0) || usd > 10000) return json({ erro: "Valor inválido." }, 400); cr.push({ usd, quando: Date.now() }); }
  await db.prepare("INSERT INTO ajustes_app (chave, valor) VALUES ('creditos', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").bind(JSON.stringify(cr)).run();
  return json({ ok: true });
}
