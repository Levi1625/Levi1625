// POST /api/casa {acao: "add" | "remove" | "ia", email?, valor?}
import { json, banco, sessao, lerCasa, normEmail, mesmaOrigem } from "../../lib/server.js";
export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401);
  const db = await banco(env), b = await request.json().catch(() => ({}));
  const c = await lerCasa(db, s.casa); let membros = c.membros;
  if (b.acao === "add") {
    const e = normEmail(b.email); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ erro: "E-mail inválido." }, 400);
    const outra = await db.prepare("SELECT casa FROM usuarios WHERE email = ? AND hash IS NOT NULL").bind(e).first();
    if (outra && outra.casa !== s.casa) return json({ erro: "Esse e-mail já usa outro controle." }, 409);
    if (!membros.includes(e)) membros = [...membros, e];
  } else if (b.acao === "remove") {
    const e = normEmail(b.email); if (e === s.email) return json({ erro: "Você não pode tirar a si mesmo." }, 400);
    membros = membros.filter((x) => x !== e);
    await db.batch([db.prepare("DELETE FROM sessoes WHERE email = ?").bind(e), db.prepare("DELETE FROM usuarios WHERE email = ?").bind(e)]);
  } else if (b.acao === "ia") {
    await db.prepare("UPDATE casas SET ia = ?, upd = ? WHERE id = ?").bind(b.valor ? 1 : 0, Date.now(), s.casa).run();
    return json({ ok: true, casa: await lerCasa(db, s.casa) });
  } else return json({ erro: "Ação inválida." }, 400);
  await db.prepare("UPDATE casas SET membros = ?, upd = ? WHERE id = ?").bind(JSON.stringify(membros), Date.now(), s.casa).run();
  return json({ ok: true, casa: await lerCasa(db, s.casa) });
}
