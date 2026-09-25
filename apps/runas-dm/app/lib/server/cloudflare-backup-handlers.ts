import { createBackupHandlers } from "./backup-routes"
import { createD1BackupStore } from "./d1-backup-store"
import { verifyBackupBearer } from "./secret-verification"

/** Liga os manipuladores de backup ao Cloudflare: token do Worker e binding D1 `DB`. */
export function cloudflareBackupHandlers() {
  return createBackupHandlers({
    verifyBearer: verifyBackupBearer,
    async openStore() {
      const { env } = await import("cloudflare:workers")
      return env.DB ? createD1BackupStore(env.DB) : null
    },
    now: () => Date.now(),
  })
}
