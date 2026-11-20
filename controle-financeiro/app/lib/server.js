// Funções do servidor (Cloudflare Pages Functions + banco D1). Sem Google/Firebase.
// O banco D1 fica ligado ao projeto com o nome DB (Settings → Bindings → D1).

export const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

export const COLECOES = ["lanc", "fixos", "cartoes", "emprestimos", "investimentos", "objetivos", "config"];
const SESSAO_DIAS = 180;

let pronto = false;
export async function banco(env) {
  if (!env.DB) throw new Error("sem-banco");
  if (!pronto) {
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS usuarios (email TEXT PRIMARY KEY, nome TEXT, hash TEXT, salt TEXT, casa TEXT, criado INTEGER, falhas INTEGER DEFAULT 0, bloqueio INTEGER DEFAULT 0)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS sessoes (token TEXT PRIMARY KEY, email TEXT, expira INTEGER)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS casas (id TEXT PRIMARY KEY, dono TEXT, membros TEXT, ia INTEGER DEFAULT 1, uso TEXT DEFAULT '{}', upd INTEGER DEFAULT 0)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS docs (casa TEXT, path TEXT, col TEXT, data TEXT, upd INTEGER, del INTEGER DEFAULT 0, PRIMARY KEY (casa, path))"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS docs_upd ON docs (casa, upd)"),
    ]);
    // Colunas novas (o app cresce sem perder dados): WhatsApp de cada casa, pausa e limite de IA.
    for (const sql of ["ALTER TABLE casas ADD COLUMN whatsapp TEXT", "ALTER TABLE casas ADD COLUMN callmebot TEXT", "ALTER TABLE casas ADD COLUMN lembretes INTEGER DEFAULT 1",
      "ALTER TABLE casas ADD COLUMN pausado INTEGER DEFAULT 0", "ALTER TABLE casas ADD COLUMN papeis TEXT", "ALTER TABLE casas ADD COLUMN ia_limite REAL", "ALTER TABLE casas ADD COLUMN cliente TEXT",
      "CREATE TABLE IF NOT EXISTS ia_log (id INTEGER PRIMARY KEY AUTOINCREMENT, casa TEXT, email TEXT, quando INTEGER, tipo TEXT, usd REAL, modelo TEXT)",
      "CREATE INDEX IF NOT EXISTS ia_log_casa ON ia_log (casa, quando)",
      "CREATE TABLE IF NOT EXISTS ajustes_app (chave TEXT PRIMARY KEY, valor TEXT)"]) {
      try { await env.DB.prepare(sql).run(); } catch (_) { /* coluna já existe */ }
    }
    pronto = true;
  }
  return env.DB;
}

export const normEmail = (e) => String(e || "").trim().toLowerCase();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const aleatorio = (n = 24) => hex(crypto.getRandomValues(new Uint8Array(n)));

export async function hashSenha(senha, salt) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 20000 }, chave, 256);
  return hex(bits);
}
const iguais = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
export const conferirSenha = async (senha, u) => iguais(await hashSenha(senha, u.salt), u.hash);

export function cookieSessao(token, request) {
  const seguro = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `bolso_s=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? SESSAO_DIAS * 86400 : 0}${seguro}`;
}
export async function criarSessao(db, email, request) {
  const token = aleatorio(32);
  await db.prepare("INSERT INTO sessoes (token, email, expira) VALUES (?, ?, ?)").bind(token, email, Date.now() + SESSAO_DIAS * 86400e3).run();
  return cookieSessao(token, request);
}

// Pedidos que mudam dados precisam vir do próprio app (protege contra sites de terceiros).
export function mesmaOrigem(request) {
  if (request.method === "GET") return true;
  const o = request.headers.get("origin");
  return !o || o === new URL(request.url).origin;
}

// Quem está logado (ou null).
export async function sessao(request, env) {
  const db = await banco(env);
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)bolso_s=([a-f0-9]{64})/);
  if (!m) return null;
  const s = await db.prepare("SELECT s.email, s.expira, u.nome, u.casa FROM sessoes s JOIN usuarios u ON u.email = s.email WHERE s.token = ?").bind(m[1]).first();
  if (!s || s.expira < Date.now() || !s.casa) return null;
  const c = await db.prepare("SELECT pausado, dono, papeis FROM casas WHERE id = ?").bind(s.casa).first();
  const papel = s.email === adminEmail(env) && c && normEmail(c.dono) === s.email ? "dono" : papelDe(c, s.email);
  return { email: s.email, nome: s.nome, casa: s.casa, token: m[1], pausado: !!(c && c.pausado), papel };
}

// Papel de cada pessoa na casa: "dono" (quem criou: manda em tudo e ninguém tira), "edita" (lança e corrige) ou "ve" (só vê e pergunta para a IA).
export const PAPEIS = ["edita", "ve"];
export function papelDe(c, email) {
  if (!c) return "ve";
  if (normEmail(c.dono) === normEmail(email)) return "dono";
  const p = (typeof c.papeis === "string" ? JSON.parse(c.papeis || "{}") : c.papeis || {})[normEmail(email)];
  return PAPEIS.includes(p) ? p : "ve";
}

