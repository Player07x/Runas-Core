"use client"

import dynamic from "next/dynamic"
import type {
  AttributeKey,
  AbilityCostType,
  CharacterAbility,
  CharacterCalendar,
  CharacterBond,
  CharacterInfo as InfoType,
  CharacterInventoryItem,
  CharacterNote,
  CharacterSpell,
  CharacterSkill,
  CharacterStats as StatsType,
} from "@runas/core/types/character"
import { attributeGroups } from "@runas/core/data/attributes"
import { systemSkills } from "@runas/core/data/skills"
import { calculateLoadBase, convertCalendarYear, deriveCharacterInfo, modifierToNumber } from "@runas/core/lib/characterCalculations"
import { calculateCharacterStatSnapshot } from "@runas/core/lib/characterStatCalculations"
import { normalizeSkillName } from "@runas/core/lib/skillCalculations"
import type { ImportedSkill } from "@/lib/skillImport"
import type { ImportedBond } from "@/lib/bondImport"
import type { ImportedAbility } from "@/lib/abilityTransfer"
import type { ImportedSpell } from "@/lib/spellTransfer"
import type { ImportedInventoryItem } from "@/lib/inventoryTransfer"
import { cn } from "@/lib/utils"
import { calculateEquippedArmorDefense, calculateInventoryLoad } from "@runas/core/lib/inventoryCalculations"
import { useCharacter } from "./character-provider"
import { CharacterActions } from "./character-actions"
import { SaveIndicator } from "./save-indicator"
import { createId, createPrefixedId } from "@runas/core/lib/ids"

const CharacterInfo = dynamic(() => import("./character-info").then((module) => module.CharacterInfo))
const CharacterStats = dynamic(() => import("./character-stats").then((module) => module.CharacterStats))
const CharacterSkills = dynamic(() => import("./character-skills").then((module) => module.CharacterSkills))
const CharacterBonds = dynamic(() => import("./character-bonds").then((module) => module.CharacterBonds))
const CharacterAbilities = dynamic(() => import("./character-abilities").then((module) => module.CharacterAbilities))
const CharacterSpells = dynamic(() => import("./character-spells").then((module) => module.CharacterSpells))
const CharacterInventory = dynamic(() => import("./character-inventory").then((module) => module.CharacterInventory))
const CharacterNotes = dynamic(() => import("./character-notes").then((module) => module.CharacterNotes))

export type CharacterTab = "information" | "statistics" | "skills" | "bonds" | "abilities" | "inventory" | "spells" | "notes"

interface CharacterSheetProps {
  activeTab: CharacterTab
  onActiveTabChange: (tab: CharacterTab) => void
}

interface CharacterTabItem {
  id: CharacterTab | null
  label: string
}

const recordTabs: CharacterTabItem[] = [
  { id: "information", label: "Informação" },
  { id: "statistics", label: "Estatísticas" },
  { id: "skills", label: "Perícias" },
  { id: "bonds", label: "Vínculos" },
]
const featureTabs: CharacterTabItem[] = [
  { id: "abilities", label: "Habilidades" },
  { id: "inventory", label: "Inventário" },
  { id: "spells", label: "Magias" },
  { id: "notes", label: "Anotações" },
]

