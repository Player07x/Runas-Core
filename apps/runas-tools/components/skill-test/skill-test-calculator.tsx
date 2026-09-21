"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ChevronDown, Dices, History, Sparkles, WandSparkles } from "lucide-react"
import type { CharacterBond, CharacterSkill, CharacterStats, SecondaryAttributeKey } from "@runas/core/types/character"
import type { SkillRoll, SkillTestConfig, SpecialDieId } from "@runas/core/types/skillTest"
import { damageAttributes } from "@runas/core/data/attributes"
import { specialDice } from "@runas/core/data/skills"
import { calculateCharacterStatSnapshot } from "@runas/core/lib/characterStatCalculations"
import {
  applyDeterminationToRoll,
  calculateAttributeTest,
  calculateSkillModifier,
  compareSkillRolls,
  findCharacterSkill,
  formatSkillRollOutcome,
  getBestSkillRoll,
  normalizeSkillName,
  parseSkillExpression,
  rollSkillTest,
} from "@runas/core/lib/skillCalculations"
import { cn } from "@/lib/utils"
import { calculateBondQuality } from "@runas/core/lib/bondCalculations"
import { findCharacterTestSource } from "@runas/core/lib/characterTestSources"
import { useCharacter } from "@/components/character/character-provider"
import { SkillIntegerInput } from "./skill-integer-input"

interface QuickRollResult {
  diceRolls: [number, number]
  diceSum: number
  margin: number
  label: string
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">{children}</span>
}

function resultTextTone(outcome: SkillRoll["outcome"]): string {
  if (outcome === "critical-success") return "text-emerald-300"
  if (outcome === "success") return "text-sky-300"
  if (outcome === "critical-failure") return "text-red-300"
  return "text-amber-300"
}

function formatTestOutcome(roll: SkillRoll): string {
  const result = formatSkillRollOutcome(roll)
  if (normalizeSkillName(roll.skillName) !== "primeiras impressoes") return result
  return `${result} (${calculateBondQuality(roll.margin).name})`
}

