import { VAULT_BESTIARY_CHECKPOINT_POLICY, VAULT_KNOWLEDGE_CHECKPOINT_POLICY, checkpointsToDrop, hashText, isShrink, parseSnapshotStats, shouldCheckpoint, type CheckpointPolicy, type SnapshotStats } from "./snapshot-policy"
import { parseUiPreferences, type UiPreferences } from "./ui-preferences"

/**
 * Arquivos de dados do Runas DM dentro do vault do Obsidian.
 *
 * As notas `.md` guardam o texto das páginas; tudo o mais — campanhas (estilo,
 * organizador, vínculos), tags com ícone e cor, eras com datas, exclusões, o
 * bestiário e as preferências de interface — só existia no navegador e no
 * D1. Restaurar apenas o vault num computador novo perdia exatamente isso.
 * Estes arquivos fecham o buraco: ficam numa pasta visível (`Runas DM/`), entram
 * em qualquer cópia do vault e são lidos de volta ao conectá-lo.
 *
 * Regras que este módulo garante (todas com teste):
 * - **nunca sobrescreve** um arquivo que este navegador não conhece (outro
 *   computador, cópia do vault, edição à mão): o usuário decide;
 * - **nunca grava** um dispositivo virgem (sem dado algum do mestre);
 * - recusa gravação que encolhe demais o que já existe, salvo confirmação;
 * - guarda a versão anterior (checkpoint) de tempos em tempos e sempre antes de
 *   uma sobrescrita forçada;
 * - só reescreve quando o conteúdo mudou (hash), sem reler o arquivo inteiro.
 */

export type VaultDataKind = "knowledge" | "bestiary"

export const VAULT_DATA_FOLDER = "Runas DM"
export const VAULT_VERSIONS_FOLDER = "Runas DM/versoes"
export const VAULT_README_PATH = "Runas DM/LEIA-ME.md"
export const VAULT_DATA_FILES: Record<VaultDataKind, string> = {
  knowledge: "Runas DM/wiki-e-campanhas.json",
  bestiary: "Runas DM/bestiario.json",
}
export const VAULT_DATA_FORMAT = "runas-dm-vault-data"
export const VAULT_DATA_VERSION = 1

const VERSION_PREFIX: Record<VaultDataKind, string> = { knowledge: "wiki-e-campanhas", bestiary: "bestiario" }
const CHECKPOINT_POLICY: Record<VaultDataKind, CheckpointPolicy> = { knowledge: VAULT_KNOWLEDGE_CHECKPOINT_POLICY, bestiary: VAULT_BESTIARY_CHECKPOINT_POLICY }
/** O cabeçalho vem antes de `data`; ler só o começo do arquivo basta para saber de quem ele é. */
const HEADER_PREFIX_BYTES = 8192
const DATA_MARKER = ',"data":'

export interface VaultDataHeader {
  format: typeof VAULT_DATA_FORMAT
  kind: VaultDataKind
  version: number
  revision: number
  writerId: string
  savedAt: number
  counts: SnapshotStats
  contentHash: string
  preferences?: UiPreferences
}

/** Acesso mínimo aos arquivos do vault; a pasta do navegador (File System Access API) e os testes o implementam. */
export interface VaultDataAdapter {
  /** `null` quando o arquivo não existe. */
  readText(path: string): Promise<string | null>
  readTextPrefix(path: string, bytes: number): Promise<string | null>
  writeText(path: string, content: string): Promise<void>
  remove(path: string): Promise<void>
  /** Nomes dos arquivos diretos da pasta; vazio quando ela não existe. */
  list(folder: string): Promise<string[]>
}

/** A revisão que este navegador escreveu (ou leu) por último; é o que prova que o arquivo ainda é "nosso". */
export interface KnownRevision {
  revision: number
  writerId: string
}

// ---- formato do arquivo ----

export function serializeVaultData(header: VaultDataHeader, dataJson: string): string {
  const { preferences, ...rest } = header
  return `${JSON.stringify(rest).slice(0, -1)}${preferences ? `,"preferences":${JSON.stringify(preferences)}` : ""}${DATA_MARKER}${dataJson}}`
}

function validateHeader(value: unknown): VaultDataHeader | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const counts = parseSnapshotStats(record.counts)
  if (record.format !== VAULT_DATA_FORMAT || (record.kind !== "knowledge" && record.kind !== "bestiary") || !counts) return null
  if (typeof record.version !== "number" || !Number.isInteger(record.revision) || (record.revision as number) < 0 || typeof record.writerId !== "string" || typeof record.savedAt !== "number") return null
  const preferences = parseUiPreferences(record.preferences)
  return { format: VAULT_DATA_FORMAT, kind: record.kind, version: record.version, revision: record.revision as number, writerId: record.writerId, savedAt: record.savedAt, counts, contentHash: typeof record.contentHash === "string" ? record.contentHash : "", ...(Object.keys(preferences).length ? { preferences } : {}) }
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

