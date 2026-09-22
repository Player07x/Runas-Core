/** Fonte: [O&C] História do Universo, tabelas de eras. Lacunas permanecem sem data. */
export interface UniverseEra {
  id: string
  name: string
  startYear: number | null
  endYear: number | null
  calendar: string
  note: string
}

export const UNIVERSE_ERAS: UniverseEra[] = [
  { id: "pre-runas", name: "Pré-Runas", startYear: null, endYear: null, calendar: "C.E.", note: "Origem do universo conhecido." },
  { id: "runas", name: "Era das Runas", startYear: null, endYear: null, calendar: "C.E.", note: "Há mais de 100 milhões de anos; o documento não define os limites exatos." },
  { id: "titas", name: "Era dos Titãs", startYear: -100180789, endYear: -15396, calendar: "C.E.", note: "" },
  { id: "maquinas", name: "Era das Máquinas", startYear: -15396, endYear: -5084, calendar: "C.E.", note: "Equivale a 0–10.312 no calendário Solaris." },
  { id: "estrelas", name: "Era das Estrelas", startYear: -6702, endYear: 0, calendar: "C.E.", note: "Também chamada Era Divina na tabela do documento. Seu intervalo se sobrepõe à Era das Máquinas." },
  { id: "monges", name: "Era dos Monges", startYear: 0, endYear: 1489, calendar: "C.E.", note: "" },
  { id: "alquimistas", name: "Era dos Alquimistas", startYear: null, endYear: null, calendar: "C.E.", note: "Limites não definidos no documento." },
  { id: "magos", name: "Era dos Magos", startYear: null, endYear: null, calendar: "C.E.", note: "Limites não definidos no documento." },
  { id: "migracoes", name: "Era das Migrações", startYear: null, endYear: null, calendar: "C.E.", note: "Considerada por alguns como parte da Era dos Magos." },
  { id: "cacadores", name: "Era dos Caçadores", startYear: 4027, endYear: null, calendar: "C.E.", note: "Era atual, também chamada Era dos Reis. 4.027 C.E. equivale a 0 Logi." },
]

/**
 * `4.027 C.E. equivale a 0 Logi` (nota da Era dos Caçadores em
 * `[O&C] História do Universo`). Os dois calendários contam o mesmo tempo com
 * origens diferentes, então um ano digitado em Logi vira C.E. somando esta
 * distância — e o armazenamento continua tendo uma escala única.
 */
export const LOGI_EPOCH_IN_CE = 4027

export type CalendarName = "ce" | "logi"

function normalizedCalendar(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\s]/g, "").toLowerCase()
}

/** Lê "1200", "1.200 C.E." ou "0 Logi" sem exigir um calendário específico do mestre. */
export function readCalendarYear(value: unknown): { year: number; calendar: CalendarName } | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? { year: value, calendar: "ce" } : null
  if (typeof value !== "string") return null
  const match = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().match(/^(-?[\d.\s]+?)\s*(c\.?\s*e\.?|logi)?$/)
  if (!match) return null
  const digits = match[1].replace(/[.\s]/g, "")
  if (!/^-?\d+$/.test(digits)) return null
  const year = Number(digits)
  if (!Number.isSafeInteger(year)) return null
  return { year, calendar: match[2]?.startsWith("logi") ? "logi" : "ce" }
}

/** Ano canônico em C.E., seja qual for o calendário digitado. */
export function parseCalendarYear(value: unknown): number | null {
  const read = readCalendarYear(value)
  return read ? (read.calendar === "logi" ? read.year + LOGI_EPOCH_IN_CE : read.year) : null
}

export function toLogiYear(year: number): number {
  return year - LOGI_EPOCH_IN_CE
}

/**
 * Os dois calendários lado a lado. Uma era com calendário próprio (renomeado
 * pelo mestre) não tem equivalência conhecida com Logi, então só o dela é
 * exibido.
 */
export function formatCalendarYears(year: number | null | undefined, calendar = "C.E."): string {
  if (year == null) return "Não definido"
  const primary = formatFictionalYear(year, calendar)
  if (normalizedCalendar(calendar) !== "ce") return primary
  return `${primary} · ${toLogiYear(year).toLocaleString("pt-BR")} Logi`
}