function SkillTestResultPanel({
  activeRoll,
  quickResult,
  resultMode,
  determination,
  casualty,
  determinationBlocked,
  casualtyBlocked,
  onUseDetermination,
  onUseCasualty,
}: {
  activeRoll: SkillRoll | null
  quickResult: QuickRollResult | null
  resultMode: "quick" | "full" | null
  determination: number
  casualty: number
  determinationBlocked: boolean
  casualtyBlocked: boolean
  onUseDetermination: () => void
  onUseCasualty: () => void
}) {
  if (resultMode === "quick" && quickResult) {
    return (
      <div className="flex min-h-72 flex-col gap-4 rounded-2xl border border-panel-border/60 bg-panel p-5 text-white shadow-[0_16px_44px_rgba(28,34,52,0.16)] sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-panel-muted">Resultado do teste rápido</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-highlight">{quickResult.label}</p>
        </div>
        <div className="rounded-xl border border-panel-border/50 bg-panel-input/75 p-4">
          <p className="text-xs font-semibold text-panel-muted">Dados rolados</p>
          <p className="mt-1 text-lg text-white">
            <span className="text-panel-muted">{quickResult.diceRolls[0]} + {quickResult.diceRolls[1]}</span>
            <span className="ml-2 font-semibold">= {quickResult.diceSum}</span>
          </p>
        </div>
        <div className="rounded-xl border border-panel-border/50 bg-panel-input/75 p-4">
          <p className="text-xs font-semibold text-panel-muted">Margem</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">{quickResult.margin >= 0 ? "+" : ""}{quickResult.margin}</p>
        </div>
      </div>
    )
  }

  if (!activeRoll || resultMode !== "full") {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-panel-border/60 bg-panel px-7 py-12 text-center shadow-[0_16px_44px_rgba(28,34,52,0.16)]">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-panel-elevated text-white shadow-lg">
          <Dices className="size-7" />
        </span>
        <p className="mt-4 text-base font-bold text-white">Nenhum teste rolado ainda</p>
        <p className="mt-1.5 max-w-64 text-sm leading-relaxed text-panel-muted text-pretty">
          Configure os campos e toque em Rolar teste para ver o resultado.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-panel-border/60 bg-panel p-5 text-white shadow-[0_16px_44px_rgba(28,34,52,0.16)] sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-panel-muted">Resultado do teste</p>
        <p className={cn("mt-1 text-3xl font-bold tracking-tight", resultTextTone(activeRoll.outcome))}>
          {formatTestOutcome(activeRoll)}
        </p>
        <p className="mt-1 text-sm text-panel-muted">Margem {activeRoll.margin >= 0 ? "+" : ""}{activeRoll.margin}</p>
      </div>

      <div className="rounded-xl border border-panel-border/50 bg-panel-input/75 p-4">
        <p className="text-xs font-semibold text-panel-muted">Dados rolados</p>
        <p className="mt-1 text-lg text-white">
          <span className="text-panel-muted">{activeRoll.diceRolls[0]} + {activeRoll.diceRolls[1]}</span>
          <span className="ml-2 font-semibold">= {activeRoll.diceSum}</span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <span className="rounded-xl border border-panel-border/50 bg-panel-input/75 px-2 py-3"><small className="block text-panel-muted">Base</small><strong>{activeRoll.baseTest}</strong></span>
        <span className="rounded-xl border border-panel-border/50 bg-panel-input/75 px-2 py-3"><small className="block text-panel-muted">Mod.</small><strong>{activeRoll.totalModifiers >= 0 ? "+" : ""}{activeRoll.totalModifiers}</strong></span>
        <span className="rounded-xl border border-panel-border/50 bg-panel-input/75 px-2 py-3"><small className="block text-panel-muted">Total</small><strong>{activeRoll.totalTest}</strong></span>
      </div>

      <div className="rounded-xl border border-panel-border/50 bg-panel-input/75 p-4">
        <p className="mb-3 text-xs font-semibold text-panel-muted">Como o valor foi calculado</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-panel-muted">Teste base</dt><dd className="font-semibold">{activeRoll.baseTest}</dd></div>
          <div><dt className="text-panel-muted">Total de Mod.</dt><dd className="font-semibold">{activeRoll.totalModifiers >= 0 ? "+" : ""}{activeRoll.totalModifiers}</dd></div>
          <div><dt className="text-panel-muted">Teste total</dt><dd className="font-semibold">{activeRoll.totalTest}</dd></div>
          <div><dt className="text-panel-muted">Margem</dt><dd className="font-semibold">{activeRoll.margin >= 0 ? "+" : ""}{activeRoll.margin}</dd></div>
        </dl>
      </div>

      {(determination > 0 || casualty > 0) && (
        <div className="flex flex-col gap-2">
          {determination > 0 && (
            <button
              type="button"
              onClick={onUseDetermination}
              disabled={determinationBlocked}
              title={determinationBlocked ? "Determinação não pode alterar resultados críticos" : "Aumentar o resultado usando Determinação"}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-panel-input px-3 text-sm font-semibold text-white transition hover:bg-panel-elevated disabled:cursor-not-allowed disabled:opacity-40"
            >
              Usar Determinação ({determination})
            </button>
          )}
          {casualty > 0 && (
            <button
              type="button"
              onClick={onUseCasualty}
              disabled={casualtyBlocked}
              title={casualtyBlocked ? "Críticos só podem ser refeitos em testes de Acaso" : "Rolar novamente usando Casualidade"}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-panel-input px-3 text-sm font-semibold text-white transition hover:bg-panel-elevated disabled:cursor-not-allowed disabled:opacity-40"
            >
              Usar Casualidade ({casualty})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function configFromSkill(skill: CharacterSkill): SkillTestConfig {
  return {
    attributeKey: skill.attributeKey,
    skillName: skill.name,
    skillModifier: calculateSkillModifier(skill),
    masterModifier: 0,
    otherModifiers: 0,
    specialDieId: "none",
  }
}

function configFromBond(bond: CharacterBond, stats: CharacterStats): SkillTestConfig {
  return {
    attributeKey: "social",
    skillName: "Primeiras Impressões",
    skillModifier: calculateBondQuality(bond.points).level,
    masterModifier: 0,
    otherModifiers: stats.firstImpressionsBonus + bond.modifier,
    specialDieId: "none",
  }
}

export function SkillTestCalculator() {
  const { character, updateCharacter, isReady } = useCharacter()
  const searchParams = useSearchParams()
  const firstSkill = character.skills[0]
  const [config, setConfig] = useState<SkillTestConfig>(() => firstSkill
    ? configFromSkill(firstSkill)
    : {
        attributeKey: "",
        skillName: "",
        skillModifier: 0,
        masterModifier: 0,
        otherModifiers: 0,
        specialDieId: "none",
      })
  const [quickTest, setQuickTest] = useState(0)
  const [quickResult, setQuickResult] = useState<QuickRollResult | null>(null)
  const [quickExpression, setQuickExpression] = useState("")
  const [parserMessage, setParserMessage] = useState<string | null>(null)
  const [history, setHistory] = useState<SkillRoll[]>([])
  const [activeRoll, setActiveRoll] = useState<SkillRoll | null>(null)
  const [resultMode, setResultMode] = useState<"quick" | "full" | null>(null)
  const handledRollToken = useRef<string | null>(null)
  const { attributes, info, skills, stats, bonds, abilities } = character
  const snapshot = useMemo(
    () => calculateCharacterStatSnapshot(attributes, info, stats, skills, abilities),
    [abilities, attributes, info, skills, stats],
  )
  const requestedSkillId = searchParams.get("skill")
  const requestedBondId = searchParams.get("bond")
  // Elemento ou fusão da seção de Magias: vale como perícia no teste.
  const requestedElementId = searchParams.get("element")
  const requestedRollToken = searchParams.get("roll")

  function clearRolls() {
    setHistory([])
    setActiveRoll(null)
    setResultMode(null)
  }

  function changeConfig<K extends keyof SkillTestConfig>(key: K, value: SkillTestConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }))
    clearRolls()
  }

  function historyLimit(rolls: SkillRoll[]): number {
    const specialUses = rolls.filter((roll) => roll.specialDieId !== "none").length
    return Math.min(25, Math.max(10, snapshot.casualtyMax) + specialUses)
  }

  function performRoll(
    nextConfig = config,
    previousHistory = history,
    previousActive = activeRoll,
    useBestChanceResult = false,
  ) {
    let comparisonRoll = previousActive
    let comparisonHistory = previousHistory
    if (nextConfig.specialDieId === "luck" && !comparisonRoll) {
      const initialRoll = rollSkillTest({ config: { ...nextConfig, specialDieId: "none" }, attributes })
      if (initialRoll) {
        comparisonRoll = initialRoll
        comparisonHistory = [initialRoll, ...comparisonHistory]
      }
    }
    const roll = rollSkillTest({ config: nextConfig, attributes })
    if (!roll) return
    const allRolls = [roll, ...comparisonHistory]
    const nextHistory = allRolls.slice(0, historyLimit(allRolls))
    let displayed = roll
    if (nextConfig.specialDieId === "luck" && comparisonRoll && compareSkillRolls(comparisonRoll, roll) > 0) {
      displayed = comparisonRoll
    }
    if (useBestChanceResult) displayed = getBestSkillRoll(nextHistory) ?? roll
    setHistory(nextHistory)
    setActiveRoll(displayed)
    setResultMode("full")
  }

  useEffect(() => {
    if (!isReady || (!requestedSkillId && !requestedBondId && !requestedElementId) || !requestedRollToken || handledRollToken.current === requestedRollToken) return
    handledRollToken.current = requestedRollToken
    if (requestedElementId) {
      const source = findCharacterTestSource(character, requestedElementId)
      if (!source?.attributeKey) return
      const nextConfig: SkillTestConfig = { attributeKey: source.attributeKey, skillName: source.name, skillModifier: source.modifier, masterModifier: 0, otherModifiers: 0, specialDieId: "none" }
      setConfig(nextConfig)
      setParserMessage(`Teste de ${source.name} preenchido e rolado a partir da ficha.`)
      performRoll(nextConfig, [], null)
      return
    }
    if (requestedBondId) {
      const bond = bonds.find((item) => item.id === requestedBondId)
      if (!bond) return
      const nextConfig = configFromBond(bond, stats)
      setConfig(nextConfig)
      setParserMessage(`Primeiras Impressões com ${bond.name} preenchidas e roladas a partir da ficha.`)
      performRoll(nextConfig, [], null)
      return
    }
    const skill = skills.find((item) => item.id === requestedSkillId)
    if (!skill?.attributeKey) return
    const nextConfig = configFromSkill(skill)
    setConfig(nextConfig)
    setParserMessage(`Teste de ${skill.name} preenchido e rolado a partir da ficha.`)
    performRoll(nextConfig, [], null)
    // performRoll usa o snapshot atual; o token abaixo é a fonte de disparo e impede repetições.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonds, character, isReady, requestedBondId, requestedElementId, requestedRollToken, requestedSkillId, skills, stats])

  function updateStats(updates: Partial<typeof stats>) {
    updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, ...updates } }))
  }

  function rollQuickTest() {
    const diceRolls: [number, number] = [Math.floor(Math.random() * 10) + 1, Math.floor(Math.random() * 10) + 1]
    const diceSum = diceRolls[0] + diceRolls[1]
    const margin = quickTest - diceSum
    const label = diceRolls[0] === 1 && diceRolls[1] === 1
      ? "Sucesso Crítico"
      : diceRolls[0] === 10 && diceRolls[1] === 10
        ? "Fracasso Crítico"
        : `${margin >= 0 ? "Sucesso" : "Fracasso"} por ${margin >= 0 ? "+" : ""}${margin}`
    setQuickResult({ diceRolls, diceSum, margin, label })
    setResultMode("quick")
  }

  function applyQuickExpression() {
    const parsed = parseSkillExpression(quickExpression, skills)
    const nextConfig: SkillTestConfig = {
      attributeKey: parsed.attributeKey,
      skillName: parsed.skillName,
      skillModifier: parsed.skillModifier,
      masterModifier: parsed.masterModifier,
      otherModifiers: 0,
      specialDieId: parsed.specialDieId,
    }
    setConfig(nextConfig)
    clearRolls()
    if (!parsed.attributeKey && parsed.source !== "empty") {
      setParserMessage("Perícia exclusiva: selecione manualmente o atributo para liberar a rolagem.")
    } else if (parsed.source === "system-skill") {
      setParserMessage("Perícia encontrada no sistema, mas ausente da ficha: Mod. -3 aplicado.")
    } else if (parsed.source === "empty") {
      setParserMessage("Digite um atributo ou uma perícia.")
    } else {
      setParserMessage("Campos preenchidos a partir da entrada rápida.")
    }
  }

  function useDetermination() {
    if (!activeRoll || stats.determination <= 0) return
    const isCritical = activeRoll.outcome === "critical-success" || activeRoll.outcome === "critical-failure"
    if (isCritical) return
    const modified = applyDeterminationToRoll(activeRoll)
    setHistory((rolls) => rolls.map((roll) => roll.id === activeRoll.id ? modified : roll))
    setActiveRoll(modified)
    updateStats({ determination: stats.determination - 1 })
  }

  function useCasualty() {
    if (!activeRoll || stats.casualty <= 0) return
    const isChance = normalizeSkillName(activeRoll.skillName) === "acaso"
    const isCritical = activeRoll.outcome === "critical-success" || activeRoll.outcome === "critical-failure"
    if (!isChance && isCritical) return
    updateStats({ casualty: stats.casualty - 1 })
    performRoll(config, history, activeRoll, isChance)
  }

  function rollTest() {
    performRoll()
    if (window.matchMedia("(max-width: 767px)").matches) {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }))
    }
  }

  if (!isReady) {
    return <section className="rounded-[24px] border border-border bg-card p-6 text-sm text-muted-foreground">Carregando dados da ficha…</section>
  }

  const activeIsChance = normalizeSkillName(activeRoll?.skillName ?? "") === "acaso"
  const determinationBlocked = !!activeRoll && (
    activeRoll.outcome === "critical-success" || activeRoll.outcome === "critical-failure"
  )
  const casualtyBlocked = !!activeRoll && !activeIsChance && (
    activeRoll.outcome === "critical-success" || activeRoll.outcome === "critical-failure"
  )
  const attributeValue = config.attributeKey ? calculateAttributeTest(attributes, config.attributeKey) : null

  return (
    <section aria-label="Recursos da Calculadora de Testes" className="min-w-0 max-w-full overflow-x-clip">
      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,390px)] lg:items-start">
        <div className="order-2 min-w-0 rounded-[24px] border border-border bg-card p-4 shadow-sm sm:p-6 lg:order-1">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <article className="min-w-0 rounded-[20px] border border-border bg-muted/30 p-3 sm:p-4">
          <h2 className="text-sm font-bold text-foreground">Teste rápido</h2>
          <p className="mt-1 text-xs text-muted-foreground">Informe o total do teste e role 2d10 sem abrir o resumo.</p>
          <div className="mt-3 flex min-w-0 gap-2">
            <SkillIntegerInput value={quickTest} onChange={setQuickTest} label="Valor do teste rápido" className="h-11 w-full flex-1 text-base font-semibold" />
            <button type="button" onClick={rollQuickTest} className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110" aria-label="Rolar teste rápido">
              <Dices className="size-5" />
            </button>
          </div>
        </article>

        <article className="min-w-0 rounded-[20px] border border-border bg-muted/30 p-3 sm:p-4">
          <h2 className="text-sm font-bold text-foreground">Entrada rápida</h2>
          <p className="mt-1 text-xs text-muted-foreground">Formato: Força+4 (lendário) ou Lâminas-2 (sorte).</p>
          <div className="mt-3 flex flex-col gap-2 min-[430px]:flex-row">
            <input
              type="text"
              value={quickExpression}
              maxLength={80}
              onChange={(event) => setQuickExpression(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) applyQuickExpression()
              }}
              placeholder="Força+4 (lendário)"
              aria-label="Entrada rápida de teste"
              className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background/65 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
            <button type="button" onClick={applyQuickExpression} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold text-secondary-foreground transition hover:bg-accent">
              <WandSparkles className="size-4" /> Preencher
            </button>
          </div>
          {parserMessage && <p className="mt-2 text-xs text-muted-foreground">{parserMessage}</p>}
        </article>
          </div>

          <article className="mt-5 min-w-0 rounded-[22px] border border-border bg-muted/25 p-3 sm:p-5">
        <div className="mb-4 flex min-w-0 items-start gap-2">
          <Sparkles className="size-4.5 text-primary" />
          <div className="min-w-0">
            <h2 className="font-bold text-foreground">Calculadora de testes</h2>
            <p className="text-xs text-muted-foreground">A rolagem usa o atributo primário + secundário e todos os modificadores abaixo.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="min-w-0">
            <FieldLabel>Atributo</FieldLabel>
            <span className="relative block">
              <select
                value={config.attributeKey}
                onChange={(event) => changeConfig("attributeKey", event.target.value as SecondaryAttributeKey | "")}
                className="h-11 w-full appearance-none rounded-xl border border-input bg-background/65 px-3 pr-9 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
              >
                <option value="">Selecione</option>
                {damageAttributes.map((attribute) => <option key={attribute.key} value={attribute.key}>{attribute.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </span>
            <span className="mt-1 block text-[0.65rem] text-muted-foreground">Valor: {attributeValue ?? "—"}</span>
          </label>
          <label className="min-w-0">
            <FieldLabel>Perícia (opcional)</FieldLabel>
            <input
              type="text"
              value={config.skillName}
              maxLength={30}
              onChange={(event) => {
                const name = event.target.value.slice(0, 30)
                const saved = findCharacterSkill(skills, name)
                setConfig((current) => ({
                  ...current,
                  skillName: name,
                  skillModifier: saved
                    ? calculateSkillModifier(saved)
                    : name.trim()
                      ? current.skillModifier
                      : 0,
                  attributeKey: saved?.attributeKey || current.attributeKey,
                }))
                clearRolls()
              }}
              className="h-11 w-full rounded-xl border border-input bg-background/65 px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
          <label>
            <FieldLabel>Mod. da perícia</FieldLabel>
            <SkillIntegerInput value={config.skillModifier} onChange={(value) => changeConfig("skillModifier", value)} label="Modificador da perícia" className="h-11 w-full" />
          </label>
          <label>
            <FieldLabel>Mod. do Mestre</FieldLabel>
            <SkillIntegerInput value={config.masterModifier} onChange={(value) => changeConfig("masterModifier", value)} label="Modificador do Mestre" className="h-11 w-full" />
          </label>
          <label>
            <FieldLabel>Outros Mod.</FieldLabel>
            <SkillIntegerInput value={config.otherModifiers} onChange={(value) => changeConfig("otherModifiers", value)} label="Outros modificadores" className="h-11 w-full" />
          </label>
          <div>
            <FieldLabel>Dado especial?</FieldLabel>
            <div className="grid h-11 grid-cols-2 overflow-hidden rounded-xl border border-input bg-background/65 p-1">
              <button type="button" onClick={() => changeConfig("specialDieId", "none")} className={cn("rounded-lg text-sm font-semibold transition", config.specialDieId === "none" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground")}>Não</button>
              <button type="button" onClick={() => changeConfig("specialDieId", config.specialDieId === "none" ? "luck" : config.specialDieId)} className={cn("rounded-lg text-sm font-semibold transition", config.specialDieId !== "none" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground")}>Sim</button>
            </div>
          </div>
          {config.specialDieId !== "none" && (
            <label className="relative min-w-0">
              <FieldLabel>Selecionar dado especial</FieldLabel>
              <select
                value={config.specialDieId}
                onChange={(event) => changeConfig("specialDieId", event.target.value as SpecialDieId)}
                className="h-11 w-full appearance-none rounded-xl border border-input bg-background/65 px-3 pr-9 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
              >
                {specialDice.filter((die) => die.id !== "none").map((die) => <option key={die.id} value={die.id}>{die.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 size-4 text-muted-foreground" />
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={rollTest}
          disabled={!config.attributeKey}
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          <Dices className="size-5" /> Rolar teste
        </button>
        {!config.attributeKey && <p className="mt-2 text-xs text-destructive">Selecione um atributo para habilitar a rolagem.</p>}
          </article>
        </div>

        <aside className="order-1 min-w-0 space-y-4 lg:order-2 lg:sticky lg:top-24">
          <SkillTestResultPanel
            activeRoll={activeRoll}
            quickResult={quickResult}
            resultMode={resultMode}
            determination={stats.determination}
            casualty={stats.casualty}
            determinationBlocked={determinationBlocked}
            casualtyBlocked={casualtyBlocked}
            onUseDetermination={useDetermination}
            onUseCasualty={useCasualty}
          />

          {history.length > 0 && resultMode === "full" && (
            <article className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="inline-flex items-center gap-2 font-bold"><History className="size-4" /> Histórico</h2>
                <span className="text-xs text-muted-foreground">{history.length}/{historyLimit(history)}</span>
              </div>
              <ol className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {history.map((roll) => (
                  <li key={roll.id} className={cn("rounded-xl border px-3 py-2 text-sm", roll.id === activeRoll?.id ? "border-primary/55 bg-primary/10" : "border-border bg-background/55")}>
                    <strong>{formatTestOutcome(roll)}</strong>
                    <span className="ml-2 text-muted-foreground">({roll.diceRolls[0]} + {roll.diceRolls[1]} = {roll.diceSum})</span>
                  </li>
                ))}
              </ol>
            </article>
          )}
        </aside>
      </div>
    </section>
  )
}
