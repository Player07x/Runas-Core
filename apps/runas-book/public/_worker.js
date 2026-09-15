function safeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

function authResponse(request, env) {
  const cookie = request.headers.get("Cookie") || ""
  return Response.json({ authenticated: /(?:^|;\s*)runas-book-session=1(?:;|$)/.test(cookie) })
}

async function loginResponse(request, env) {
  try {
    const body = await request.json()
    const token = typeof body?.token === "string" ? body.token : ""
    const password = typeof body?.password === "string" ? body.password : ""
    const expectedToken = env.RUNAS_BOOK_TOKEN || env.RUNAS_DM_BACKUP_TOKEN || ""
    const expectedPassword = env.RUNAS_BOOK_PASSWORD || env.RUNAS_DM_CAMPAIGN_PASSWORD || ""
    if (!safeEqual(token, expectedToken) || !safeEqual(password, expectedPassword)) return Response.json({ authenticated: false }, { status: 401 })
    return Response.json({ authenticated: true }, {
      headers: { "Set-Cookie": "runas-book-session=1; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Strict" },
    })
  } catch {
    return Response.json({ authenticated: false }, { status: 400 })
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === "/api/book-auth") {
      if (request.method === "GET") return authResponse(request, env)
      if (request.method === "POST") return loginResponse(request, env)
      return new Response("Method Not Allowed", { status: 405 })
    }
    return env.ASSETS.fetch(request)
  },
}