export function CharacterSheet({ activeTab, onActiveTabChange }: CharacterSheetProps) {
  const { character, updateCharacter, isReady } = useCharacter()

  function setName(value: string) {
    updateCharacter((prev) => ({ ...prev, name: value.slice(0, 80) }))
  }

  function setInfo(key: keyof InfoType, value: string) {
    updateCharacter((prev) => {
      let nextInfo: InfoType = { ...prev.info, [key]: value }
      if (key === "calendar" && (value === "logi" || value === "ce")) {
        nextInfo = {
          ...nextInfo,
          currentYear: convertCalendarYear(prev.info.currentYear, prev.info.calendar, value as CharacterCalendar),
          calendar: value,
        }
      }
      nextInfo = deriveCharacterInfo(nextInfo)
      nextInfo.loadBase = calculateLoadBase(prev.attributes.physical, prev.attributes.strength, nextInfo.scaleMultiplier)
      const stats = { ...prev.stats, mt: modifierToNumber(nextInfo.sizeModifier) }
      stats.currentLoad = calculateInventoryLoad(prev.inventory, nextInfo.scaleMultiplier)
      const snapshot = calculateCharacterStatSnapshot(prev.attributes, nextInfo, stats, prev.skills, prev.abilities)
      stats.paExtra = Math.min(stats.paExtra, snapshot.paExtraMax)
      stats.peTemporary = Math.min(stats.peTemporary, snapshot.peTemporaryMax)
      return {
        ...prev,
        info: nextInfo,
        stats,
      }
    })
  }

  function setAttribute(key: AttributeKey, value: number) {
    updateCharacter((prev) => {
      const attributes = { ...prev.attributes }
      const group = attributeGroups.find((item) => item.primary.key === key || item.attributes.some((attr) => attr.key === key))
      if (!group) return prev
      if (group.primary.key === key) {
        const primary = Math.max(1, Math.floor(value || 0))
        attributes[key] = primary
        for (const attribute of group.attributes) attributes[attribute.key] = Math.min(attributes[attribute.key], primary)
      } else {
        attributes[key] = Math.min(attributes[group.primary.key], Math.max(0, Math.floor(value || 0)))
      }
      const info = {
        ...prev.info,
        loadBase: calculateLoadBase(attributes.physical, attributes.strength, prev.info.scaleMultiplier),
      }
      const snapshot = calculateCharacterStatSnapshot(attributes, info, prev.stats, prev.skills, prev.abilities)
      return {
        ...prev,
        attributes,
        info,
        stats: {
          ...prev.stats,
          paExtra: Math.min(prev.stats.paExtra, snapshot.paExtraMax),
          peTemporary: Math.min(prev.stats.peTemporary, snapshot.peTemporaryMax),
          focusCurrent: Math.min(prev.stats.focusCurrent, snapshot.focusMaximum),
        },
      }
    })
  }

  function setStats(updates: Partial<StatsType>) {
    updateCharacter((prev) => {
      const stats = { ...prev.stats, ...updates }
      const defense = calculateEquippedArmorDefense(prev.inventory)
      stats.currentLoad = calculateInventoryLoad(prev.inventory, prev.info.scaleMultiplier)
      stats.armorRdf = defense.rdf
      stats.armorRdm = defense.rdm
      const snapshot = calculateCharacterStatSnapshot(prev.attributes, prev.info, stats, prev.skills, prev.abilities)
      stats.pa = Math.max(0, stats.pa)
      stats.pe = Math.max(0, stats.pe)
      stats.paExtra = Math.min(snapshot.paExtraMax, Math.max(0, stats.paExtra))
      stats.peTemporary = Math.min(snapshot.peTemporaryMax, Math.max(0, stats.peTemporary))
      stats.focusCurrent = Math.min(snapshot.focusMaximum, Math.max(0, stats.focusCurrent))
      stats.determination = Math.max(0, stats.determination)
      stats.casualty = Math.max(0, stats.casualty)
      stats.currentLoad = Math.max(0, stats.currentLoad)
      return { ...prev, stats }
    })
  }

  function setSkill(id: string, updates: Partial<CharacterSkill>) {
    updateCharacter((prev) => {
      const skills = prev.skills.map((skill) => skill.id === id ? { ...skill, ...updates } : skill)
      const snapshot = calculateCharacterStatSnapshot(prev.attributes, prev.info, prev.stats, skills, prev.abilities)
      return {
        ...prev,
        skills,
        stats: { ...prev.stats, focusCurrent: Math.min(prev.stats.focusCurrent, snapshot.focusMaximum) },
      }
    })
  }

  function addSkill(skill: CharacterSkill) {
    updateCharacter((prev) => ({ ...prev, skills: [...prev.skills, skill] }))
  }

  function importSkills(importedSkills: ImportedSkill[]) {
    updateCharacter((prev) => {
      const skills = [...prev.skills]
      importedSkills.forEach((imported, index) => {
        const importedName = normalizeSkillName(imported.name)
        const systemSkill = systemSkills.find((definition) => (
          [definition.name, ...(definition.aliases ?? [])]
            .some((candidate) => normalizeSkillName(candidate) === importedName)
        ))
        const canonicalName = systemSkill?.name ?? imported.name
        const normalizedName = normalizeSkillName(canonicalName)
        const existingIndex = skills.findIndex((skill) => normalizeSkillName(skill.name) === normalizedName)
        if (existingIndex >= 0) {
          skills[existingIndex] = {
            ...skills[existingIndex],
            attributeKey: imported.attributeKey,
            points: imported.points,
          }
          return
        }

        const id = createPrefixedId("skill-import")
        skills.push({
          id,
          name: canonicalName,
          attributeKey: imported.attributeKey,
          points: imported.points,
          modifier: 0,
          locked: false,
        })
      })

      const snapshot = calculateCharacterStatSnapshot(prev.attributes, prev.info, prev.stats, skills, prev.abilities)
      return {
        ...prev,
        skills,
        stats: { ...prev.stats, focusCurrent: Math.min(prev.stats.focusCurrent, snapshot.focusMaximum) },
      }
    })
  }

  function removeSkill(id: string) {
    updateCharacter((prev) => ({ ...prev, skills: prev.skills.filter((skill) => skill.locked || skill.id !== id) }))
  }

  function setBond(id: string, updates: Partial<CharacterBond>) {
    updateCharacter((prev) => ({
      ...prev,
      bonds: prev.bonds.map((bond) => bond.id === id ? {
        ...bond,
        ...updates,
        points: updates.points === undefined ? bond.points : Math.trunc(updates.points),
        modifier: updates.modifier === undefined ? bond.modifier : Math.trunc(updates.modifier),
      } : bond),
    }))
  }

  function addBond(bond: CharacterBond) {
    updateCharacter((prev) => ({ ...prev, bonds: [...prev.bonds, bond] }))
  }

  function importBonds(importedBonds: ImportedBond[]) {
    updateCharacter((prev) => {
      const bonds = [...prev.bonds]
      importedBonds.forEach((imported, index) => {
        const normalizedName = normalizeSkillName(imported.name)
        const existingIndex = bonds.findIndex((bond) => normalizeSkillName(bond.name) === normalizedName)
        if (existingIndex >= 0) {
          bonds[existingIndex] = { ...bonds[existingIndex], points: imported.points }
          return
        }
        const id = createPrefixedId("bond-import")
        bonds.push({ id, category: "", name: imported.name, points: imported.points, modifier: 0 })
      })
      return { ...prev, bonds }
    })
  }

  function removeBond(id: string) {
    updateCharacter((prev) => ({ ...prev, bonds: prev.bonds.filter((bond) => bond.id !== id) }))
  }

  function setAbility(id: string, updates: Partial<CharacterAbility>) {
    updateCharacter((prev) => {
      const abilities = prev.abilities.map((ability) => ability.id === id ? { ...ability, ...updates } : ability)
      const snapshot = calculateCharacterStatSnapshot(prev.attributes, prev.info, prev.stats, prev.skills, abilities)
      return {
        ...prev,
        abilities,
        stats: {
          ...prev.stats,
          paExtra: Math.min(prev.stats.paExtra, snapshot.paExtraMax),
          peTemporary: Math.min(prev.stats.peTemporary, snapshot.peTemporaryMax),
          focusCurrent: Math.min(prev.stats.focusCurrent, snapshot.focusMaximum),
        },
      }
    })
  }

  function addAbility(ability: CharacterAbility) {
    updateCharacter((prev) => ({ ...prev, abilities: [...prev.abilities, ability] }))
  }

  function importAbilities(importedAbilities: ImportedAbility[]) {
    updateCharacter((prev) => {
      const abilities = [...prev.abilities]
      importedAbilities.forEach((imported, index) => {
        const identity = `${normalizeSkillName(imported.category)}::${normalizeSkillName(imported.name)}`
        const existingIndex = abilities.findIndex((ability) => (
          `${normalizeSkillName(ability.category)}::${normalizeSkillName(ability.name)}` === identity
        ))
        if (existingIndex >= 0) {
          abilities[existingIndex] = { ...abilities[existingIndex], ...imported }
          return
        }
        const id = createPrefixedId("ability-import")
        abilities.push({ id, ...imported })
      })
      const snapshot = calculateCharacterStatSnapshot(prev.attributes, prev.info, prev.stats, prev.skills, abilities)
      return {
        ...prev,
        abilities,
        stats: {
          ...prev.stats,
          paExtra: Math.min(prev.stats.paExtra, snapshot.paExtraMax),
          peTemporary: Math.min(prev.stats.peTemporary, snapshot.peTemporaryMax),
          focusCurrent: Math.min(prev.stats.focusCurrent, snapshot.focusMaximum),
        },
      }
    })
  }

  function removeAbility(id: string) {
    updateCharacter((prev) => {
      const abilities = prev.abilities.filter((ability) => ability.id !== id)
      const snapshot = calculateCharacterStatSnapshot(prev.attributes, prev.info, prev.stats, prev.skills, abilities)
      return {
        ...prev,
        abilities,
        stats: {
          ...prev.stats,
          paExtra: Math.min(prev.stats.paExtra, snapshot.paExtraMax),
          peTemporary: Math.min(prev.stats.peTemporary, snapshot.peTemporaryMax),
          focusCurrent: Math.min(prev.stats.focusCurrent, snapshot.focusMaximum),
        },
      }
    })
  }

  function setSpell(id: string, updates: Partial<CharacterSpell>) {
    updateCharacter((prev) => {
      const spells = prev.spells.map((spell) => spell.id === id ? { ...spell, ...updates } : spell)
      const snapshot = calculateCharacterStatSnapshot(prev.attributes, prev.info, prev.stats, prev.skills, prev.abilities)
      return {
        ...prev,
        spells,
        stats: {
          ...prev.stats,
          paExtra: Math.min(prev.stats.paExtra, snapshot.paExtraMax),
          peTemporary: Math.min(prev.stats.peTemporary, snapshot.peTemporaryMax),
          focusCurrent: Math.min(prev.stats.focusCurrent, snapshot.focusMaximum),
        },
      }
    })
  }

  function addSpell(spell: CharacterSpell) {
    updateCharacter((prev) => ({ ...prev, spells: [...prev.spells, spell] }))
  }

  /** Cria o registro pedido pelo painel de anexos do item e devolve o `id`. */
  function createAbilityForItem(ability: ImportedAbility): string {
    const id = createPrefixedId("ability")
    addAbility({ id, ...ability })
    return id
  }

  function createSpellForItem(spell: ImportedSpell): string {
    const id = createPrefixedId("spell")
    addSpell({ id, ...spell })
    return id
  }

  function importSpells(importedSpells: ImportedSpell[]) {
    updateCharacter((prev) => {
      const spells = [...prev.spells]
      importedSpells.forEach((imported, index) => {
        const identity = `${normalizeSkillName(imported.category)}::${normalizeSkillName(imported.name)}`
        const existingIndex = spells.findIndex((spell) => (
          `${normalizeSkillName(spell.category)}::${normalizeSkillName(spell.name)}` === identity
        ))
        if (existingIndex >= 0) {
          spells[existingIndex] = { ...spells[existingIndex], ...imported }
          return
        }
        const id = createPrefixedId("spell-import")
        spells.push({ id, ...imported })
      })
      const snapshot = calculateCharacterStatSnapshot(prev.attributes, prev.info, prev.stats, prev.skills, prev.abilities)
      return {
        ...prev,
        spells,
        stats: {
          ...prev.stats,
          paExtra: Math.min(prev.stats.paExtra, snapshot.paExtraMax),
          peTemporary: Math.min(prev.stats.peTemporary, snapshot.peTemporaryMax),
          focusCurrent: Math.min(prev.stats.focusCurrent, snapshot.focusMaximum),
        },
      }
    })
  }

  function removeSpell(id: string) {
    updateCharacter((prev) => {
      const spells = prev.spells.filter((spell) => spell.id !== id)
      const snapshot = calculateCharacterStatSnapshot(prev.attributes, prev.info, prev.stats, prev.skills, prev.abilities)
      return {
        ...prev,
        spells,
        stats: {
          ...prev.stats,
          paExtra: Math.min(prev.stats.paExtra, snapshot.paExtraMax),
          peTemporary: Math.min(prev.stats.peTemporary, snapshot.peTemporaryMax),
          focusCurrent: Math.min(prev.stats.focusCurrent, snapshot.focusMaximum),
        },
      }
    })
  }

  function setInventory(items: CharacterInventoryItem[]) {
    updateCharacter((prev) => {
      const defense = calculateEquippedArmorDefense(items)
      return {
        ...prev,
        inventory: items,
        stats: {
          ...prev.stats,
          currentLoad: calculateInventoryLoad(items, prev.info.scaleMultiplier),
          armorRdf: defense.rdf,
          armorRdm: defense.rdm,
        },
      }
    })
  }

  function importInventoryItems(importedItems: ImportedInventoryItem[]) {
    updateCharacter((prev) => {
      let equippedArmorExists = prev.inventory.some((item) => item.usage === "equipped" && item.equippedAsArmor)
      const spells = [...prev.spells]
      const abilities = [...prev.abilities]
      const imported = importedItems.map((item, index): CharacterInventoryItem => {
        const usage = item.usage
        const equippedAsArmor = usage === "equipped" && item.equippedAsArmor && !equippedArmorExists
        if (equippedAsArmor) equippedArmorExists = true
        const findByName = <T extends { id: string; name: string }>(values: T[], name: string): string => (
          values.find((value) => normalizeSkillName(value.name) === normalizeSkillName(name))?.id ?? ""
        )
        // Magias e habilidades do item chegam embutidas: reaproveita o registro
        // homônimo da ficha e só cria o que ainda não existe.
        const spellIds = item.spells.map((imported, spellIndex) => {
          const existing = spells.find((spell) => normalizeSkillName(spell.name) === normalizeSkillName(imported.name))
          if (existing) return existing.id
          const id = createPrefixedId("spell-import")
          spells.push({ id, ...imported })
          return id
        })
        const abilityIds = item.abilities.map((imported, abilityIndex) => {
          const existing = abilities.find((ability) => normalizeSkillName(ability.name) === normalizeSkillName(imported.name))
          if (existing) return existing.id
          const id = createPrefixedId("ability-import")
          abilities.push({ id, ...imported })
          return id
        })
        return {
          id: createPrefixedId("item-import"),
          usage,
          name: item.name,
          type: item.type,
          affinity: item.affinity,
          bondPoints: item.bondPoints,
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
          bondId: findByName(prev.bonds, item.bondName),
          skillId: findByName(prev.skills, item.skillName),
          description: item.description,
        }
      })
      const inventory = [...prev.inventory, ...imported]
      const defense = calculateEquippedArmorDefense(inventory)
      return { ...prev, spells, abilities, inventory, stats: { ...prev.stats, currentLoad: calculateInventoryLoad(inventory, prev.info.scaleMultiplier), armorRdf: defense.rdf, armorRdm: defense.rdm } }
    })
  }

  function setNote(id: string, updates: Partial<CharacterNote>) {
    updateCharacter((prev) => ({
      ...prev,
      notes: prev.notes.map((note) => note.id === id ? { ...note, ...updates } : note),
    }))
  }

  function addNote(note: CharacterNote) {
    updateCharacter((prev) => ({ ...prev, notes: [...prev.notes, note] }))
  }

  function removeNote(id: string) {
    updateCharacter((prev) => ({ ...prev, notes: prev.notes.filter((note) => note.id !== id) }))
  }

  function applyAbilityCost(costType: Exclude<AbilityCostType, "none" | "other">, amount: number) {
    const statKey = costType === "pv" ? "pv"
      : costType === "pa" ? "pa"
        : costType === "pe" ? "pe"
          : costType === "paExtra" ? "paExtra"
            : "peTemporary"
    updateCharacter((prev) => {
      const nextValue = prev.stats[statKey] - Math.max(0, Math.trunc(amount))
      return {
        ...prev,
        stats: { ...prev.stats, [statKey]: costType === "pv" ? nextValue : Math.max(0, nextValue) },
      }
    })
  }

  if (!isReady) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">Carregando ficha…</p>
  }

  const featureIsActive = activeTab === "abilities" || activeTab === "inventory" || activeTab === "spells" || activeTab === "notes"
  const upperTabs = featureIsActive ? recordTabs : featureTabs
  const lowerTabs = featureIsActive ? featureTabs : recordTabs

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-[20px] border border-border bg-card px-3 py-2.5 shadow-sm sm:rounded-[27px] sm:px-7 sm:py-4">
        <div className="flex items-center justify-between gap-2 sm:block">
          <SaveIndicator />
          <CharacterActions />
        </div>
      </section>

      <div className="relative">
        <div className="relative z-0 -mb-px grid grid-cols-4 gap-x-px">
          {upperTabs.map((tab) => (
            <button
              key={tab.label}
              type="button"
              disabled={!tab.id}
              onClick={() => tab.id && onActiveTabChange(tab.id)}
              title={!tab.id ? "Ainda não disponível" : undefined}
              className="h-12 min-w-0 rounded-t-[20px] border-t border-border bg-muted px-1 pb-px text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:hover:text-muted-foreground sm:rounded-t-[27px] sm:px-2 sm:text-base"
            >
              <span className="block truncate">{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="relative z-20 grid grid-cols-4 gap-x-px bg-muted" role="tablist" aria-label="Seções da ficha">
            {lowerTabs.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <button
                  key={tab.label}
                  type="button"
                  disabled={!tab.id}
                  onClick={() => tab.id && onActiveTabChange(tab.id)}
                  aria-selected={isActive}
                  role="tab"
                  className={cn(
                    "relative h-14 min-w-0 rounded-t-[20px] border-x border-t border-transparent px-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:text-muted-foreground sm:h-12 sm:rounded-t-[27px] sm:px-2 sm:text-base",
                    isActive
                      ? "z-10 border-border bg-card text-foreground shadow-sm after:absolute after:-bottom-0.5 after:inset-x-0 after:h-1 after:bg-card"
                      : "bg-secondary text-secondary-foreground hover:bg-accent",
                  )}
                >
                  <span className="block truncate">{tab.label}</span>
                </button>
              )
            })}
        </div>

        <div role="tabpanel" className="relative z-10 -mt-px">
          {activeTab === "information" && (
            <CharacterInfo name={character.name} info={character.info} portraitDataUrl={character.portraitDataUrl} onNameChange={setName} onInfoChange={setInfo} onPortraitChange={(portraitDataUrl) => updateCharacter((prev) => ({ ...prev, portraitDataUrl }))} tokenImageDataUrl={character.tokenImageDataUrl} tokenSize={character.tokenSize} onTokenChange={(token) => updateCharacter((prev) => ({ ...prev, ...token }))} />
          )}
          {activeTab === "statistics" && (
            <CharacterStats
              attributes={character.attributes}
              info={character.info}
              stats={character.stats}
              skills={character.skills}
              abilities={character.abilities}
              onAttributeChange={setAttribute}
              onStatsChange={setStats}
            />
          )}
          {activeTab === "skills" && (
            <CharacterSkills
              attributes={character.attributes}
              skills={character.skills}
              onSkillChange={setSkill}
              onAddSkill={addSkill}
              onImportSkills={importSkills}
              onRemoveSkill={removeSkill}
            />
          )}
          {activeTab === "bonds" && (
            <CharacterBonds
              attributes={character.attributes}
              stats={character.stats}
              bonds={character.bonds}
              onBondChange={setBond}
              onAddBond={addBond}
              onImportBonds={importBonds}
              onRemoveBond={removeBond}
            />
          )}
          {activeTab === "abilities" && (
            <CharacterAbilities
              characterName={character.name}
              abilities={character.abilities}
              stats={character.stats}
              onAddAbility={addAbility}
              onImportAbilities={importAbilities}
              onAbilityChange={setAbility}
              onRemoveAbility={removeAbility}
              onApplyCost={applyAbilityCost}
            />
          )}
          {activeTab === "spells" && (
            <CharacterSpells
              characterName={character.name}
              spells={character.spells}
              skills={character.skills}
              attributes={character.attributes}
              elements={character.elements}
              onElementsChange={(elements) => updateCharacter((prev) => ({ ...prev, elements }))}
              stats={character.stats}
              onAddSpell={addSpell}
              onImportSpells={importSpells}
              onSpellChange={setSpell}
              onRemoveSpell={removeSpell}
              onApplyCost={applyAbilityCost}
            />
          )}
          {activeTab === "inventory" && (
            <CharacterInventory
              characterName={character.name}
              items={character.inventory}
              info={character.info}
              attributes={character.attributes}
              stats={character.stats}
              skills={character.skills}
              bonds={character.bonds}
              abilities={character.abilities}
              spells={character.spells}
              elements={character.elements}
              onItemsChange={setInventory}
              onImportItems={importInventoryItems}
              onLoadBonusChange={(loadBonus) => setStats({ loadBonus })}
              onCreateAbility={createAbilityForItem}
              onCreateSpell={createSpellForItem}
            />
          )}
          {activeTab === "notes" && (
            <CharacterNotes
              notes={character.notes}
              onAddNote={addNote}
              onNoteChange={setNote}
              onRemoveNote={removeNote}
            />
          )}
        </div>
      </div>
    </div>
  )
}