export function fictionalYear(value: unknown): number | null {
  if (typeof value === "string" && !/^-?\d+$/.test(value.trim())) return null
  if (typeof value !== "number" && typeof value !== "string") return null
  const year = Number(value)
  return Number.isSafeInteger(year) ? year : null
}

export function formatFictionalYear(year: number | null | undefined, calendar = "C.E."): string {
  return year == null ? "Não definido" : `${year.toLocaleString("pt-BR")} ${calendar}`
}

/**
 * A era não é escolhida à mão: ela sai do ano. Quando dois intervalos se
 * sobrepõem (a Era das Estrelas cobre parte da Era das Máquinas), vence o mais
 * específico — o de menor duração — e, em empate, a ordem do documento. Um ano
 * em `0` cai na Era dos Monges, que começa nele, e não na Era das Estrelas,
 * que termina nele.
 */
export function eraForYear(year: number | null | undefined, eras: UniverseEra[]): UniverseEra | undefined {
  if (year == null) return undefined
  let best: { era: UniverseEra; span: number } | undefined
  for (const era of eras) {
    // Sem nenhum limite não há como deduzir nada; com um só, a era é aberta
    // para aquele lado (a Era dos Caçadores é a atual e não tem fim).
    if (era.startYear == null && era.endYear == null) continue
    if (era.startYear != null && year < era.startYear) continue
    if (era.endYear != null && year > era.endYear) continue
    const span = era.startYear != null && era.endYear != null ? era.endYear - era.startYear : Number.POSITIVE_INFINITY
    if (!best || span < best.span) best = { era, span }
  }
  return best?.era
}

/**
 * A era exibida de um registro: a detectada pelo ano quando existe, senão a que
 * já estava gravada — eras sem limites definidos no documento (Magos,
 * Migrações) só podem vir daí até que o mestre preencha seus anos.
 */
export function resolveEra(year: number | null | undefined, eras: UniverseEra[], storedEraId?: string): UniverseEra | undefined {
  return eraForYear(year, eras) ?? eras.find((era) => era.id === storedEraId)
}

export function normalizeUniverseEras(value: unknown): UniverseEra[] {
  const records = Array.isArray(value) ? value.filter((item): item is UniverseEra => Boolean(item && typeof item === "object" && typeof item.id === "string")) : []
  return UNIVERSE_ERAS.map((era) => {
    const record = records.find((item) => item.id === era.id)
    return record ? { ...era, name: typeof record.name === "string" && record.name.trim() ? record.name : era.name, startYear: fictionalYear(record.startYear), endYear: fictionalYear(record.endYear), calendar: typeof record.calendar === "string" && record.calendar.trim() ? record.calendar : era.calendar } : { ...era }
  })
}

/**
 * Retorna todas as páginas de era cujo intervalo contém o ano. Diferente de
 * `eraForYear`, esta função não escolhe uma era vencedora: intervalos
 * sobrepostos marcam o acontecimento com todas as eras correspondentes.
 */
export function erasForYear<T extends { eraStartYear?: number | null; eraEndYear?: number | null }>(year: number | null | undefined, eraPages: T[]): T[] {
  if (year == null) return []
  return eraPages.filter((era) => {
    if (era.eraStartYear == null && era.eraEndYear == null) return false
    if (era.eraStartYear != null && year < era.eraStartYear) return false
    if (era.eraEndYear != null && year > era.eraEndYear) return false
    return true
  })
}

/** Recalcula somente as tags de era dos acontecimentos da Wiki. */
export function withEraTags<P extends { scope: string; kind: string; eventYear?: number | null; tags: string[] }, E extends { id: string; title: string; eraStartYear?: number | null; eraEndYear?: number | null }>(pages: P[], eraPages: E[]): P[] {
  const eraNames = new Set(eraPages.map((era) => era.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")))
  return pages.map((page) => {
    if (page.scope !== "wiki" || page.kind !== "event") return page
    const retained = page.tags.filter((tag) => !eraNames.has(tag.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")))
    const matches = erasForYear(page.eventYear, eraPages).map((era) => era.title)
    return { ...page, tags: [...new Set([...retained, ...matches])] }
  })
}
