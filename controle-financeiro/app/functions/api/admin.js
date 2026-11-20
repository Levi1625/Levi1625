// /api/admin: só para quem administra o app (ADMIN_EMAIL). Lista, libera, pausa e define o limite de IA dos clientes.
import { json, banco, sessao, lerCasa, normEmail, aleatorio, adminEmail, limiteIA, usoDoMes, mesmaOrigem } from "../../lib/server.js";

async function eAdmin(request, env) { const s = await sessao(request, env); return s && s.email === adminEmail(env) ? s : null; }

export async function onRequestGet({ request, env }) {
  const s = await eAdmin(request, env); if (!s) return json({ erro: "Só para quem administra o app." }, 403);
  const db = await banco(env), r = await db.prepare("SELECT id FROM casas ORDER BY rowid").all(), out = [];
  for (const { id } of r.results || []) {
    const c = await lerCasa(db, id), lim = limiteIA(c, env);
    const contas = await db.prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE casa = ? AND hash IS NOT NULL`).bind(id).first();
    out.push({ id, dono: c.dono, cliente: c.cliente, membros: c.membros, ativos: contas ? contas.n : 0, pausado: c.pausado, whatsapp: !!(c.whatsapp && c.temChaveWhats), ia: c.ia, usoIA: usoDoMes(c), limiteIA: lim === Infinity ? null : lim, minha: c.id === s.casa });
  }
  return json({ casas: out });
}

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await eAdmin(request, env); if (!s) return json({ erro: "Só para quem administra o app." }, 403);
  const db = await banco(env), b = await request.json().catch(() => ({}));
  if (b.acao === "add") {
    const e = normEmail(b.email); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ erro: "E-mail inválido." }, 400);
    const ja = await db.prepare("SELECT id FROM casas WHERE membros LIKE ?").bind(`%"${e}"%`).first();
    if (ja) return json({ erro: "Esse e-mail já tem um controle." }, 409);
    await db.prepare("INSERT INTO casas (id, dono, membros, cliente, upd) VALUES (?, ?, ?, ?, ?)").bind(aleatorio(10), e, JSON.stringify([e]), String(b.nome || "").slice(0, 60), Date.now()).run();
    return json({ ok: true });
  }
  const c = b.id && await db.prepare("SELECT id, dono FROM casas WHERE id = ?").bind(b.id).first();
  if (!c) return json({ erro: "Cliente não encontrado." }, 404);
  if (c.id === s.casa && b.acao !== "limite") return json({ erro: "Esse é o seu próprio controle." }, 400);
  if (b.acao === "pausar") await db.prepare("UPDATE casas SET pausado = ? WHERE id = ?").bind(b.valor ? 1 : 0, c.id).run();
  else if (b.acao === "limite") await db.prepare("UPDATE casas SET ia_limite = ? WHERE id = ?").bind(b.valor === null || b.valor === "" ? null : Math.max(0, +b.valor || 0), c.id).run();
  else if (b.acao === "remover") {
    await db.batch([
      db.prepare("DELETE FROM docs WHERE casa = ?").bind(c.id),
      db.prepare("DELETE FROM sessoes WHERE email IN (SELECT email FROM usuarios WHERE casa = ?)").bind(c.id),
      db.prepare("DELETE FROM usuarios WHERE casa = ?").bind(c.id),
      db.prepare("DELETE FROM casas WHERE id = ?").bind(c.id),
    ]);
  } else return json({ erro: "Ação inválida." }, 400);
  return json({ ok: true });
}
