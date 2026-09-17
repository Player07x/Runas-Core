// Sanitização e leitura do HTML das páginas. Fica fora do editor para que a
// leitura não carregue a barra de ferramentas e os comandos de edição.

const allowedTags = new Set([
  "P", "DIV", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "SPAN",
  "UL", "OL", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "A", "IMG", "HR", "CODE", "PRE",
  "TABLE", "THEAD", "TBODY", "TR", "TD", "TH",
])

const FONT_SIZE_STYLE = /^font-size:\s*(?:[1-9]|[1-6]\d|70)px\s*;?$/i
const TEXT_ALIGN_STYLE = /^text-align:\s*(left|center|right|justify)\s*;?$/i
const IMAGE_WIDTH_STYLE = /^width:\s*(?:100|[2-9]\d)%\s*;?$/i
const ALIGNABLE_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "BLOCKQUOTE", "LI"])
const WIKI_TITLE_ATTRIBUTE = /data-wiki-title/i

function safeImageSource(value: string): boolean {
  return value.startsWith("data:image/") || value.startsWith("blob:") || (value.startsWith("/") && !value.startsWith("//"))
}

export function sanitizeRichText(value: string): string {
  if (typeof DOMParser === "undefined") return value
  const documentValue = new DOMParser().parseFromString(value, "text/html")
  for (const element of [...documentValue.body.querySelectorAll("*")]) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes)
      continue
    }
    for (const attribute of [...element.attributes]) {
      const keepLink = element.tagName === "A" && (
        (attribute.name === "href" && /^(https:|obsidian:|#)/i.test(attribute.value))
        || (attribute.name === "data-wiki-title" && Boolean(attribute.value.trim()))
      )
      const keepImageStyle = attribute.name === "style" && IMAGE_WIDTH_STYLE.test(attribute.value)
      const keepImage = element.tagName === "IMG" && ((attribute.name === "src" && safeImageSource(attribute.value)) || attribute.name === "alt" || attribute.name === "data-align" || attribute.name === "data-width" || keepImageStyle)
      const keepFontSize = element.tagName === "SPAN" && attribute.name === "style" && FONT_SIZE_STYLE.test(attribute.value)
      const keepAlign = attribute.name === "style" && ALIGNABLE_TAGS.has(element.tagName) && TEXT_ALIGN_STYLE.test(attribute.value)
      if (!keepLink && !keepImage && !keepFontSize && !keepAlign) element.removeAttribute(attribute.name)
    }
    if (element.tagName === "A") {
      if (element.hasAttribute("data-wiki-title")) {
        element.removeAttribute("target")
        element.removeAttribute("rel")
      } else {
        element.setAttribute("target", "_blank")
        element.setAttribute("rel", "noreferrer")
      }
    }
  }
  if (!documentValue.body.textContent?.trim() && !documentValue.body.querySelector("img, hr, table")) return ""
  return documentValue.body.innerHTML
}

const sanitizedCache = new Map<string, string>()
const SANITIZED_CACHE_SIZE = 60

/** Igual a `sanitizeRichText`, reaproveitando o resultado das páginas abertas recentemente. */
export function sanitizeRichTextCached(value: string): string {
  const cached = sanitizedCache.get(value)
  if (cached !== undefined) return cached
  const sanitized = sanitizeRichText(value)
  if (typeof DOMParser === "undefined") return sanitized
  if (sanitizedCache.size >= SANITIZED_CACHE_SIZE) sanitizedCache.delete(sanitizedCache.keys().next().value!)
  sanitizedCache.set(value, sanitized)
  return sanitized
}

export function wikiTitlesFromRichText(value: string): string[] {
  if (typeof DOMParser === "undefined") return []
  // Sem o atributo no texto não há o que analisar; evita criar um documento por página.
  if (!WIKI_TITLE_ATTRIBUTE.test(value)) return []
  const documentValue = new DOMParser().parseFromString(value, "text/html")
  return [...documentValue.querySelectorAll<HTMLAnchorElement>("a[data-wiki-title]")]
    .map((anchor) => anchor.dataset.wikiTitle?.trim() ?? "")
    .filter(Boolean)
}
