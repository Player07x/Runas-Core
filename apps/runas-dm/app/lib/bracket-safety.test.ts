import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Trava estrutural, no mesmo espírito de `navigation-safety.test.ts`.
 *
 * O nome de uma campanha, de uma tag ou de uma página pode começar com `[`
 * (`[O&C] Lion Heart pt. II`). Uma função que "limpava" listas YAML arrancava o
 * `[` inicial de qualquer texto, e o nome voltava do vault como `O&C] Lion
 * Heart pt. II`. Quem precisa distinguir lista de texto usa
 * `frontmatter-values.ts`; nenhum outro arquivo do app pode remover colchetes
 * das pontas de um valor.
 */
async function appSources(): Promise<Array<{ file: string; text: string }>> {
  const root = fileURLToPath(new URL("../", import.meta.url))
  const files = (await readdir(root, { recursive: true })).filter((file) => /\.(?:ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.includes("node_modules"))
  return Promise.all(files.map(async (file) => ({ file, text: await readFile(join(root, file), "utf8") })))
}

describe("colchetes nos nomes de campanha, tag e página", () => {
  it("nenhum arquivo do app arranca o `[` inicial nem o `]` final de um valor", async () => {
    const offenders = (await appSources()).filter(({ text }) => /\.replace\(\s*\/\^\\\[\//.test(text) || /\.replace\(\s*\/\\\]\$\//.test(text)).map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it("o importador do vault lê campanha e tags pelo módulo que separa lista de texto", async () => {
    const source = await readFile(fileURLToPath(new URL("./obsidian-sync.ts", import.meta.url)), "utf8")
    expect(source).toContain('from "./frontmatter-values"')
    expect(source).toContain("referenceList(frontmatter.campanha)")
    expect(source).toContain("tagList(frontmatter.tags)")
    expect(source).not.toContain("function stringArray")
  })
})
