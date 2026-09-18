function safeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

const bookToken = (env) => env.RUNAS_BOOK_TOKEN || env.RUNAS_DM_BACKUP_TOKEN || ""

// A sessão é uma assinatura HMAC derivada do token: só o servidor consegue
// produzi-la, então o cookie não pode ser forjado. Trocar o token encerra as sessões.
async function sessionValue(env) {
  const secret = bookToken(env)
  if (!secret) return ""
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("runas-book-session:v1"))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function hasSession(request, env) {
  const match = /(?:^|;\s*)runas-book-session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get("Cookie") || "")
  const expected = await sessionValue(env)
  return Boolean(match && expected && safeEqual(match[1], expected))
}

async function authResponse(request, env) {
  return Response.json({ authenticated: await hasSession(request, env) })
}

async function loginResponse(request, env) {
  try {
    const body = await request.json()
    const token = typeof body?.token === "string" ? body.token : ""
    if (!safeEqual(token, bookToken(env))) return Response.json({ authenticated: false }, { status: 401 })
    return Response.json({ authenticated: true }, {
      headers: { "Set-Cookie": `runas-book-session=${await sessionValue(env)}; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Strict` },
    })
  } catch {
    return Response.json({ authenticated: false }, { status: 400 })
  }
}

const CHUNK_SIZE = 900_000

async function ensureTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS book_workspace_chunks (idx INTEGER PRIMARY KEY, data BLOB NOT NULL, updated_at INTEGER NOT NULL)").run()
}

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
  return new Response(stream).text()
}

// O livro publicado fica no D1 (comprimido e em blocos) para que todos os leitores vejam a mesma versão.
async function readWorkspace(env) {
  if (!env.DB) return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  await ensureTable(env.DB)
  const { results } = await env.DB.prepare("SELECT data, updated_at FROM book_workspace_chunks ORDER BY idx").all()
  if (!results.length) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
  const parts = results.map((row) => new Uint8Array(row.data))
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  return new Response(await gunzip(bytes), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

async function writeWorkspace(request, env) {
  if (!(await hasSession(request, env))) return Response.json({ error: "unauthorized" }, { status: 401 })
  if (!env.DB) return Response.json({ error: "unavailable" }, { status: 503 })
  const text = await request.text()
  let workspace
  try { workspace = JSON.parse(text) } catch { return Response.json({ error: "invalid" }, { status: 400 }) }
  if (!workspace || !Array.isArray(workspace.books) || typeof workspace.updatedAt !== "number") return Response.json({ error: "invalid" }, { status: 400 })
  await ensureTable(env.DB)
  const bytes = await gzip(text)
  const statements = [env.DB.prepare("DELETE FROM book_workspace_chunks")]
  for (let index = 0; index * CHUNK_SIZE < bytes.length; index += 1) {
    statements.push(env.DB.prepare("INSERT INTO book_workspace_chunks (idx, data, updated_at) VALUES (?, ?, ?)")
      .bind(index, bytes.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE), workspace.updatedAt))
  }
  await env.DB.batch(statements)
  return Response.json({ saved: true, updatedAt: workspace.updatedAt })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === "/api/book-auth") {
      if (request.method === "GET") return authResponse(request, env)
      if (request.method === "POST") return loginResponse(request, env)
      return new Response("Method Not Allowed", { status: 405 })
    }
    if (url.pathname === "/api/book") {
      if (request.method === "GET") return readWorkspace(env)
      if (request.method === "PUT") return writeWorkspace(request, env)
      return new Response("Method Not Allowed", { status: 405 })
    }
    return env.ASSETS.fetch(request)
  },
}
