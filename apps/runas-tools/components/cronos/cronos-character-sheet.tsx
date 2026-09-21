"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import { Brain, BrainCircuit, Check, Dices, Download, Dumbbell, Eye, Footprints, Gauge, HeartPulse, Loader2, Plus, RotateCcw, Search, Shield, ShieldCheck, Sparkles, Trash2, Upload, WandSparkles, Zap } from "lucide-react"
import type { RulesetCharacterEnvelope } from "@runas/ruleset-contracts"
import { cronosAttributes } from "@runas/cronos-core/data/attributes"
import { cronosElementOptions, getCronosElement } from "@runas/cronos-core/data/elements"
import { cronosFameScopes } from "@runas/cronos-core/data/fame"
import { cronosRaceOptions } from "@runas/cronos-core/data/races"
import { calculateAttributeMaximum, calculateCronosStats, calculateFameProgress } from "@runas/cronos-core/lib/calculations"
import { parseCronosCharacterFile } from "@runas/cronos-core/lib/characterStorage"
import type { CronosAbility, CronosAttributeKey, CronosCharacter, CronosFame, CronosInventoryItem, CronosSkill, CronosSpell } from "@runas/cronos-core/types/character"
import { CRONOS_CHARACTER_VERSION } from "@runas/cronos-core/types/character"
import type { AbilityCostType, CharacterAbility, CharacterAttributes, CharacterInfo, CharacterInventoryItem, CharacterNote, CharacterSkill, CharacterSpell, CharacterStats, SecondaryAttributeKey } from "@runas/core/types/character"
import { createEmptyCharacter } from "@runas/core/lib/characterStorage"
import { calculateInventoryLoad } from "@runas/core/lib/inventoryCalculations"
import { calculateSkillLevel, normalizeSkillName } from "@runas/core/lib/skillCalculations"
import { Button } from "@/components/ui/button"
import { NumberInput } from "@/components/ui/number-input"
import { SelectField } from "@/components/ui/select-field"
import { TextField } from "@/components/ui/text-field"
import { cn } from "@/lib/utils"
import type { CharacterTab } from "@/components/character/character-sheet"
import { CharacterAbilities } from "@/components/character/character-abilities"
import { CharacterInventory } from "@/components/character/character-inventory"
import { CharacterNotes } from "@/components/character/character-notes"
import { useCharacterPanel } from "@/components/character/character-panel"
import { CharacterSpells } from "@/components/character/character-spells"
import type { ImportedAbility } from "@/lib/abilityTransfer"
import type { ImportedInventoryItem } from "@/lib/inventoryTransfer"
import type { ImportedSpell } from "@/lib/spellTransfer"
import { useCronosCharacter } from "./cronos-character-provider"
import { CharacterPortraitEditor } from "@/components/character/character-portrait-editor"

interface Props {
  activeTab: CharacterTab
  onActiveTabChange: (tab: CharacterTab) => void
}

const tabs: { id: CharacterTab; label: string }[] = [
  { id: "information", label: "Informação" },
  { id: "statistics", label: "Estatísticas" },
  { id: "skills", label: "Perícias" },
  { id: "bonds", label: "Fama" },
  { id: "abilities", label: "Habilidades" },
  { id: "inventory", label: "Inventário" },
  { id: "spells", label: "Magias" },
  { id: "notes", label: "Anotações" },
]

const attributeOptions = [
  { value: "", label: "Sem atributo" },
  ...cronosAttributes.map((attribute) => ({ value: attribute.key, label: attribute.name })),
]

const coreAttributeByCronos: Record<CronosAttributeKey, SecondaryAttributeKey> = {
  strength: "strength",
  dexterity: "dexterity",
  mind: "intelligence",
  will: "faith",
  spirit: "power",
}

