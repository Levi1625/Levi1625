// POST /api/casa {acao: "add" | "remove" | "novaSenha" | "papel" | "ia" | "whats" | "testarWhats", email?, valor?}
// Só o dono da casa (quem criou) pode mexer nas pessoas e nos ajustes. Ninguém tira o dono.
import { json, banco, sessao, lerCasa, normEmail, mesmaOrigem, enviarWhats, PAPEIS, casasDoEmail } from "../../lib/server.js";
export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "Origem inválida." }, 403);
  const s = await sessao(request, env); if (!s) return json({ erro: "Entre no app." }, 401); if (s.pausado) return json({ erro: "Acesso pausado." }, 403);
  const db = await banco(env), b = await request.json().catch(() => ({}));
  if (s.papel !== "dono") return json({ erro: "Só o dono do controle pode mudar isso." }, 403);
  const c = await lerCasa(db, s.casa); let membros = c.membros;
  const papeis = Object.fromEntries(Object.entries(c.papeis).filter(([e, p]) => PAPEIS.includes(p)));
  const salvarPapeis = () => db.prepare("UPDATE casas SET papeis = ? WHERE id = ?").bind(JSON.stringify(papeis), s.casa).run();
  if (b.acao === "papel") {
    const e = normEmail(b.email); if (!membros.includes(e) || normEmail(c.dono) === e) return json({ erro: "Pessoa inválida." }, 400);
    if (!PAPEIS.includes(b.valor)) return json({ erro: "Escolha inválida." }, 400);
    papeis[e] = b.valor; await salvarPapeis(); await db.prepare("UPDATE casas SET upd = ? WHERE id = ?").bind(Date.now(), s.casa).run();
    return json({ ok: true, casa: await lerCasa(db, s.casa) });
  } else if (b.acao === "add") {
    const e = normEmail(b.email); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ erro: "E-mail inválido." }, 400);
    // pode já usar outro controle: passa a ter os dois e troca no menu
    if (!membros.includes(e)) membros = [...membros, e];
    papeis[e] = PAPEIS.includes(b.papel) ? b.papel : "ve"; await salvarPapeis();
  } else if (b.acao === "remove") {
    const e = normEmail(b.email); if (e === s.email || e === normEmail(c.dono)) return json({ erro: "O dono do controle não pode ser tirado." }, 400);
    delete papeis[e]; await salvarPapeis();
    membros = membros.filter((x) => x !== e);
    const outra = (await casasDoEmail(db, e)).find((x) => x.id !== s.casa);   // tem outro controle: continua com a conta, só sai deste
    if (outra) await db.batch([db.prepare("DELETE FROM sessoes WHERE email = ? AND casa = ?").bind(e, s.casa), db.prepare("UPDATE usuarios SET casa = ? WHERE email = ? AND casa = ?").bind(outra.id, e, s.casa)]);
    else await db.batch([db.prepare("DELETE FROM sessoes WHERE email = ?").bind(e), db.prepare("DELETE FROM usuarios WHERE email = ?").bind(e)]);
  } else if (b.acao === "novaSenha") {
    // esqueceu a senha: o dono apaga só a senha e os acessos abertos dela; os dados continuam e ela cria outra em "Primeiro acesso"
    const e = normEmail(b.email); if (!membros.includes(e) || e === normEmail(c.dono)) return json({ erro: "Pessoa inválida." }, 400);
    await db.batch([db.prepare("UPDATE usuarios SET hash = NULL, falhas = 0, bloqueio = 0 WHERE email = ?").bind(e), db.prepare("DELETE FROM sessoes WHERE email = ?").bind(e)]);
    return json({ ok: true, casa: await lerCasa(db, s.casa) });
  } else if (b.acao === "ia") {
    await db.prepare("UPDATE casas SET ia = ?, upd = ? WHERE id = ?").bind(b.valor ? 1 : 0, Date.now(), s.casa).run();
    return json({ ok: true, casa: await lerCasa(db, s.casa) });
  } else if (b.acao === "whats") {
    const numero = String(b.numero || "").replace(/\D/g, "");
    if (numero && (numero.length < 12 || numero.length > 13)) return json({ erro: "Número inválido. Use o formato que o CallMeBot mostrou (ex.: 5511912345678)." }, 400);
    const sets = ["whatsapp = ?", "lembretes = ?", "upd = ?"], vals = [numero, b.lembretes === false ? 0 : 1, Date.now()];
    if (b.chave !== undefined && String(b.chave).trim() !== "") { sets.push("callmebot = ?"); vals.push(String(b.chave).trim().slice(0, 40)); }
    if (b.limparChave) sets.push("callmebot = NULL");
    await db.prepare(`UPDATE casas SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, s.casa).run();
    return json({ ok: true, casa: await lerCasa(db, s.casa) });
  } else if (b.acao === "testarWhats") {
    const c2 = await db.prepare("SELECT whatsapp, callmebot FROM casas WHERE id = ?").bind(s.casa).first();
    if (!c2 || !c2.whatsapp || !c2.callmebot) return json({ erro: "Salve o número e a chave do CallMeBot primeiro." }, 400);
    const r = await enviarWhats(c2.whatsapp, c2.callmebot, "✅ Bolso em Dia: teste de lembrete. Daqui pra frente, os avisos do dia chegam aqui toda manhã.");
    return json(r.ok ? { ok: true } : { erro: "O CallMeBot não aceitou: " + r.resposta }, r.ok ? 200 : 502);
  } else return json({ erro: "Ação inválida." }, 400);
  await db.prepare("UPDATE casas SET membros = ?, upd = ? WHERE id = ?").bind(JSON.stringify(membros), Date.now(), s.casa).run();
  return json({ ok: true, casa: await lerCasa(db, s.casa) });
}
