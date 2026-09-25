import { cloudflareBackupHandlers } from "../../lib/server/cloudflare-backup-handlers"

// Backup do Bestiário (fichas + tabelas de maestria). Versionado, com
// concorrência otimista e trava de encolhimento: ver `lib/server/backup-routes.ts`.
const handlers = cloudflareBackupHandlers()

export async function GET(request: Request) {
  return handlers.get(request, "bestiary")
}

export async function PUT(request: Request) {
  return handlers.put(request, "bestiary")
}