/** Cabeçalho a partir do começo do arquivo (`null` se o marcador de `data` ainda não apareceu ou o texto é inválido). */
export function parseVaultHeaderPrefix(prefix: string): VaultDataHeader | null {
  const cut = prefix.indexOf(DATA_MARKER)
  return cut < 0 ? null : validateHeader(safeParse(`${prefix.slice(0, cut)}}`))
}

export function parseVaultData<T = unknown>(text: string): { header: VaultDataHeader; data: T } | null {
  const parsed = safeParse(text)
  const header = validateHeader(parsed)
  const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).data : undefined
  return header && data && typeof data === "object" ? { header, data: data as T } : null
}

// ---- leitura ----

async function readHeader(adapter: VaultDataAdapter, path: string): Promise<{ present: false } | { present: true; header: VaultDataHeader | null }> {
  const prefix = await adapter.readTextPrefix(path, HEADER_PREFIX_BYTES)
  if (prefix === null) return { present: false }
  const header = parseVaultHeaderPrefix(prefix)
  if (header || prefix.length < HEADER_PREFIX_BYTES) return { present: true, header }
  // Cabeçalho maior que o esperado: lê o arquivo inteiro uma vez.
  const full = await adapter.readText(path)
  return { present: true, header: full ? parseVaultData(full)?.header ?? null : null }
}

export type VaultInspection =
  | { status: "missing" }
  | { status: "unreadable" }
  | { status: "unsupported"; version: number }
  | { status: "ok"; header: VaultDataHeader; ours: boolean }

/** Estado barato do arquivo (só o cabeçalho): há dados? de quando? foi este navegador quem os gravou? */
export async function inspectVaultData(adapter: VaultDataAdapter, kind: VaultDataKind, known: KnownRevision | null): Promise<VaultInspection> {
  const found = await readHeader(adapter, VAULT_DATA_FILES[kind])
  if (!found.present) return { status: "missing" }
  if (!found.header) return { status: "unreadable" }
  if (found.header.version > VAULT_DATA_VERSION) return { status: "unsupported", version: found.header.version }
  return { status: "ok", header: found.header, ours: isOurs(found.header, known) }
}

function isOurs(header: VaultDataHeader, known: KnownRevision | null): boolean {
  return known !== null && known.revision === header.revision && known.writerId === header.writerId
}

export function knownRevisionOf(header: VaultDataHeader): KnownRevision {
  return { revision: header.revision, writerId: header.writerId }
}

export type VaultLoadResult<T> =
  | { status: "ok"; header: VaultDataHeader; data: T }
  | { status: "missing" }
  | { status: "unreadable" }
  | { status: "unsupported"; version: number }

export async function loadVaultData<T = unknown>(adapter: VaultDataAdapter, kind: VaultDataKind): Promise<VaultLoadResult<T>> {
  const text = await adapter.readText(VAULT_DATA_FILES[kind])
  if (text === null) return { status: "missing" }
  const parsed = parseVaultData<T>(text)
  if (!parsed) return { status: "unreadable" }
  if (parsed.header.version > VAULT_DATA_VERSION) return { status: "unsupported", version: parsed.header.version }
  return { status: "ok", header: parsed.header, data: parsed.data }
}

// ---- gravação ----

export interface VaultSaveInput {
  /** O que vai para dentro do arquivo (já filtrado para o escopo: só Bestiário, Campanhas e Wiki). */
  data: unknown
  /** Texto estável do conteúdo (sem datas que mudam a cada sincronização): decide se algo mudou. */
  signature: string
  counts: SnapshotStats
  preferences?: UiPreferences
  /** Dispositivo sem dado algum do mestre: nunca vira arquivo. */
  pristine: boolean
}

export interface VaultSaveContext {
  writerId: string
  known: KnownRevision | null
  /** Só depois de uma confirmação explícita do usuário. */
  force?: boolean
  now?: number
}

export type VaultSaveOutcome =
  | { status: "saved"; header: VaultDataHeader; known: KnownRevision; checkpointed: boolean }
  | { status: "unchanged"; header: VaultDataHeader; known: KnownRevision }
  | { status: "skipped-pristine" }
  | { status: "conflict"; reason: "foreign" | "shrink" | "unreadable"; existing: VaultDataHeader | null }
  | { status: "unsupported"; version: number }

const STAMP = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/

export function versionFileName(kind: VaultDataKind, savedAt: number): string {
  return `${VERSION_PREFIX[kind]}-${new Date(savedAt).toISOString().replace(/[:.]/g, "-")}.json`
}

