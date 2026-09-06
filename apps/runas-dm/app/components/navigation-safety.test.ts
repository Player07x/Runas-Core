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

  it("does not render the login form while a recent session is being restored", async () => {
    const source = await readFile(new URL("./knowledge-portal.tsx", import.meta.url), "utf8")
    expect(source).toContain('if (auth === "checking") return <SessionCheckingScreen')
    expect(source).toContain('if (auth === "locked") return <AccessScreen')
  })

  it("versions every deployed cache and never stores RSC payloads", async () => {
    const source = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8")
    expect(source).toContain("__RUNAS_DM_BUILD_ID__")
    expect(source).toContain("isRouterPayload(request, url)")
    expect(source).toContain('url.searchParams.has("_rsc")')
  })

  it("keeps the local vault as the safe default for new Obsidian setups", async () => {
    const source = await readFile(new URL("./obsidian-dialog.tsx", import.meta.url), "utf8")
    expect(source).toContain('mode: value?.mode === "api" ? "api" : "folder"')
  })
})
