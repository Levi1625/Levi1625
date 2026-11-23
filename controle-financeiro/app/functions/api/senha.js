// POST /api/senha {atual, nova}: trocar a senha sabendo a atual. Este aparelho continua; os outros pedem a senha nova.
// Errar a atual conta como erro de senha (trava 15 minutos depois de 8, igual ao entrar).
import { json, banco, sessao, mesmaOrigem, conferirSenha, hashSenha, aleatorio } from "../../lib/server.js";
export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401);
  const db = await banco(env), b = await request.json().catch(() => ({})), atual = String(b.atual || ""), nova = String(b.nova || "");
  const u = await db.prepare("SELECT * FROM usuarios WHERE email = ?").bind(s.email).first();
  if (!u || !u.hash) return json({ erro: "Conta sem senha." }, 400);
  if (u.bloqueio > Date.now()) return json({ erro: "Muitas tentativas. Espere 15 minutos." }, 429);
  if (!(await conferirSenha(atual, u))) {
    const f = (u.falhas || 0) + 1;
    await db.prepare("UPDATE usuarios SET falhas = ?, bloqueio = ? WHERE email = ?").bind(f >= 8 ? 0 : f, f >= 8 ? Date.now() + 15 * 60e3 : 0, s.email).run();
    return json({ erro: "A senha atual está errada." }, 401);
  }
  if (nova.length < 8) return json({ erro: "A senha nova precisa de pelo menos 8 letras ou números." }, 400);
  if (nova === atual) return json({ erro: "A senha nova é igual à atual." }, 400);
  const salt = aleatorio(16);
  const r = await db.batch([db.prepare("UPDATE usuarios SET hash = ?, salt = ?, falhas = 0, bloqueio = 0 WHERE email = ?").bind(await hashSenha(nova, salt), salt, s.email),
    db.prepare("DELETE FROM sessoes WHERE email = ? AND token <> ?").bind(s.email, s.token)]);
  return json({ ok: true, aparelhos: (r[1].meta && r[1].meta.changes) || 0 });
}
