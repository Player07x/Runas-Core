import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Injeta no service worker a lista de todo o JavaScript e CSS do build.
 *
 * O Runas Tools carrega a ficha e as calculadoras por `next/dynamic`. Sem
 * esses arquivos no cache, abrir a ficha sem rede faz o `import()` falhar e o
 * Next derruba o aplicativo inteiro na página "This page couldn't load".
 * Precachear no `install` garante que o primeiro acesso offline funcione,
 * mesmo que o usuário nunca tenha aberto a ficha online.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "out")
const swPath = join(outDir, "sw.js")

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) return collect(absolute)
    return /\.(js|css)$/.test(entry.name) ? [absolute] : []
  }))
  return files.flat()
}

const staticDir = join(outDir, "_next", "static")
const assets = (await collect(staticDir))
  .map((file) => `./${relative(outDir, file).split(/[\\/]/).join("/")}`)
  .sort()

const source = await readFile(swPath, "utf8")
const buildId = createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 12)
const injected = source
  .replace("const PRECACHE_ASSETS = []", `const PRECACHE_ASSETS = ${JSON.stringify(assets)}`)
  .replace('const BUILD_ID = "__BUILD_ID__"', `const BUILD_ID = ${JSON.stringify(buildId)}`)

if (injected === source) throw new Error("sw.js não contém os marcadores PRECACHE_ASSETS/__BUILD_ID__.")

await writeFile(swPath, injected)
console.log(`sw.js: ${assets.length} arquivos precacheados (build ${buildId}).`)
