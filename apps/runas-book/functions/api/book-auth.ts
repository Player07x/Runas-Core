interface BookAuthEnv {
  RUNAS_BOOK_TOKEN?: string
  RUNAS_BOOK_PASSWORD?: string
  RUNAS_DM_BACKUP_TOKEN?: string
  RUNAS_DM_CAMPAIGN_PASSWORD?: string
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

export async function onRequestPost({ request, env }: { request: Request; env: BookAuthEnv }): Promise<Response> {
  try {
    const body = await request.json() as { token?: unknown; password?: unknown }
    const token = typeof body.token === "string" ? body.token : ""
    const password = typeof body.password === "string" ? body.password : ""
    const expectedToken = env.RUNAS_BOOK_TOKEN || env.RUNAS_DM_BACKUP_TOKEN || ""
    const expectedPassword = env.RUNAS_BOOK_PASSWORD || env.RUNAS_DM_CAMPAIGN_PASSWORD || ""
    if (!safeEqual(token, expectedToken) || !safeEqual(password, expectedPassword)) return Response.json({ authenticated: false }, { status: 401 })
    return Response.json({ authenticated: true }, { headers: { "Set-Cookie": "runas-book-session=1; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Strict" } })
  } catch {
    return Response.json({ authenticated: false }, { status: 400 })
  }
}

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const cookie = request.headers.get("Cookie") || ""
  return Response.json({ authenticated: /(?:^|;\s*)runas-book-session=1(?:;|$)/.test(cookie) })
}
