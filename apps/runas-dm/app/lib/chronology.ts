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

export function fictionalYear(value: unknown): number | null {
  if (typeof value === "string" && !/^-?\d+$/.test(value.trim())) return null
  if (typeof value !== "number" && typeof value !== "string") return null
  const year = Number(value)
  return Number.isSafeInteger(year) ? year : null
}

export function formatFictionalYear(year: number | null | undefined, calendar = "C.E."): string {
  return year == null ? "Não definido" : `${year.toLocaleString("pt-BR")} ${calendar}`
}

export function normalizeUniverseEras(value: unknown): UniverseEra[] {
  const records = Array.isArray(value) ? value.filter((item): item is UniverseEra => Boolean(item && typeof item === "object" && typeof item.id === "string")) : []
  return UNIVERSE_ERAS.map((era) => {
    const record = records.find((item) => item.id === era.id)
    return record ? { ...era, name: typeof record.name === "string" && record.name.trim() ? record.name : era.name, startYear: fictionalYear(record.startYear), endYear: fictionalYear(record.endYear), calendar: typeof record.calendar === "string" && record.calendar.trim() ? record.calendar : era.calendar } : { ...era }
  })
}