export function versionFileTime(name: string): number | null {
  const match = STAMP.exec(name)
  if (!match) return null
  const time = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`)
  return Number.isFinite(time) ? time : null
}

/** Copia o arquivo atual para `versoes/` quando a política manda, e apaga as cópias que passam do limite. */
async function checkpointExisting(adapter: VaultDataAdapter, kind: VaultDataKind, existing: VaultDataHeader, forced: boolean, shrink: boolean): Promise<boolean> {
  const policy = CHECKPOINT_POLICY[kind]
  const versions = (await adapter.list(VAULT_VERSIONS_FOLDER)).filter((name) => name.startsWith(`${VERSION_PREFIX[kind]}-`) && name.endsWith(".json"))
    .flatMap((name) => { const at = versionFileTime(name); return at === null ? [] : [{ name, at }] })
  const newest = versions.reduce<number | null>((latest, item) => latest === null || item.at > latest ? item.at : latest, null)
  if (!shouldCheckpoint({ previousAt: existing.savedAt, newestCheckpointAt: newest, forced, shrink, policy })) return false
  const text = await adapter.readText(VAULT_DATA_FILES[kind])
  if (text === null) return false
  const name = versionFileName(kind, existing.savedAt)
  await adapter.writeText(`${VAULT_VERSIONS_FOLDER}/${name}`, text)
  const all = versions.some((item) => item.name === name) ? versions : [...versions, { name, at: existing.savedAt }]
  for (const item of checkpointsToDrop(all, policy.keep)) await adapter.remove(`${VAULT_VERSIONS_FOLDER}/${item.name}`)
  return true
}

const README = `---
runas_system: true
---

# Dados do Runas DM

Esta pasta guarda as cópias de segurança dos dados do site que não cabem em notas Markdown. **Não apague.**

- \`wiki-e-campanhas.json\`: Campanhas e Wiki — campanhas (estilo, organizador, vínculos), tags com ícone e cor, eras com datas, exclusões e as preferências de interface.
- \`bestiario.json\`: fichas do bestiário e tabelas de maestria.
- \`versoes/\`: versões anteriores desses arquivos, guardadas de tempos em tempos.

Ao conectar este vault ao Runas DM em outro computador, esses arquivos são lidos e tudo volta como estava. As notas (\`.md\`) continuam sendo a fonte do texto das páginas; estes arquivos guardam o resto.
`

async function ensureReadme(adapter: VaultDataAdapter): Promise<void> {
  if (await adapter.readTextPrefix(VAULT_README_PATH, 1) === null) await adapter.writeText(VAULT_README_PATH, README)
}

export async function saveVaultData(adapter: VaultDataAdapter, kind: VaultDataKind, input: VaultSaveInput, context: VaultSaveContext): Promise<VaultSaveOutcome> {
  const force = context.force === true
  if (input.pristine && !force) return { status: "skipped-pristine" }
  const path = VAULT_DATA_FILES[kind]
  const found = await readHeader(adapter, path)
  if (found.present && !found.header && !force) return { status: "conflict", reason: "unreadable", existing: null }
  const existing = found.present ? found.header : null
  if (existing && existing.version > VAULT_DATA_VERSION) return { status: "unsupported", version: existing.version }

  const contentHash = hashText(`${input.signature}\u0000${JSON.stringify(input.preferences ?? null)}`)
  // Mesmo conteúdo já gravado (por qualquer navegador): nada a fazer, e a revisão passa a ser conhecida.
  if (existing && existing.contentHash === contentHash) return { status: "unchanged", header: existing, known: knownRevisionOf(existing) }
  if (existing && !force) {
    if (!isOurs(existing, context.known)) return { status: "conflict", reason: "foreign", existing }
    if (isShrink(existing.counts, input.counts)) return { status: "conflict", reason: "shrink", existing }
  }

  const checkpointed = existing ? await checkpointExisting(adapter, kind, existing, force, isShrink(existing.counts, input.counts)) : false
  const header: VaultDataHeader = { format: VAULT_DATA_FORMAT, kind, version: VAULT_DATA_VERSION, revision: (existing?.revision ?? 0) + 1, writerId: context.writerId, savedAt: context.now ?? Date.now(), counts: input.counts, contentHash, ...(input.preferences && Object.keys(input.preferences).length ? { preferences: input.preferences } : {}) }
  await adapter.writeText(path, serializeVaultData(header, JSON.stringify(input.data)))
  await ensureReadme(adapter)
  return { status: "saved", header, known: knownRevisionOf(header), checkpointed }
}

/** Texto completo de um arquivo de dados (revisão 0, sem depender de vault algum): serve à exportação manual em JSON. */
export function createVaultDataText(kind: VaultDataKind, input: VaultSaveInput, options: { writerId: string; now?: number }): string {
  const header: VaultDataHeader = { format: VAULT_DATA_FORMAT, kind, version: VAULT_DATA_VERSION, revision: 0, writerId: options.writerId, savedAt: options.now ?? Date.now(), counts: input.counts, contentHash: hashText(`${input.signature}\u0000${JSON.stringify(input.preferences ?? null)}`), ...(input.preferences && Object.keys(input.preferences).length ? { preferences: input.preferences } : {}) }
  return serializeVaultData(header, JSON.stringify(input.data))
}
