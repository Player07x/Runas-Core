import type { KnowledgeTag, KnowledgeWorkspaceState } from "./knowledge-model"

/**
 * Regras de tags do Runas DM:
 * - toda tag é minúscula;
 * - variantes do mesmo nome viram uma só (`assentamento`/`Assentamentos`, `regiao`/`Regiões`);
 * - tags que são só ruído do erro dos colchetes (nome da campanha, `] Lion Heart…`) saem;
 * - cada tag tem um emoji relacionado (o ícone que o mestre escolheu nunca é trocado).
 */

export const DEFAULT_TAG_ICON = "🏷️"

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").trim()

/** Chave de agrupamento: sem acento, sem caixa e sem plural (`regiões` → `regiao`, `assentamentos` → `assentamento`). */
export function tagStem(name: string): string {
  const folded = fold(name).replace(/\s+/g, " ")
  if (folded.endsWith("oes")) return `${folded.slice(0, -3)}ao`
  return folded.length > 3 && folded.endsWith("s") ? folded.slice(0, -1) : folded
}

/**
 * Tag que só existe por causa do erro dos colchetes (`] Lion Heart pt. II`, `O&C] Lion Heart pt. II`,
 * `Eventos e Missões"] …`) ou é um marcador vazio (`Sem Tag`). Nunca é ruído um nome bem formado, mesmo igual
 * ao da campanha: `[O&C] Lion Heart pt. II` e `Lion Heart` podem ser tags de verdade.
 */
export function isNoiseTag(name: string): boolean {
  const value = name.trim()
  if (!value || fold(value) === "sem tag") return true
  return value.includes('"') || value.startsWith("]") || value.endsWith("[") || (value.includes("]") && !value.includes("["))
}

/** Palavras-chave (já sem acento) → emoji. A primeira que aparecer no nome vence, então as específicas vêm antes. */
const TAG_EMOJIS: Array<[string, string]> = [
  ["pre runas", "🌑"], ["era das runas", "🔮"], ["era dos tita", "🗿"], ["era das maquina", "⚙️"], ["era das estrela", "⭐"],
  ["era dos monge", "🧘"], ["era dos alquimista", "⚗️"], ["era dos mago", "🧙"], ["era das migra", "🧳"], ["era dos cacador", "🏹"],
  ["alma purpura", "🟣"], ["entidade do caos", "🌀"], ["entidade elemental", "💠"], ["soberano", "👑"], ["sem campanha", "📁"],
  ["lion heart", "🦁"], ["evento", "⚔️"], ["missao", "⚔️"], ["acontecimento", "📜"], ["anotac", "📝"], ["sess", "🎬"],
  ["prologo", "📖"], ["historic", "📚"], ["historia", "📚"], ["lenda", "📜"], ["assentamento", "🏘️"], ["cidade", "🏙️"], ["vila", "🛖"],
  ["regiao", "🏞️"], ["territorio", "🚩"], ["continente", "🌎"], ["mundo", "🌍"], ["planeta", "🪐"], ["plano", "🌌"], ["mar", "🌊"],
  ["geografia", "🗺️"], ["mapa", "🗺️"], ["divind", "✨"], ["quasar", "💫"], ["estrela", "⭐"], ["tita", "🗿"], ["jogador", "🎲"],
  ["runilita", "🧙"], ["personagem", "👤"], ["monstro", "👹"], ["criatura", "🐉"], ["fauna", "🦌"], ["item", "🎒"],
  ["organiza", "🏛️"], ["cronolog", "⏳"], ["guerra", "⚔️"], ["morte", "💀"], ["magia", "🪄"], ["importante", "❗"], ["era ", "🕰️"],
]

export function emojiForTag(name: string): string {
  const folded = fold(name).replace(/[_-]+/g, " ")
  const stem = tagStem(folded)
  return TAG_EMOJIS.find(([keyword]) => folded.includes(keyword) || stem.includes(keyword))?.[1] ?? DEFAULT_TAG_ICON
}

function variantScore(name: string, usage: number): [number, number, number] {
  return [fold(name).length, [...name].filter((char) => char.normalize("NFD") !== char).length, usage]
}

function better(a: [number, number, number], b: [number, number, number]): boolean {
  return a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]
}

/** Aplica as regras de tags ao estado inteiro. Idempotente: rodar de novo não muda nada. */
export function canonicalizeTags(state: KnowledgeWorkspaceState): KnowledgeWorkspaceState {
  const usage = new Map<string, number>()
  for (const page of state.pages) for (const tag of page.tags) usage.set(tag, (usage.get(tag) ?? 0) + 1)
  const best = new Map<string, { name: string; score: [number, number, number] }>()
  const consider = (name: string) => {
    if (isNoiseTag(name)) return
    const key = tagStem(name)
    const score = variantScore(name, usage.get(name) ?? 0)
    const current = best.get(key)
    if (!current || better(score, current.score)) best.set(key, { name, score })
  }
  state.pages.forEach((page) => page.tags.forEach(consider))
  state.tags.forEach((tag) => consider(tag.name))
  const canonical = (name: string): string | null => {
    if (isNoiseTag(name)) return null
    return (best.get(tagStem(name))?.name ?? name).trim().toLocaleLowerCase("pt-BR")
  }

  const pages = state.pages.map((page) => {
    const tags = [...new Set(page.tags.flatMap((tag) => canonical(tag) ?? []))]
    return tags.length === page.tags.length && tags.every((tag, index) => tag === page.tags[index]) ? page : { ...page, tags }
  })

  const scopeOf = (tag: KnowledgeTag) => tag.pinnedIn.find((scope) => scope.startsWith("campaign-notes:")) ?? "global"
  const merged = new Map<string, KnowledgeTag>()
  for (const tag of state.tags) {
    const name = canonical(tag.name)
    if (!name) continue
    const key = `${tagStem(name)}|${scopeOf(tag)}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...tag, name, icon: !tag.icon || tag.icon === DEFAULT_TAG_ICON ? emojiForTag(name) : tag.icon })
    } else {
      merged.set(key, {
        ...existing,
        pinnedIn: [...new Set([...existing.pinnedIn, ...tag.pinnedIn])],
        icon: existing.icon !== DEFAULT_TAG_ICON ? existing.icon : tag.icon && tag.icon !== DEFAULT_TAG_ICON ? tag.icon : emojiForTag(name),
        color: existing.color && existing.color !== "#87909b" ? existing.color : tag.color || existing.color,
      })
    }
  }
  return { ...state, pages, tags: [...merged.values()] }
}
