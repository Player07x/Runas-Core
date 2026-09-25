import { cloudflareBackupHandlers } from "../../lib/server/cloudflare-backup-handlers"

// Campanhas e Wiki abrem sem login; o token de backup só libera a cópia na
// nuvem. Versionado, com concorrência otimista e trava de encolhimento: ver
// `lib/server/backup-routes.ts`. O preview em localhost nunca toca o D1.
const handlers = cloudflareBackupHandlers()

export async function GET(request: Request) {
  return handlers.get(request, "knowledge")
}

export async function PUT(request: Request) {
  return handlers.put(request, "knowledge")
}