const attributeVisuals: Record<CronosAttributeKey, { icon: LucideIcon; tone: string }> = {
  strength: { icon: Dumbbell, tone: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300" },
  dexterity: { icon: Gauge, tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
  mind: { icon: Brain, tone: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  will: { icon: Shield, tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  spirit: { icon: Sparkles, tone: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300" },
}

function adaptCronosToBlue(character: CronosCharacter): { info: CharacterInfo; attributes: CharacterAttributes; stats: CharacterStats; skills: CharacterSkill[] } {
  const base = createEmptyCharacter()
  return {
    info: {
      ...base.info,
      currentYear: character.info.currentYear,
      race: character.info.race,
      species: character.info.species,
      sizeBase: character.info.sizeBase,
      sizeReal: character.info.sizeReal,
      sizeModifier: character.info.sizeModifier,
      sizeModifierBonus: character.info.sizeModifierBonus,
      weightBase: character.info.weightBase,
      weightBonus: character.info.weightBonus,
      weightReal: character.info.weightReal,
      scaleMultiplier: character.info.scaleMultiplier,
      birthDate: character.info.birthDate,
      age: character.info.age,
      region: character.info.region,
      archetype: character.info.archetype,
      characterClass: character.info.archetype,
      deity: character.info.deity,
      loadBase: character.info.loadBase,
    },
    attributes: {
      physical: character.attributes.strength,
      mental: character.attributes.mind,
      mystic: character.attributes.spirit,
      strength: character.attributes.strength,
      dexterity: character.attributes.dexterity,
      vitality: character.attributes.strength,
      intelligence: character.attributes.mind,
      knowledge: character.attributes.mind,
      social: character.attributes.will,
      faith: character.attributes.will,
      power: character.attributes.spirit,
      luck: character.attributes.will,
    },
    stats: {
      ...base.stats,
      pv: character.stats.lifeCurrent,
      pvBonus: character.stats.lifeBonus,
      pa: character.stats.auraEnabled ? character.stats.auraCurrent : 0,
      pe: character.stats.manaCurrent,
      peBonus: character.stats.manaBonus,
      resistances: character.stats.resistances,
      weaknesses: character.stats.weaknesses,
      elementId: character.stats.auraElementId,
      effects: character.stats.effects,
      currentLoad: character.stats.currentLoad,
      loadBonus: character.stats.loadBonus,
      movementBonus: character.stats.movementBonus,
    },
    skills: character.skills.map((skill) => ({ ...skill, attributeKey: skill.attributeKey ? coreAttributeByCronos[skill.attributeKey] : "" })),
  }
}

function randomId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function Section({ children, label }: { children: React.ReactNode; label: string }) {
  return <section aria-label={label} className="rounded-b-[27px] border border-border bg-card p-4 shadow-sm sm:p-7">{children}</section>
}

function ResourceCard({ label, icon: Icon, tone, current, maximum, bonus, onCurrentChange, onBonusChange }: { label: string; icon: LucideIcon; tone: string; current: number; maximum: number; bonus: number; onCurrentChange: (value: number) => void; onBonusChange: (value: number) => void }) {
  return (
    <article className={cn("overflow-hidden rounded-[20px] border shadow-sm", tone)}>
      <div className="flex items-center gap-2.5 px-3 py-3"><span className="grid size-9 place-items-center rounded-xl bg-background/75 shadow-sm"><Icon className="size-5" /></span><h3 className="text-sm font-black text-foreground">{label}</h3><strong className="ml-auto text-xl tabular-nums text-foreground">{current}/{maximum}</strong></div>
      <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
        <div className="bg-card p-2"><NumberInput label="Atual" value={current} min={0} max={maximum} onChange={onCurrentChange} /></div>
        <div className="bg-muted/40 p-2"><NumberInput label="Máximo" value={maximum} readOnly onChange={() => undefined} /></div>
        <div className="bg-card p-2"><NumberInput label="Bônus" value={bonus} onChange={onBonusChange} /></div>
      </div>
    </article>
  )
}

export function CronosCharacterSheet({ activeTab, onActiveTabChange }: Props) {
  const { character, updateCharacter, replaceCharacter, resetCharacter, saveStatus, isReady } = useCronosCharacter()
  const importRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState("")

  const snapshot = useMemo(() => calculateCronosStats(
    character.attributes,
    character.info.synchronization,
    character.info.evolution,
    { life: character.stats.lifeBonus, mana: character.stats.manaBonus, sanity: character.stats.sanityBonus, movement: character.stats.movementBonus },
    character.info.sizeModifier,
  ), [character.attributes, character.info.evolution, character.info.sizeModifier, character.info.synchronization, character.stats.lifeBonus, character.stats.manaBonus, character.stats.movementBonus, character.stats.sanityBonus])
  const blueContext = useMemo(() => adaptCronosToBlue(character), [character])
  const attributePointsSpent = useMemo(() => Object.values(character.attributes).reduce((sum, value) => sum + value, 0), [character.attributes])

  function applyCost(costType: Exclude<AbilityCostType, "none" | "other">, amount: number) {
    updateCharacter((previous) => {
      const stats = { ...previous.stats }
      if (costType === "pv") stats.lifeCurrent = Math.max(0, stats.lifeCurrent - amount)
      else if (costType === "pe" || costType === "peTemporary") stats.manaCurrent = Math.max(0, stats.manaCurrent - amount)
      else stats.auraCurrent = Math.max(0, stats.auraCurrent - amount)
      return { ...previous, stats }
    })
  }

  function importAbilities(importedAbilities: ImportedAbility[]) {
    updateCharacter((previous) => {
      const abilities = [...previous.abilities]
      importedAbilities.forEach((imported, index) => {
        const identity = `${normalizeSkillName(imported.category)}::${normalizeSkillName(imported.name)}`
        const existing = abilities.findIndex((ability) => `${normalizeSkillName(ability.category)}::${normalizeSkillName(ability.name)}` === identity)
        if (existing >= 0) abilities[existing] = { ...abilities[existing], ...imported }
        else abilities.push({ id: randomId(`ability-import-${index}`), ...imported })
      })
      return { ...previous, abilities }
    })
  }

  function importSpells(importedSpells: ImportedSpell[]) {
    updateCharacter((previous) => {
      const spells = [...previous.spells]
      importedSpells.forEach((imported, index) => {
        const identity = `${normalizeSkillName(imported.category)}::${normalizeSkillName(imported.name)}`
        const existing = spells.findIndex((spell) => `${normalizeSkillName(spell.category)}::${normalizeSkillName(spell.name)}` === identity)
        if (existing >= 0) spells[existing] = { ...spells[existing], ...imported }
        else spells.push({ id: randomId(`spell-import-${index}`), ...imported })
      })
      return { ...previous, spells }
    })
  }

  /** Cria o registro pedido pelo painel de anexos do item e devolve o `id`. */
  function createAbilityForItem(ability: ImportedAbility): string {
    const id = randomId("ability")
    updateCharacter((previous) => ({ ...previous, abilities: [...previous.abilities, { id, ...ability } as CronosAbility] }))
    return id
  }

  function createSpellForItem(spell: ImportedSpell): string {
    const id = randomId("spell")
    updateCharacter((previous) => ({ ...previous, spells: [...previous.spells, { id, ...spell } as CronosSpell] }))
    return id
  }

  function importInventoryItems(importedItems: ImportedInventoryItem[]) {
    updateCharacter((previous) => {
      let equippedArmorExists = previous.inventory.some((item) => item.usage === "equipped" && item.equippedAsArmor)
      const spells = [...previous.spells]
      const abilities = [...previous.abilities]
      const findByName = <T extends { id: string; name: string }>(values: T[], name: string): string => values.find((value) => normalizeSkillName(value.name) === normalizeSkillName(name))?.id ?? ""
      const imported = importedItems.map((item, index): CronosInventoryItem => {
        const equippedAsArmor = item.usage === "equipped" && item.equippedAsArmor && !equippedArmorExists
        if (equippedAsArmor) equippedArmorExists = true
        const spellIds = item.spells.map((entry, spellIndex) => {
          const existing = spells.find((spell) => normalizeSkillName(spell.name) === normalizeSkillName(entry.name))
          if (existing) return existing.id
          const id = randomId(`spell-import-${index}-${spellIndex}`)
          spells.push({ id, ...entry } as CronosSpell)
          return id
        })
        const abilityIds = item.abilities.map((entry, abilityIndex) => {
          const existing = abilities.find((ability) => normalizeSkillName(ability.name) === normalizeSkillName(entry.name))
          if (existing) return existing.id
          const id = randomId(`ability-import-${index}-${abilityIndex}`)
          abilities.push({ id, ...entry } as CronosAbility)
          return id
        })
        return {
          id: randomId(`item-import-${index}`),
          usage: item.usage,
          name: item.name,
          type: item.type,
          affinity: 0,
          bondPoints: 0,
          baseWeight: item.baseWeight,
          size: item.size,
          mt: item.mt,
          quantity: item.quantity,
          applyScaleWeight: item.applyScaleWeight,
          damage: item.damage,
          rdf: item.rdf,
          rdm: item.rdm,
          equippedAsArmor,
          prCurrent: item.prCurrent,
          prMaximum: item.prMaximum,
          abilityIds,
          spellIds,
          bondId: "",
          skillId: findByName(previous.skills, item.skillName),
          description: item.description,
        }
      })
      const inventory = [...previous.inventory, ...imported]
      return { ...previous, spells, abilities, inventory, stats: { ...previous.stats, currentLoad: calculateInventoryLoad(inventory as CharacterInventoryItem[], previous.info.scaleMultiplier) } }
    })
  }

  function changeInfo<K extends keyof CronosCharacter["info"]>(key: K, value: CronosCharacter["info"][K]) {
    updateCharacter((previous) => ({ ...previous, info: { ...previous.info, [key]: value } }))
  }

  function exportCharacter() {
    const envelope: RulesetCharacterEnvelope<CronosCharacter> = { rulesetId: "cronos", schemaVersion: CRONOS_CHARACTER_VERSION, character }
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `${character.name.trim() || "personagem-cronos"}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function importCharacter(file: File | undefined) {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as RulesetCharacterEnvelope<CronosCharacter> | CronosCharacter
      if ("rulesetId" in parsed && parsed.rulesetId !== "cronos") throw new Error("Este arquivo pertence a outro livro.")
      replaceCharacter(parseCronosCharacterFile(JSON.stringify("character" in parsed ? parsed.character : parsed)))
      setImportError("")
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Não foi possível importar a ficha.")
    } finally {
      if (importRef.current) importRef.current.value = ""
    }
  }

  if (!isReady) return <div className="rounded-[24px] border border-border bg-card p-8 text-sm text-muted-foreground">Carregando ficha de Cronos…</div>

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label className="text-xs font-semibold text-panel-muted" htmlFor="cronos-character-name">Nome do personagem</label>
          <input id="cronos-character-name" value={character.name} maxLength={80} onChange={(event) => updateCharacter((previous) => ({ ...previous, name: event.target.value }))} className="mt-1 h-11 w-full min-w-0 rounded-xl border border-panel-border bg-panel-input px-3.5 text-base font-bold text-white outline-none focus:ring-2 focus:ring-highlight/45 sm:w-72" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-panel-muted">{saveStatus === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-highlight" />}{saveStatus === "saving" ? "Salvando…" : "Salvo localmente"}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}><Upload /> Importar</Button>
          <Button type="button" variant="outline" size="sm" onClick={exportCharacter}><Download /> Exportar</Button>
          <Button type="button" variant="destructive" size="sm" onClick={resetCharacter}><RotateCcw /> Limpar</Button>
          <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void importCharacter(event.target.files?.[0])} />
        </div>
      </div>
      {importError && <p role="alert" className="mb-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{importError}</p>}

      <nav className="scrollbar-none flex overflow-x-auto rounded-t-[22px] border border-b-0 border-border bg-muted/45 p-1" aria-label="Seções da ficha de Cronos">
        {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => onActiveTabChange(tab.id)} className={cn("min-h-10 shrink-0 rounded-xl px-3 text-sm font-semibold transition", activeTab === tab.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>{tab.label}</button>)}
      </nav>

      {activeTab === "information" && (
        <Section label="Informações de Cronos">
          <div className="grid items-start gap-4 sm:grid-cols-[12.5rem_minmax(0,1fr)]">
            <CharacterPortraitEditor value={character.portraitDataUrl} onChange={(portraitDataUrl) => updateCharacter((previous) => ({ ...previous, portraitDataUrl }))} />
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <NumberInput label="Ano atual (A.L.)" value={Number(character.info.currentYear) || 7840} min={0} onChange={(value) => changeInfo("currentYear", String(Math.trunc(value)))} />
              <SelectField label="Calendário" value="al" onChange={() => undefined} disabled options={[{ value: "al", label: "Após o Grande Luto (A.L.)" }]} />
              <SelectField label="Raça" value={character.info.race} onChange={(value) => changeInfo("race", value)} options={cronosRaceOptions} />
              <TextField label="Espécie" value={character.info.species} onChange={(value) => changeInfo("species", value)} />
              <TextField label="Nascimento" value={character.info.birthDate} onChange={(value) => changeInfo("birthDate", value)} placeholder="Formato do calendário de Cronos" />
              <TextField label="Idade" value={character.info.age} onChange={(value) => changeInfo("age", value)} />
              <TextField label="Região" value={character.info.region} onChange={(value) => changeInfo("region", value)} />
              <TextField label="Arquétipo" value={character.info.archetype} onChange={(value) => changeInfo("archetype", value)} />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberInput label="Sincronia (calculada pelos PS)" value={character.info.synchronization} min={1} max={5} readOnly onChange={() => undefined} />
            <NumberInput label="Pts. de Sinc. (PS)" value={character.info.synchronizationPoints} min={0} onChange={(value) => changeInfo("synchronizationPoints", Math.trunc(value))} />
            <NumberInput label="Nível Mágico" value={character.info.magicLevel} min={0} onChange={(value) => changeInfo("magicLevel", Math.trunc(value))} />
            <TextField label="Divindade" value={character.info.deity} onChange={(value) => changeInfo("deity", value)} />
            <label className="flex min-h-11 items-center gap-3 self-end px-1 text-sm font-semibold text-foreground"><input type="checkbox" checked={character.info.evolution} onChange={(event) => changeInfo("evolution", event.target.checked)} className="size-4 accent-primary" /> Evolução?</label>
          </div>
          <h3 className="mt-7 border-t border-border pt-5 text-sm font-bold text-foreground">Escala, dimensões e peso</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["sizeBase", "sizeReal", "sizeModifier", "sizeModifierBonus", "weightBase", "weightBonus", "weightReal", "scaleMultiplier", "loadBase"] as const).map((key) => {
              const derived = key === "sizeModifier" || key === "weightReal" || key === "scaleMultiplier" || key === "loadBase"
              return <TextField key={key} label={({ sizeBase: "Altura base", sizeReal: "Altura real", sizeModifier: "Mod. tamanho", sizeModifierBonus: "Bônus de tamanho", weightBase: "Peso base", weightBonus: "Bônus de peso", weightReal: "Peso real", scaleMultiplier: "Multiplicador de escala (MT)", loadBase: "Carga base" } as const)[key]} value={character.info[key]} readOnly={derived} onChange={(value) => changeInfo(key, value)} />
            })}
          </div>
        </Section>
      )}

      {activeTab === "statistics" && (
        <Section label="Estatísticas de Cronos">
          <div className="mb-4 flex justify-end">
            <Button type="button" variant="secondary" onClick={() => updateCharacter((previous) => ({
              ...previous,
              stats: {
                ...previous.stats,
                lifeCurrent: snapshot.lifeMaximum,
                manaCurrent: snapshot.manaMaximum,
                auraCurrent: previous.stats.auraEnabled ? previous.stats.auraMaximum : previous.stats.auraCurrent,
              },
            }))}><RotateCcw /> Restaurar vida, mana e aura</Button>
          </div>
          <div className="mb-4 grid gap-3 rounded-[20px] border border-border bg-muted/25 p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
            <div><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pontos de atributos gastos</span><strong className="mt-1 block text-2xl tabular-nums text-foreground">{attributePointsSpent} / {character.info.attributePointMaximum}</strong><p className="mt-1 text-xs text-muted-foreground">Soma de Força, Destreza, Mente, Vontade e Espírito.</p></div>
            <NumberInput label="Máximo de pontos" value={character.info.attributePointMaximum} min={0} onChange={(value) => changeInfo("attributePointMaximum", Math.trunc(value))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {cronosAttributes.map((attribute) => {
              const maximum = calculateAttributeMaximum(character.info.synchronization, attribute.key, character.synchronizationFiveAttribute)
              const bonus = character.attributes[attribute.key] - 10
              const visual = attributeVisuals[attribute.key]
              const Icon = visual.icon
              return <article key={attribute.key} className={cn("rounded-[20px] border p-3 shadow-sm", visual.tone)}><div className="mb-3 flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-background/75"><Icon className="size-5" /></span><span><strong className="block text-sm text-foreground">{attribute.name}</strong><small className="text-[0.65rem] text-muted-foreground">Máximo {maximum}</small></span></div><div className="flex items-end gap-2"><NumberInput label="Valor" value={character.attributes[attribute.key]} min={0} max={maximum} onChange={(value) => updateCharacter((previous) => ({ ...previous, attributes: { ...previous.attributes, [attribute.key]: Math.trunc(value) } }))} className="min-w-0 flex-1" /><div className="flex flex-col gap-1.5"><span className="text-xs font-medium text-muted-foreground">Bônus</span><output aria-label={`Bônus de ${attribute.name}: ${bonus >= 0 ? "+" : ""}${bonus}`} className="flex h-11 min-w-12 items-center justify-center rounded-xl border border-current/20 bg-background/70 px-2 text-sm font-black tabular-nums text-foreground">{bonus >= 0 ? "+" : ""}{bonus}</output></div></div></article>
            })}
          </div>
          {character.info.synchronization === 5 && <SelectField label="Atributo elevado pela Sincronia 5 (+4 no máximo)" value={character.synchronizationFiveAttribute ?? ""} onChange={(value) => updateCharacter((previous) => ({ ...previous, synchronizationFiveAttribute: (value || null) as CronosAttributeKey | null }))} options={attributeOptions} className="mt-4 max-w-sm" />}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <ResourceCard label="Pontos de Vida" icon={HeartPulse} tone="border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300" current={character.stats.lifeCurrent} maximum={snapshot.lifeMaximum} bonus={character.stats.lifeBonus} onCurrentChange={(lifeCurrent) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, lifeCurrent } }))} onBonusChange={(lifeBonus) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, lifeBonus } }))} />
            <ResourceCard label="Pontos de Mana" icon={WandSparkles} tone="border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300" current={character.stats.manaCurrent} maximum={snapshot.manaMaximum} bonus={character.stats.manaBonus} onCurrentChange={(manaCurrent) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, manaCurrent } }))} onBonusChange={(manaBonus) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, manaBonus } }))} />
            <ResourceCard label="Sanidade" icon={BrainCircuit} tone="border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" current={character.stats.sanityCurrent} maximum={snapshot.sanityMaximum} bonus={character.stats.sanityBonus} onCurrentChange={(sanityCurrent) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, sanityCurrent } }))} onBonusChange={(sanityBonus) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, sanityBonus } }))} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[{ label: "Resistência Mental", value: snapshot.mentalResistance, icon: ShieldCheck, tone: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300" }, { label: "Deslocamento", value: `${snapshot.movement.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`, icon: Footprints, tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" }, { label: "Percepção", value: snapshot.perception, icon: Eye, tone: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300" }, { label: "Reflexos", value: snapshot.reflexes, icon: Zap, tone: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300" }].map((item) => { const Icon = item.icon; return <article key={item.label} className={cn("flex items-center gap-3 rounded-[18px] border p-4", item.tone)}><span className="grid size-11 place-items-center rounded-xl bg-background/70"><Icon className="size-5" /></span><span><small className="font-medium text-muted-foreground">{item.label}</small><strong className="block text-xl text-foreground">{item.value}</strong></span></article> })}
          </div>
          <div className="mt-6 rounded-[22px] border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-muted/30 to-fuchsia-500/10 p-4">
            <label className="flex items-center gap-3 text-sm font-bold text-foreground"><span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300"><Shield className="size-5" /></span><input type="checkbox" checked={character.stats.auraEnabled} onChange={(event) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, auraEnabled: event.target.checked } }))} className="size-4 accent-primary" /> Possui Aura?</label>
            {character.stats.auraEnabled && <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><NumberInput label="PA atual" value={character.stats.auraCurrent} min={0} max={character.stats.auraMaximum} onChange={(auraCurrent) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, auraCurrent } }))} /><NumberInput label="PA máximo" value={character.stats.auraMaximum} min={0} onChange={(auraMaximum) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, auraMaximum } }))} /><SelectField label="Elemento da Aura" value={character.stats.auraElementId} onChange={(auraElementId) => updateCharacter((previous) => { const element = getCronosElement(auraElementId); return { ...previous, stats: { ...previous.stats, auraElementId, resistances: [...(element?.resistances ?? [])], weaknesses: [...(element?.weaknesses ?? [])] } } })} options={cronosElementOptions} /><TextField label="Resistências" value={character.stats.resistances.join(", ")} onChange={(value) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, resistances: value.split(",").map((item) => item.trim()).filter(Boolean) } }))} /><TextField label="Fraquezas" value={character.stats.weaknesses.join(", ")} onChange={(value) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, weaknesses: value.split(",").map((item) => item.trim()).filter(Boolean) } }))} /><TextField label="Efeitos" value={character.stats.effects} onChange={(effects) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, effects } }))} type="textarea" /></div>}
          </div>
        </Section>
      )}

      {activeTab === "skills" && <CronosSkills character={character} updateCharacter={updateCharacter} />}
      {activeTab === "bonds" && <CronosFameSection character={character} updateCharacter={updateCharacter} />}
      {activeTab === "abilities" && <CharacterAbilities characterName={character.name} abilities={character.abilities as CharacterAbility[]} stats={blueContext.stats} onAddAbility={(ability) => updateCharacter((previous) => ({ ...previous, abilities: [...previous.abilities, ability] }))} onImportAbilities={importAbilities} onAbilityChange={(id, updates) => updateCharacter((previous) => ({ ...previous, abilities: previous.abilities.map((ability) => ability.id === id ? { ...ability, ...updates } : ability) }))} onRemoveAbility={(id) => updateCharacter((previous) => ({ ...previous, abilities: previous.abilities.filter((ability) => ability.id !== id) }))} onApplyCost={applyCost} />}
      {activeTab === "inventory" && <CharacterInventory variant="cronos" characterName={character.name} items={character.inventory as CharacterInventoryItem[]} info={blueContext.info} attributes={blueContext.attributes} stats={blueContext.stats} skills={blueContext.skills} bonds={[]} abilities={character.abilities as CharacterAbility[]} elements={[]} spells={character.spells as CharacterSpell[]} onCreateAbility={createAbilityForItem} onCreateSpell={createSpellForItem} onItemsChange={(items) => updateCharacter((previous) => ({ ...previous, inventory: items, stats: { ...previous.stats, currentLoad: calculateInventoryLoad(items, previous.info.scaleMultiplier) } }))} onImportItems={importInventoryItems} onLoadBonusChange={(loadBonus) => updateCharacter((previous) => ({ ...previous, stats: { ...previous.stats, loadBonus } }))} />}
      {activeTab === "spells" && <CharacterSpells variant="cronos" characterName={character.name} spells={character.spells as CharacterSpell[]} skills={blueContext.skills} attributes={blueContext.attributes} elements={[]} onElementsChange={() => undefined} stats={blueContext.stats} onAddSpell={(spell) => updateCharacter((previous) => ({ ...previous, spells: [...previous.spells, spell] }))} onImportSpells={importSpells} onSpellChange={(id, updates) => updateCharacter((previous) => ({ ...previous, spells: previous.spells.map((spell) => spell.id === id ? { ...spell, ...updates } : spell) }))} onRemoveSpell={(id) => updateCharacter((previous) => ({ ...previous, spells: previous.spells.filter((spell) => spell.id !== id) }))} onApplyCost={applyCost} />}
      {activeTab === "notes" && <CharacterNotes notes={character.notes as CharacterNote[]} onAddNote={(note) => updateCharacter((previous) => ({ ...previous, notes: [...previous.notes, note] }))} onNoteChange={(id, updates) => updateCharacter((previous) => ({ ...previous, notes: previous.notes.map((note) => note.id === id ? { ...note, ...updates } : note) }))} onRemoveNote={(id) => updateCharacter((previous) => ({ ...previous, notes: previous.notes.filter((note) => note.id !== id) }))} />}
    </div>
  )
}

type UpdateCharacter = (updater: (previous: CronosCharacter) => CronosCharacter) => void

function CronosSkills({ character, updateCharacter }: { character: CronosCharacter; updateCharacter: UpdateCharacter }) {
  const router = useRouter()
  const { close } = useCharacterPanel()
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<"name" | "test" | "level">("name")

  function updateSkill(id: string, updates: Partial<CronosSkill>) {
    updateCharacter((previous) => ({ ...previous, skills: previous.skills.map((skill) => skill.id === id ? { ...skill, ...updates } : skill) }))
  }

  function testValue(skill: CronosSkill): number | null {
    if (!skill.attributeKey) return null
    const attribute = character.attributes[skill.attributeKey]
    return Number.isFinite(attribute) ? attribute + calculateSkillLevel(skill.points) + skill.modifier : null
  }

  function rollSkill(skill: CronosSkill) {
    if (!skill.attributeKey) return
    close()
    router.push(`/calculadora-testes?skill=${encodeURIComponent(skill.id)}&roll=${encodeURIComponent(randomId("roll"))}`)
  }

  const normalizedQuery = normalizeSkillName(query)
  const visibleSkills = [...character.skills]
    .filter((skill) => !normalizedQuery || normalizeSkillName(skill.name).includes(normalizedQuery))
    .sort((left, right) => {
      if (sort === "test") return (testValue(right) ?? Number.NEGATIVE_INFINITY) - (testValue(left) ?? Number.NEGATIVE_INFINITY)
      if (sort === "level") return calculateSkillLevel(right.points) - calculateSkillLevel(left.points)
      return left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base", numeric: true })
    })

  return (
    <Section label="Perícias de Cronos">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(12rem,1fr)_10rem]">
          <label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Filtrar perícias</span><span className="flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-3"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome da perícia" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></span></label>
          <SelectField label="Ordenar por" value={sort} onChange={(value) => setSort(value as typeof sort)} options={[{ value: "name", label: "Nome" }, { value: "test", label: "Valor do teste" }, { value: "level", label: "Nível" }]} />
        </div>
        <Button type="button" variant="secondary" onClick={() => updateCharacter((previous) => ({ ...previous, skills: [...previous.skills, { id: randomId("skill"), name: "Nova perícia", attributeKey: "", points: 0, modifier: 0, locked: false }] }))}><Plus /> Adicionar perícia</Button>
      </div>
      <div className="mt-4 space-y-2">
        <div className="hidden grid-cols-[2.5rem_minmax(6rem,1fr)_4.5rem_4.5rem_7rem_4.5rem_4.5rem_2.5rem] gap-2 px-3 text-center text-[0.62rem] uppercase tracking-wide text-muted-foreground lg:grid"><span>Rolar</span><span>Nome</span><span>Teste</span><span>Nível</span><span>Atributo</span><span>Pontos</span><span>Mod.</span><span>Excluir</span></div>
        {visibleSkills.length === 0 && <p className="rounded-[18px] border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma perícia corresponde ao filtro.</p>}
        {visibleSkills.map((skill) => {
          const test = testValue(skill)
          const level = calculateSkillLevel(skill.points)
          return <article key={skill.id} className="grid gap-2 overflow-hidden rounded-[18px] border border-border bg-background/55 p-3 sm:grid-cols-2 lg:grid-cols-[2.5rem_minmax(6rem,1fr)_4.5rem_4.5rem_7rem_4.5rem_4.5rem_2.5rem] lg:items-end"><Button type="button" size="icon" variant="secondary" onClick={() => rollSkill(skill)} disabled={test === null} aria-label={`Rolar ${skill.name}`} className="self-end"><Dices /></Button><TextField label="Nome" value={skill.name} onChange={(name) => updateSkill(skill.id, { name })} /><div className="flex flex-col gap-1.5"><span className="text-xs font-medium text-muted-foreground">Teste</span><output className="flex h-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 px-2 text-sm font-black text-primary">{test ?? "—"}</output></div><div className="flex flex-col gap-1.5"><span className="text-xs font-medium text-muted-foreground">Nível</span><output className="flex h-11 items-center justify-center rounded-xl border border-input bg-muted/35 px-2 text-sm font-bold">{level}</output></div><SelectField label="Atributo" value={Number.isFinite(skill.attributeKey ? character.attributes[skill.attributeKey] : Number.NaN) ? skill.attributeKey : ""} onChange={(attributeKey) => updateSkill(skill.id, { attributeKey: attributeKey as CronosSkill["attributeKey"] })} options={attributeOptions} /><NumberInput label="Pontos" value={skill.points} onChange={(points) => updateSkill(skill.id, { points: Math.trunc(points) })} /><NumberInput label="Mod." value={skill.modifier} onChange={(modifier) => updateSkill(skill.id, { modifier: Math.trunc(modifier) })} /><button type="button" disabled={skill.locked} onClick={() => updateCharacter((previous) => ({ ...previous, skills: previous.skills.filter((entry) => entry.id !== skill.id) }))} className="grid size-10 place-items-center self-end rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-25" aria-label={`Remover ${skill.name}`}><Trash2 className="size-4" /></button></article>
        })}
      </div>
    </Section>
  )
}

function CronosFameSection({ character, updateCharacter }: { character: CronosCharacter; updateCharacter: UpdateCharacter }) {
  function updateFame(id: string, updates: Partial<CronosFame>) { updateCharacter((previous) => ({ ...previous, fame: previous.fame.map((entry) => entry.id === id ? { ...entry, ...updates } : entry) })) }
  return <Section label="Fama de Cronos"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">O alcance e o nível são determinados automaticamente pelos pontos.</p><Button type="button" variant="secondary" onClick={() => updateCharacter((previous) => ({ ...previous, fame: [...previous.fame, { id: randomId("fame"), name: "Nova fama", points: 0, locked: false }] }))}><Plus /> Adicionar fama</Button></div><div className="mt-4 space-y-2">{character.fame.map((entry) => { const progress = calculateFameProgress(entry.points); const scopeLabel = cronosFameScopes.find((scope) => scope.value === progress.scope)?.label ?? "Local"; return <div key={entry.id} className="grid gap-2 rounded-[18px] border border-border bg-background/55 p-3 sm:grid-cols-[minmax(10rem,1fr)_8rem_8rem_8rem_3rem]"><TextField label="Nome" value={entry.locked ? character.name : entry.name} onChange={(name) => updateFame(entry.id, { name })} /><NumberInput label="Pontos" value={entry.points} onChange={(points) => updateFame(entry.id, { points: Math.trunc(points) })} /><div className="flex flex-col gap-1.5"><span className="text-xs font-medium text-muted-foreground">Alcance</span><output className="flex h-11 items-center rounded-xl border border-input bg-muted/45 px-3 text-sm font-bold text-foreground">{scopeLabel}</output></div><div className="flex flex-col gap-1.5"><span className="text-xs font-medium text-muted-foreground">Nível de Fama</span><output className="flex h-11 items-center rounded-xl border border-primary/25 bg-primary/10 px-3 text-sm font-bold text-primary">{progress.level}</output></div><button type="button" disabled={entry.locked} onClick={() => updateCharacter((previous) => ({ ...previous, fame: previous.fame.filter((candidate) => candidate.id !== entry.id) }))} className="mt-auto grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-25" aria-label={`Remover ${entry.name}`}><Trash2 className="size-4" /></button></div> })}</div></Section>
}
