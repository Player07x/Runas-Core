import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("Runas DM production navigation contract", () => {
  it("uses document navigation instead of Vinext RSC transitions", async () => {
    const source = await readFile(new URL("./knowledge-portal.tsx", import.meta.url), "utf8")
    expect(source).toContain("Vinext beta's RSC router is not reliable")
    expect(source).not.toContain('from "next/link"')
    expect(source).not.toContain("useRouter")
    expect(source).toContain('<a href="/?view=encounter">')
    expect(source).toContain('<a className={area === "campaigns" ? "active" : ""} href="/campaigns">')
    expect(source).toContain('<a className={area === "wiki" ? "active" : ""} href="/wiki">')
  })

  it("opens Campaigns and Wiki without a login; the token only enables the cloud backup", async () => {
    const source = await readFile(new URL("./knowledge-portal.tsx", import.meta.url), "utf8")
    expect(source).not.toContain("/api/campaign-auth")
    expect(source).not.toContain("AccessScreen")
    // O envio passa pelo cliente versionado, que é quem monta o cabeçalho com o token.
    expect(source).toContain('from "../lib/cloud-backup"')
    const client = await readFile(new URL("../lib/cloud-backup.ts", import.meta.url), "utf8")
    expect(client).toContain("authorization: `Bearer ${token}`")
  })

  it("never writes to the cloud without going through the versioned client", async () => {
    // Foi um PUT direto, sem versão-base, que deixou um computador novo apagar um backup bom.
    for (const file of ["./knowledge-portal.tsx", "./dm-dashboard.tsx"]) {
      const source = await readFile(new URL(file, import.meta.url), "utf8")
      expect(source, file).not.toContain('method: "PUT"')
      expect(source, file).not.toContain('fetch("/api/')
      expect(source, file).toContain("putCloudBackup")
    }
  })

  it("versions every deployed cache and never stores RSC payloads", async () => {
    const source = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8")
    expect(source).toContain("__RUNAS_DM_BUILD_ID__")
    expect(source).toContain("isRouterPayload(request, url)")
    expect(source).toContain('url.searchParams.has("_rsc")')
  })
})
