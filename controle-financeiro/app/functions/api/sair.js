// POST /api/sair: sai deste aparelho.
// POST /api/sair {outros:true}: continua neste aparelho e desconecta todos os outros da mesma conta (ex.: celular perdido).
import { json, banco, sessao, cookieSessao, mesmaOrigem } from "../../lib/server.js";
export async function onRequestPost({ request, env }) {
  const s = await sessao(request, env), b = await request.json().catch(() => ({})), db = await banco(env);
  if (b && b.outros) {
    if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
    if (!s) return json({ erro: "Entre no app." }, 401);
    const r = await db.prepare("DELETE FROM sessoes WHERE email = ? AND token <> ?").bind(s.email, s.token).run();
    return json({ ok: true, aparelhos: (r.meta && r.meta.changes) || 0 });
  }
  if (s) await db.prepare("DELETE FROM sessoes WHERE token = ?").bind(s.token).run();
  return json({ ok: true }, 200, { "set-cookie": cookieSessao("", request) });
}
