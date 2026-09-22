"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CircleDollarSign, Dices, History } from "lucide-react"
import { cronosAttributes } from "@runas/cronos-core/data/attributes"
import type { CronosAttributeKey } from "@runas/cronos-core/types/character"
import { calculateSkillLevel } from "@runas/core/lib/skillCalculations"
import { Button } from "@/components/ui/button"
import { NumberInput } from "@/components/ui/number-input"
import { SelectField } from "@/components/ui/select-field"
import { useCronosCharacter } from "./cronos-character-provider"
import { createId } from "@runas/core/lib/ids"

interface DiceResult {
  id: string
  dice: [number, number]
  total: number
  target: number
  margin: number
  outcome: string
}

interface CoinResult {
  id: string
  choice: "heads" | "tails"
  face: "heads" | "tails"
  success: boolean
}

const attributeOptions = cronosAttributes.map((attribute) => ({ value: attribute.key, label: attribute.name }))

export function CronosSkillTestCalculator() {
  const { character, isReady } = useCronosCharacter()
  const searchParams = useSearchParams()
  const processedRoll = useRef("")
  const [attributeKey, setAttributeKey] = useState<CronosAttributeKey>("strength")
  const [skillId, setSkillId] = useState("")
  const [masterModifier, setMasterModifier] = useState(0)
  const [otherModifiers, setOtherModifiers] = useState(0)
  const [luck, setLuck] = useState(false)
  const [coinChoice, setCoinChoice] = useState<"heads" | "tails">("heads")
  const [diceHistory, setDiceHistory] = useState<DiceResult[]>([])
  const [coinHistory, setCoinHistory] = useState<CoinResult[]>([])

  const selectedSkill = character.skills.find((skill) => skill.id === skillId)
  const skillModifier = selectedSkill ? calculateSkillLevel(selectedSkill.points) + selectedSkill.modifier : 0
  const target = character.attributes[attributeKey] + skillModifier + masterModifier + otherModifiers
  const latestDice = diceHistory[0]
  const latestCoin = coinHistory[0]
  const skillOptions = useMemo(() => [{ value: "", label: "Nenhuma" }, ...character.skills.map((skill) => ({ value: skill.id, label: skill.name }))], [character.skills])

  function selectSkill(id: string) {
    setSkillId(id)
    const skill = character.skills.find((entry) => entry.id === id)
    if (skill?.attributeKey) setAttributeKey(skill.attributeKey)
  }

  function roll() {
    if (luck) {
      const face: CoinResult["face"] = Math.random() < 0.5 ? "heads" : "tails"
      setCoinHistory((history) => [{ id: createId(), choice: coinChoice, face, success: face === coinChoice }, ...history].slice(0, 20))
      return
    }
    const dice: [number, number] = [Math.floor(Math.random() * 10) + 1, Math.floor(Math.random() * 10) + 1]
    const total = dice[0] + dice[1]
    const margin = target - total
    const outcome = dice[0] === 1 && dice[1] === 1 ? "Sucesso Crítico" : dice[0] === 10 && dice[1] === 10 ? "Fracasso Crítico" : margin >= 0 ? "Sucesso" : "Fracasso"
    setDiceHistory((history) => [{ id: createId(), dice, total, target, margin, outcome }, ...history].slice(0, 20))
  }

  useEffect(() => {
    if (!isReady) return
    const requestedSkillId = searchParams.get("skill") ?? ""
    const rollToken = searchParams.get("roll") ?? ""
    const requestedSkill = character.skills.find((skill) => skill.id === requestedSkillId)
    if (!requestedSkill) return
    setSkillId(requestedSkill.id)
    if (requestedSkill.attributeKey) setAttributeKey(requestedSkill.attributeKey)
    if (!rollToken || processedRoll.current === rollToken || !requestedSkill.attributeKey) return
    processedRoll.current = rollToken
    const requestedTarget = character.attributes[requestedSkill.attributeKey] + calculateSkillLevel(requestedSkill.points) + requestedSkill.modifier
    const dice: [number, number] = [Math.floor(Math.random() * 10) + 1, Math.floor(Math.random() * 10) + 1]
    const total = dice[0] + dice[1]
    const margin = requestedTarget - total
    const outcome = dice[0] === 1 && dice[1] === 1 ? "Sucesso Crítico" : dice[0] === 10 && dice[1] === 10 ? "Fracasso Crítico" : margin >= 0 ? "Sucesso" : "Fracasso"
    setDiceHistory((history) => [{ id: createId(), dice, total, target: requestedTarget, margin, outcome }, ...history].slice(0, 20))
  }, [character.attributes, character.skills, isReady, searchParams])

  if (!isReady) return <section className="rounded-[24px] border border-border bg-card p-6 text-sm text-muted-foreground">Carregando dados da ficha de Cronos…</section>

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:items-start">
      <div className="rounded-[24px] border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-bold text-card-foreground">Teste de Cronos</h2><p className="mt-1 text-sm text-muted-foreground">Role 2d10 ou transforme o teste em uma escolha de cara ou coroa.</p></div>
          <Dices className="size-6 text-primary" />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <SelectField label="Atributo" value={attributeKey} onChange={(value) => setAttributeKey(value as CronosAttributeKey)} options={attributeOptions} />
          <SelectField label="Perícia" value={skillId} onChange={selectSkill} options={skillOptions} />
          <NumberInput label="Mod. do Mestre" value={masterModifier} onChange={(value) => setMasterModifier(Math.trunc(value))} />
          <NumberInput label="Outros modificadores" value={otherModifiers} onChange={(value) => setOtherModifiers(Math.trunc(value))} />
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-border bg-muted/35 p-3"><dt className="text-[0.65rem] uppercase text-muted-foreground">Atributo</dt><dd className="mt-1 text-lg font-bold">{character.attributes[attributeKey]}</dd></div>
          <div className="rounded-xl border border-border bg-muted/35 p-3"><dt className="text-[0.65rem] uppercase text-muted-foreground">Perícia</dt><dd className="mt-1 text-lg font-bold">{skillModifier >= 0 ? "+" : ""}{skillModifier}</dd></div>
          <div className="rounded-xl border border-primary/25 bg-primary/10 p-3"><dt className="text-[0.65rem] uppercase text-muted-foreground">Teste total</dt><dd className="mt-1 text-lg font-bold text-primary">{target}</dd></div>
        </dl>

        <label className="mt-5 flex items-center gap-3 rounded-[18px] border border-border bg-muted/25 p-4 text-sm font-bold text-foreground"><input type="checkbox" checked={luck} onChange={(event) => setLuck(event.target.checked)} className="size-4 accent-primary" /> Teste de Sorte</label>
        {luck && <div className="mt-3 grid grid-cols-2 gap-2 rounded-[18px] border border-border bg-background/60 p-2"><button type="button" onClick={() => setCoinChoice("heads")} className={`min-h-11 rounded-xl text-sm font-bold transition ${coinChoice === "heads" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Cara</button><button type="button" onClick={() => setCoinChoice("tails")} className={`min-h-11 rounded-xl text-sm font-bold transition ${coinChoice === "tails" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Coroa</button></div>}
        <Button type="button" size="lg" className="mt-5 w-full sm:w-auto" onClick={roll}>{luck ? <CircleDollarSign /> : <Dices />}{luck ? "Lançar moeda" : "Rolar teste"}</Button>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24">
        <div className="flex min-h-72 flex-col items-center justify-center rounded-[24px] border border-panel-border/60 bg-panel p-6 text-center text-white shadow-lg">
          {luck && latestCoin ? <><span className={`grid size-28 place-items-center rounded-full border-4 text-xl font-black shadow-[0_0_35px_color-mix(in_srgb,var(--highlight)_30%,transparent)] ${latestCoin.face === "heads" ? "border-highlight bg-highlight text-highlight-foreground" : "border-panel-border bg-panel-input text-white"}`}>{latestCoin.face === "heads" ? "CARA" : "COROA"}</span><strong className={`mt-6 text-3xl ${latestCoin.success ? "text-emerald-300" : "text-red-300"}`}>{latestCoin.success ? "SUCESSO" : "FRACASSO"}</strong><p className="mt-2 text-sm text-panel-muted">Você escolheu {latestCoin.choice === "heads" ? "cara" : "coroa"}.</p></> : !luck && latestDice ? <><p className="text-xs font-bold uppercase tracking-[0.16em] text-panel-muted">Resultado</p><strong className={`mt-3 text-3xl ${latestDice.margin >= 0 ? "text-emerald-300" : "text-red-300"}`}>{latestDice.outcome}</strong><p className="mt-4 text-xl"><span className="text-panel-muted">{latestDice.dice[0]} + {latestDice.dice[1]}</span> = <b>{latestDice.total}</b></p><p className="mt-2 text-sm text-panel-muted">Margem {latestDice.margin >= 0 ? "+" : ""}{latestDice.margin}</p></> : <><span className="grid size-16 place-items-center rounded-full bg-panel-elevated"><Dices className="size-8" /></span><strong className="mt-4">Nenhum teste rolado</strong></>}
        </div>
        {(luck ? coinHistory.length : diceHistory.length) > 0 && <div className="rounded-[20px] border border-border bg-card p-4"><h3 className="flex items-center gap-2 font-bold"><History className="size-4" /> Histórico</h3><ol className="mt-3 max-h-64 space-y-2 overflow-y-auto">{luck ? coinHistory.map((result) => <li key={result.id} className="rounded-xl border border-border bg-background/55 px-3 py-2 text-sm"><b>{result.success ? "Sucesso" : "Fracasso"}</b> · {result.face === "heads" ? "Cara" : "Coroa"}</li>) : diceHistory.map((result) => <li key={result.id} className="rounded-xl border border-border bg-background/55 px-3 py-2 text-sm"><b>{result.outcome}</b> · {result.dice[0]} + {result.dice[1]} = {result.total}</li>)}</ol></div>}
      </aside>
    </section>
  )
}
