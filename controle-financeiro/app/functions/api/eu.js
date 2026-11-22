// GET /api/eu: quem está logado e os dados da casa.
import { json, banco, sessao, lerCasa, adminEmail, limiteIA, repararDono, casasDoEmail } from "../../lib/server.js";
export async function onRequestGet({ request, env }) {
  let s;
  try { s = await sessao(request, env); } catch (e) { return json({ erro: e.message === "sem-banco" ? "Falta ligar o banco D1 (nome DB) no Cloudflare." : "Erro no servidor." }, 503); }
  if (!s) return json({ erro: "Entre no app." }, 401);
  if (s.papel !== "dono") { const antes = s.casa; const alvo = await repararDono(await banco(env), s.email); if (alvo && alvo !== antes) s = await sessao(request, env); }
  const db = await banco(env);
  let casas = await casasDoEmail(db, s.email);
  if (s.pausado) {   // o controle aberto foi pausado: abre outro que a pessoa tenha
    const outra = casas.find((c) => c.id !== s.casa && !c.pausado);
    if (!outra) return json({ erro: "Seu acesso está pausado. Fale com quem te passou o app.", pausado: true }, 403);
    await db.batch([db.prepare("UPDATE sessoes SET casa = ? WHERE token = ?").bind(outra.id, s.token), db.prepare("UPDATE usuarios SET casa = ? WHERE email = ?").bind(outra.id, s.email)]);
    s = await sessao(request, env); casas = await casasDoEmail(db, s.email);
  }
  const casa = await lerCasa(db, s.casa), lim = limiteIA(casa, env);
  return json({ email: s.email, nome: s.nome, admin: s.email === adminEmail(env), papel: s.papel, casa: { ...casa, iaLimite: lim === Infinity ? null : lim }, casas: casas.map((c) => ({ ...c, ativa: c.id === s.casa })) });
}
