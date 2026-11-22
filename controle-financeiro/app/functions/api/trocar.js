// POST /api/trocar {id}: abre outro controle de que a pessoa faz parte (ex.: o da família, só para ver, e o da casa da mãe, como dona).
// Vale para este aparelho; os outros aparelhos continuam no controle em que estavam. Novas entradas abrem no último usado.
import { json, banco, sessao, mesmaOrigem, casasDoEmail } from "../../lib/server.js";
export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401);
  const db = await banco(env), b = await request.json().catch(() => ({}));
  const alvo = (await casasDoEmail(db, s.email)).find((c) => c.id === b.id);
  if (!alvo) return json({ erro: "Você não faz parte desse controle." }, 403);
  if (alvo.pausado) return json({ erro: "Esse controle está pausado." }, 403);
  const u = await db.prepare("SELECT casa FROM usuarios WHERE email = ?").bind(s.email).first();
  await db.batch([
    db.prepare("UPDATE sessoes SET casa = ? WHERE email = ? AND casa IS NULL AND token <> ?").bind((u && u.casa) || s.casa, s.email, s.token),
    db.prepare("UPDATE sessoes SET casa = ? WHERE token = ?").bind(alvo.id, s.token),
    db.prepare("UPDATE usuarios SET casa = ? WHERE email = ?").bind(alvo.id, s.email),
  ]);
  return json({ ok: true, casa: alvo });
}
