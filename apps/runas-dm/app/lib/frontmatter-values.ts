/**
 * Leitura dos valores do frontmatter YAML que o Runas DM aceita.
 *
 * A regra que este módulo existe para garantir: **um nome nunca perde
 * colchetes.** `"[O&C] Lion Heart pt. II"` é o nome de uma campanha (ou de uma
 * tag), não uma lista. Antes, todo texto que começava com `[` tinha o `[`
 * arrancado à força e voltava como `O&C] Lion Heart pt. II`, o que criava
 * campanha, pasta e tag duplicadas a cada volta pelo vault.
 *
 * Só existe lista quando o YAML diz que existe: array JSON (`["a", "b"]`),
 * lista de blocos (`- a`) ou sequência de fluxo SEM aspas cujo primeiro `[`
 * fecha exatamente no último caractere (`[a, b]`). O que estiver entre aspas
 * é sempre um texto, nunca uma lista.
 */

/**
 * Divide no nível zero de colchetes, por vírgula ou quebra de linha, sem
 * separar dentro de aspas nem dentro de colchetes: `a, [b, c] d` → `a` e
 * `[b, c] d`. Um apóstrofo no meio de uma palavra não abre aspas.
 */
export function splitTopLevel(source: string): string[] {
  const items: string[] = []
  let current = ""
  let depth = 0
  let quote: string | null = null
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      current += char
      if (char === "\\" && quote === '"' && index + 1 < source.length) { current += source[index + 1]; index += 1 }
      else if (char === quote) quote = null
      continue
    }
    if ((char === '"' || char === "'") && current.trim() === "") { quote = char; current += char; continue }
    if (char === "[") depth += 1
    else if (char === "]") depth = Math.max(0, depth - 1)
    if ((char === "," || char === "\n") && depth === 0) { items.push(current); current = ""; continue }
    current += char
  }
  items.push(current)
  return items
}

/** Tira as aspas que envolvem o texto inteiro (`"a"`, `'a'`); qualquer outra coisa fica como está. */
export function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { const parsed: unknown = JSON.parse(trimmed); if (typeof parsed === "string") return parsed } catch { /* aspas YAML que não são JSON válido */ }
    return trimmed.slice(1, -1)
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'")
  return trimmed
}

/** O primeiro `[` do texto fecha exatamente no último caractere? (`[a, b]` sim; `[a] b [c]` não.) */
function bracketsWrapWholeText(text: string): boolean {
  if (!text.startsWith("[") || !text.endsWith("]")) return false
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "[") depth += 1
    else if (text[index] === "]") {
      depth -= 1
      if (depth === 0) return index === text.length - 1
    }
  }
  return false
}

/** `[[Nota]]` solto (o Obsidian exige aspas, mas quem esquece não pode virar uma lista aninhada). */
function isBareWikiLink(text: string): boolean {
  return /^\[\[[^[\]]*\]\]$/.test(text)
}

/**
 * Valor de uma linha `chave: valor`. JSON válido vale como está (é o que o
 * próprio Runas DM grava); sequência de fluxo sem aspas vira lista; todo o
 * resto é um texto, com colchetes intactos.
 */
export function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try { return JSON.parse(trimmed) } catch { /* YAML simples continua abaixo. */ }
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (bracketsWrapWholeText(trimmed) && !isBareWikiLink(trimmed)) return splitTopLevel(trimmed.slice(1, -1)).map(unquote).filter(Boolean)
  return unquote(trimmed)
}

function primitives(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (typeof value === "number" || typeof value === "boolean") return [String(value)]
  return Array.isArray(value) ? value.flatMap(primitives) : []
}

/**
 * Lista de textos (ids, categorias, tags). Um texto solto ainda aceita
 * `a, b` (separado por vírgula ou linha), mas nunca perde colchetes.
 */
export function stringList(value: unknown): string[] {
  const items = Array.isArray(value) ? primitives(value) : typeof value === "string" ? splitTopLevel(value).map(unquote) : primitives(value)
  return items.map((item) => item.trim().replace(/^#/, "")).filter(Boolean)
}

/**
 * Nome ou referência de uma propriedade que aponta para UMA coisa (campanha,
 * obra de origem). Nunca divide por vírgula — `A Queda, Parte 1` é um nome —
 * e nunca mexe nos colchetes; só uma lista do YAML tem vários itens.
 */
export function referenceList(value: unknown): string[] {
  const items = Array.isArray(value) ? primitives(value) : typeof value === "string" ? [value] : primitives(value)
  return items.map((item) => item.trim()).filter(Boolean)
}

/**
 * Conserta um nome que uma versão anterior do Runas DM já gravou sem o `[`
 * inicial (`O&C] Lion Heart pt. II` → `[O&C] Lion Heart pt. II`). Só age quando
 * há um `]` sem nenhum `[` no texto e nada de aspas antes dele; qualquer outro
 * nome passa intacto.
 */
export function restoreStrippedBracket(name: string): string {
  return /^[^[\]"]+\]/.test(name) && !name.includes("[") ? `[${name}` : name
}

/** Lista de tags/categorias: mesmas regras de `stringList`, mais o conserto de `restoreStrippedBracket`. */
export function tagList(value: unknown): string[] {
  return stringList(value).map(restoreStrippedBracket)
}
