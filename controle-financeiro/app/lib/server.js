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
  return { email: s.email, nome: s.nome, casa: s.casa, token: m[1] };
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
  return { id: c.id, dono: c.dono, membros, ia: c.ia !== 0, uso: JSON.parse(c.uso || "{}"), nomes };
}

export async function casaDoEmail(db, email) {
  const r = await db.prepare("SELECT id, membros FROM casas WHERE membros LIKE ?").bind(`%"${email.replace(/[%_"]/g, "")}"%`).all();
  return (r.results || []).find((c) => JSON.parse(c.membros || "[]").includes(email)) || null;
}

export const permitidosEnv = (env) => String(env.EMAILS_PERMITIDOS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
