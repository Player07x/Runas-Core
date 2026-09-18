import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { getDb } from "../../../db"
import { knowledgeSnapshots } from "../../../db/schema"
import { normalizeKnowledgeWorkspace } from "../../lib/knowledge-model"
import { verifyBackupBearer } from "../../lib/server/secret-verification"

const PRIVATE_SLOT = "primary"
const MAX_PAYLOAD_BYTES = 8_000_000
const noStoreHeaders = { "Cache-Control": "no-store" }

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  return hostname === "localhost" || hostname === "127.0.0.1"
}

// Campanhas e Wiki abrem sem login; o token de backup só libera a cópia na nuvem.
export async function GET(request: Request) {
  // O preview local permanece offline-first e nunca toca o D1.
  if (isLocalRequest(request)) return NextResponse.json({ state: null, updatedAt: null, localOnly: true }, { headers: noStoreHeaders })
  if (!await verifyBackupBearer(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: noStoreHeaders })
  const db = await getDb()
  const [snapshot] = await db.select().from(knowledgeSnapshots).where(eq(knowledgeSnapshots.id, PRIVATE_SLOT)).limit(1)
  if (!snapshot) return NextResponse.json({ state: null, updatedAt: null }, { headers: noStoreHeaders })
  return NextResponse.json({ state: normalizeKnowledgeWorkspace(JSON.parse(snapshot.payload)), updatedAt: snapshot.updatedAt }, { headers: noStoreHeaders })
}

export async function PUT(request: Request) {
  if (!isLocalRequest(request) && !await verifyBackupBearer(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: noStoreHeaders })
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_PAYLOAD_BYTES) return NextResponse.json({ error: "Arquivo de campanha muito grande." }, { status: 413, headers: noStoreHeaders })
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_PAYLOAD_BYTES) return NextResponse.json({ error: "Arquivo de campanha muito grande." }, { status: 413, headers: noStoreHeaders })
  let state: unknown
  try {
    state = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Arquivo de campanha inválido." }, { status: 400, headers: noStoreHeaders })
  }
  const normalized = normalizeKnowledgeWorkspace(state)
  const updatedAt = Date.now()
  const payload = JSON.stringify({ ...normalized, updatedAt })
  if (isLocalRequest(request)) return NextResponse.json({ ok: true, updatedAt, localOnly: true }, { headers: noStoreHeaders })
  const db = await getDb()
  await db.insert(knowledgeSnapshots).values({ id: PRIVATE_SLOT, payload, updatedAt }).onConflictDoUpdate({
    target: knowledgeSnapshots.id,
    set: { payload, updatedAt },
  })
  return NextResponse.json({ ok: true, updatedAt }, { headers: noStoreHeaders })
}