// Se o dono foi tirado da própria casa (ou criou uma casa vazia por engano), devolve o dono para a casa com os dados dele.
export async function repararDono(db, email) {
  email = normEmail(email);
  const minhas = (await db.prepare("SELECT id, membros FROM casas WHERE dono = ?").bind(email).all()).results || [];
  if (!minhas.length) return null;
  const conta = async (id) => +((await db.prepare("SELECT COUNT(*) AS n FROM docs WHERE casa = ? AND del = 0").bind(id).first()) || {}).n || 0;
  const u = await db.prepare("SELECT casa FROM usuarios WHERE email = ?").bind(email).first();
  const n = {}; for (const c of minhas) n[c.id] = await conta(c.id);
  let alvo = minhas.reduce((a, c) => (n[c.id] > n[a.id] ? c : a), minhas[0]).id;
  if (u && u.casa && u.casa !== alvo) { const nAtual = u.casa in n ? n[u.casa] : await conta(u.casa); if (nAtual >= n[alvo]) alvo = u.casa; }
  for (const c of minhas) {
    const m = JSON.parse(c.membros || "[]");
    if (c.id === alvo) { if (!m.includes(email)) await db.prepare("UPDATE casas SET membros = ?, upd = ? WHERE id = ?").bind(JSON.stringify([email, ...m]), Date.now(), c.id).run(); }
    else if (n[c.id] === 0 && m.every((x) => x === email)) await db.prepare("DELETE FROM casas WHERE id = ?").bind(c.id).run(); // casa vazia criada por engano
  }
  if (u && u.casa !== alvo) await db.prepare("UPDATE usuarios SET casa = ? WHERE email = ?").bind(alvo, email).run();
  return alvo;
}

export async function lerCasa(db, id) {
  const c = await db.prepare("SELECT * FROM casas WHERE id = ?").bind(id).first();
  if (!c) return null;
  const membros = JSON.parse(c.membros || "[]");
  const nomes = {};
  if (membros.length) {
    const r = await db.prepare(`SELECT email, nome FROM usuarios WHERE email IN (${membros.map(() => "?").join(",")})`).bind(...membros).all();
    for (const u of r.results || []) nomes[u.email] = u.nome || u.email.split("@")[0];
  }
  return { id: c.id, dono: c.dono, membros, papeis: Object.fromEntries(membros.map((e) => [e, papelDe(c, e)])), ia: c.ia !== 0, uso: JSON.parse(c.uso || "{}"), nomes,
    whatsapp: c.whatsapp || "", temChaveWhats: !!c.callmebot, lembretes: c.lembretes !== 0, pausado: !!c.pausado, iaLimite: c.ia_limite == null ? null : +c.ia_limite, cliente: c.cliente || "" };
}

export async function casaDoEmail(db, email) {
  const r = await db.prepare("SELECT id, membros FROM casas WHERE membros LIKE ?").bind(`%"${email.replace(/[%_"]/g, "")}"%`).all();
  return (r.results || []).find((c) => JSON.parse(c.membros || "[]").includes(email)) || null;
}

// Quem administra o app (você): ADMIN_EMAIL, ou o primeiro e-mail de EMAILS_PERMITIDOS.
export const adminEmail = (env) => normEmail(env.ADMIN_EMAIL || String(env.EMAILS_PERMITIDOS || "").split(/[,;\s]+/).filter(Boolean)[0] || "");
export const usoDoMes = (casa) => { const u = (casa.uso || {})[new Date().toISOString().slice(0, 7)] || {}; return +u.usd || 0; };
// Limite de IA por mês (US$): o da casa; se não tiver, IA_LIMITE_PADRAO (0,50) para clientes; sem limite para a sua casa.
export const limiteIA = (casa, env) => casa.iaLimite != null ? casa.iaLimite : (normEmail(casa.dono) === adminEmail(env) ? Infinity : +(env.IA_LIMITE_PADRAO ?? 0.5));
export async function enviarWhats(numero, chave, texto) {
  const partes = []; let atual = "";
  for (const linha of String(texto).split("\n")) { if ((atual + "\n" + linha).length > 1400) { partes.push(atual); atual = linha; } else atual = atual ? atual + "\n" + linha : linha; }
  if (atual) partes.push(atual);
  let ok = false, resposta = "";
  for (const [i, p] of partes.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 5000));
    const q = new URLSearchParams({ phone: "+" + String(numero).replace(/\D/g, ""), text: p, apikey: String(chave) });
    const r = await fetch("https://api.callmebot.com/whatsapp.php?" + q.toString());
    resposta = (await r.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    ok = r.ok && !/error|invalid|not activated/i.test(resposta);
  }
  return { ok, resposta };
}

export const permitidosEnv = (env) => String(env.EMAILS_PERMITIDOS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
