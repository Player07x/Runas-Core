import { createHash } from "node:crypto"
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const distRoot = join(projectRoot, "dist")
const clientDir = join(distRoot, "client")
const serverDir = join(distRoot, "server")
const pagesDir = join(distRoot, "pages")
const workerModulesDir = join(pagesDir, "_worker")
const pagesDatabaseId = "afe0dde7-ffcd-4fe7-8cf1-dee50595e74f"

async function hashDirectory(root) {
  const hash = createHash("sha256")
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else {
        hash.update(relative(root, path).replaceAll("\\", "/"))
        hash.update(await readFile(path))
      }
    }
  }
  await visit(root)
  return hash.digest("hex").slice(0, 16)
}

const workerConfigPath = join(serverDir, "wrangler.json")
const workerConfig = JSON.parse(await readFile(workerConfigPath, "utf8"))
workerConfig.d1_databases = [
  ...(workerConfig.d1_databases ?? []).filter((database) => database.binding !== "DB"),
  {
    binding: "DB",
    database_name: "runas-dm-backups",
    database_id: pagesDatabaseId,
  },
]
await writeFile(workerConfigPath, `${JSON.stringify(workerConfig)}\n`, "utf8")

await rm(pagesDir, { force: true, recursive: true })
await mkdir(pagesDir, { recursive: true })
await cp(clientDir, pagesDir, { recursive: true })
await cp(serverDir, workerModulesDir, { recursive: true })

const buildId = (process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || await hashDirectory(clientDir)).slice(0, 16)
const serviceWorkerPath = join(pagesDir, "sw.js")
const serviceWorker = await readFile(serviceWorkerPath, "utf8")
if (!serviceWorker.includes("__RUNAS_DM_BUILD_ID__")) throw new Error("O service worker não contém o marcador de versão do build.")
await writeFile(serviceWorkerPath, serviceWorker.replaceAll("__RUNAS_DM_BUILD_ID__", buildId), "utf8")
// Pages receives bindings from the project-level wrangler.jsonc. The Vinext
// build emits its own Worker configuration with placeholder bindings, which
// must not be bundled as a second Pages configuration.
await rm(join(workerModulesDir, "wrangler.json"), { force: true })
await rm(workerConfigPath, { force: true })
await rm(join(projectRoot, ".wrangler", "deploy"), { force: true, recursive: true })

// IPv6 literals (loopback ::1) are not supported by the host-source grammar
// of CSP in any browser; including that entry only produced an "invalid
// source" console warning and never actually allowed a connection. ::1
// remains a valid API host for local dev (vinext dev applies no CSP), but it
// can never work against this production policy.
await writeFile(
  join(pagesDir, "_worker.js"),
  `import application from "./_worker/index.js";

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; connect-src 'self' https://127.0.0.1:* https://localhost:*; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data: blob:; manifest-src 'self'; media-src 'self' data: blob:; object-src 'none'; script-src 'self' 'unsafe-inline'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; upgrade-insecure-requests",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
};

export default {
  async fetch(request, env, context) {
    const response = await application.fetch(request, env, context);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
`,
  "utf8",
)

const existingIgnore = await readFile(join(clientDir, ".assetsignore"), "utf8")
await writeFile(
  join(pagesDir, ".assetsignore"),
  `${existingIgnore.trim()}\n_worker/**\n`,
  "utf8",
)

await writeFile(
  join(pagesDir, "_routes.json"),
  `${JSON.stringify({
    version: 1,
    include: ["/*"],
    exclude: [
      "/_next/static/*",
      "/favicon.svg",
      "/icon-192.png",
      "/icon-512.png",
      "/sw.js",
    ],
  }, null, 2)}\n`,
  "utf8",
)

console.log(`Cloudflare Pages output prepared at ${pagesDir}`)
