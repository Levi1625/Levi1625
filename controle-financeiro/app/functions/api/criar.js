// POST /api/criar {email, senha, nome}: primeiro acesso (ou nova senha depois de ser liberado de novo).
import { json, banco, normEmail, hashSenha, aleatorio, criarSessao, casaDoEmail, permitidosEnv, mesmaOrigem } from "../../lib/server.js";
export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const db = await banco(env);
  const b = await request.json().catch(() => ({}));
  const email = normEmail(b.email), senha = String(b.senha || ""), nome = String(b.nome || "").trim().slice(0, 40);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: "E-mail inválido." }, 400);
  if (senha.length < 6) return json({ erro: "A senha precisa de pelo menos 6 letras ou números." }, 400);
  const casa = await casaDoEmail(db, email);
  if (!casa && !permitidosEnv(env).includes(email)) return json({ erro: "Este e-mail não tem acesso. Peça para alguém da casa liberar em Ajustes." }, 403);
  const existe = await db.prepare("SELECT hash FROM usuarios WHERE email = ?").bind(email).first();
  const reset = normEmail(env.RESET_SENHA) === email;
  if (existe && existe.hash && !reset) return json({ erro: "Este e-mail já tem senha. Toque em Entrar." }, 409);
  let casaId = casa && casa.id;
  if (!casaId) { casaId = aleatorio(10); await db.prepare("INSERT INTO casas (id, dono, membros, upd) VALUES (?, ?, ?, ?)").bind(casaId, email, JSON.stringify([email]), Date.now()).run(); }
  const salt = aleatorio(16);
  await db.prepare("INSERT INTO usuarios (email, nome, hash, salt, casa, criado) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET nome = excluded.nome, hash = excluded.hash, salt = excluded.salt, casa = excluded.casa, falhas = 0, bloqueio = 0")
    .bind(email, nome || email.split("@")[0], await hashSenha(senha, salt), salt, casaId, Date.now()).run();
  await db.prepare("DELETE FROM sessoes WHERE email = ?").bind(email).run();
  return json({ ok: true }, 200, { "set-cookie": await criarSessao(db, email, request) });
}
