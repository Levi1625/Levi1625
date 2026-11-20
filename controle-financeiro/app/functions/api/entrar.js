// POST /api/entrar {email, senha}
import { json, banco, normEmail, conferirSenha, criarSessao, mesmaOrigem, repararDono } from "../../lib/server.js";
export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const db = await banco(env);
  const b = await request.json().catch(() => ({}));
  const email = normEmail(b.email);
  const u = await db.prepare("SELECT * FROM usuarios WHERE email = ?").bind(email).first();
  if (!u || !u.hash) return json({ erro: "Não achei conta com esse e-mail. Toque em Primeiro acesso." }, 404);
  if (u.bloqueio > Date.now()) return json({ erro: "Muitas tentativas. Espere 15 minutos." }, 429);
  if (!(await conferirSenha(String(b.senha || ""), u))) {
    const f = (u.falhas || 0) + 1;
    await db.prepare("UPDATE usuarios SET falhas = ?, bloqueio = ? WHERE email = ?").bind(f >= 8 ? 0 : f, f >= 8 ? Date.now() + 15 * 60e3 : 0, email).run();
    return json({ erro: "Senha errada." }, 401);
  }
  await db.prepare("UPDATE usuarios SET falhas = 0, bloqueio = 0 WHERE email = ?").bind(email).run();
  await repararDono(db, email);
  return json({ ok: true }, 200, { "set-cookie": await criarSessao(db, email, request) });
}
