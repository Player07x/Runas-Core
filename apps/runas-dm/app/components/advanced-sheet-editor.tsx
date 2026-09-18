"use client"

import { useState } from "react"
import { Edit3, Handshake, Plus, RefreshCw, RotateCcw, Shield, Trash2, Upload, X } from "lucide-react"
import { attributeGroups } from "@runas/core/data/attributes"
import { characterElements } from "@runas/core/data/elements"
import { systemSkills } from "@runas/core/data/skills"
import { calculateBondQuality, calculateBondTest, formatSigned } from "@runas/core/lib/bondCalculations"
import { calculateCharacterStatSnapshot } from "@runas/core/lib/characterStatCalculations"
import { synchronizeCharacterDerivedValues } from "@runas/core/lib/characterSynchronization"
import {
  calculateEquippedArmorDefense, calculateInventoryLoad, calculateItemRealWeight, formatWeight,
  inventoryTypeLabel, inventoryTypeOptions, inventoryUsageLabel, inventoryUsageOptions, itemAffinityOptions, itemRarity,
} from "@runas/core/lib/inventoryCalculations"
import {
  calculateMasteryImprovementPoints,
  calculateSpentMasteryImprovementPoints,
  clampMasteryImprovementQuantity,
  masteryImprovementOptions,
} from "@runas/core/lib/masteryImprovements"
import { calculateAttributeTest, calculateSkillLevel, findExactSystemSkill } from "@runas/core/lib/skillCalculations"
import type {
  AttributeKey, Character, CharacterAbility, CharacterInfo, CharacterInventoryItem,
  CharacterNote, CharacterSpell, SecondaryAttributeKey,
} from "@runas/core/types/character"
import { AttributeBands } from "./attribute-bands"
import { RichTextEditor } from "./rich-text-editor"
import { useEscapeToClose } from "../lib/use-escape-to-close"
import { TokenEditorDialog } from "./token-editor-dialog"

type AdvancedTab = "information" | "statistics" | "skills" | "bonds" | "abilities" | "inventory" | "spells" | "notes"
type UpdateCharacter = (mutator: (draft: Character) => void) => void

const tabs: Array<{ id: AdvancedTab; label: string }> = [
  { id: "information", label: "Informações" }, { id: "statistics", label: "Estatísticas" },
  { id: "skills", label: "Perícias" }, { id: "bonds", label: "Vínculos" },
  { id: "abilities", label: "Habilidades" }, { id: "inventory", label: "Inventário" },
  { id: "spells", label: "Magias" }, { id: "notes", label: "Anotações" },
]

const secondaryAttributes = attributeGroups.flatMap((group) => group.attributes)
const costResourceOptions = [
  { value: "none", label: "Nenhum" }, { value: "other", label: "Outro" }, { value: "pv", label: "PV" },
  { value: "pa", label: "PA" }, { value: "pe", label: "PE" }, { value: "paExtra", label: "PA extra" },
  { value: "peTemporary", label: "PE temporário" },
]
const magicTypes = [
  { value: "aura", label: "Aura" }, { value: "quick", label: "Rápida" }, { value: "spell", label: "Feitiço" },
  { value: "ritual", label: "Ritual" }, { value: "enchantment", label: "Encantamento" },
]
const rangeTypes = [
  { value: "touch", label: "Toque" }, { value: "personal", label: "Pessoal" }, { value: "projectile", label: "Projétil" },
  { value: "targets", label: "Alvo(s)" }, { value: "area", label: "Área" },
]

function uid(prefix: string) { return `${prefix}-${crypto.randomUUID()}` }
function find<T extends { id: string }>(items: T[], id: string): T { const item = items.find((candidate) => candidate.id === id); if (!item) throw new Error("Registro não encontrado"); return item }
function splitList(value: string) { return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean) }
function plainText(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() }
function costLabel(item: CharacterAbility | CharacterSpell) {
  if (item.costType === "none") return "Sem custo"
  if (item.costType === "other") return item.costText || "Outro custo"
  const resource = costResourceOptions.find((option) => option.value === item.costType)?.label ?? item.costType
  return `${item.costValue} ${resource}${item.costMode === "relative" ? " (relativo)" : ""}`
}

export function AdvancedSheetEditor({ character, onChange }: { character: Character; onChange: (character: Character) => void }) {
  const [activeTab, setActiveTab] = useState<AdvancedTab>("information")
  function update(mutator: (draft: Character) => void) {
    const draft = structuredClone(character)
    mutator(draft)
    onChange(synchronizeCharacterDerivedValues(character, draft))
  }

  return <div className="full-sheet-editor">
    <nav className="full-sheet-tabs" aria-label="Seções da ficha completa">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>
    <div className="full-sheet-content" data-section={activeTab}>
      {activeTab === "information" && <InformationSection character={character} update={update} />}
      {activeTab === "statistics" && <StatisticsSection character={character} update={update} />}
      {activeTab === "skills" && <SkillsSection character={character} update={update} />}
      {activeTab === "bonds" && <BondsSection character={character} update={update} />}
      {activeTab === "abilities" && <AbilitiesSection items={character.abilities} update={update} />}
      {activeTab === "inventory" && <InventorySection character={character} update={update} />}
      {activeTab === "spells" && <SpellsSection items={character.spells} update={update} />}
      {activeTab === "notes" && <NotesSection items={character.notes} update={update} />}
    </div>
  </div>
}

/** Token do RunasVTT: imagem com transparência e tamanho em células (campos da versão 21). */
function TokenField({ character, update }: { character: Character; update: UpdateCharacter }) {
  const [file, setFile] = useState<File | null>(null)
  const sizes = [0.5, 1, 2, 3, 4, 5]
  const size = character.tokenSize ?? 1
  return <div className="advanced-token-field">
    <span className={`mini-rune ${character.tokenImageDataUrl ? "has-portrait" : ""}`}>{character.tokenImageDataUrl ? <img src={character.tokenImageDataUrl} alt="" /> : character.name.slice(0, 1) || "R"}</span>
    <div><strong>Token</strong><small>{character.tokenImageDataUrl ? "Imagem usada no mapa do RunasVTT." : "Sem token: o RunasVTT usa o retrato."}</small></div>
    <label className="secondary-button"><Upload size={14} /> {character.tokenImageDataUrl ? "Trocar" : "Escolher"}<input hidden type="file" accept="image/*" onChange={(event) => { const next = event.target.files?.[0]; if (next?.type.startsWith("image/")) setFile(next); event.currentTarget.value = "" }} /></label>
    {character.tokenImageDataUrl && <button className="icon-button subtle" title="Remover token" aria-label="Remover token" onClick={() => update((draft) => { delete draft.tokenImageDataUrl })}><Trash2 size={14} /></button>}
    <label className="advanced-token-size"><span>Tamanho no mapa</span><select value={sizes.includes(size) ? size : 1} onChange={(event) => update((draft) => { draft.tokenSize = Number(event.target.value) })}>{sizes.map((cells) => <option key={cells} value={cells}>{cells === 0.5 ? "½ célula" : `${cells}×${cells}`}</option>)}</select></label>
    {file && <TokenEditorDialog file={file} initialSize={size} onCancel={() => setFile(null)} onConfirm={(tokenImageDataUrl, tokenSize) => { update((draft) => { draft.tokenImageDataUrl = tokenImageDataUrl; draft.tokenSize = tokenSize }); setFile(null) }} />}
  </div>
}

function InformationSection({ character, update }: { character: Character; update: UpdateCharacter }) {
  const info = character.info
  return <AdvancedSection title="Informações" description="A mesma organização e os mesmos dados da ficha do Runas Tools.">
    <section className="tools-info-sheet">
      <div className="tools-year-row"><span>Ano atual</span><strong>{info.currentYear || "—"}</strong><Select value={info.calendar} ariaLabel="Calendário" options={[{ value: "logi", label: "Logi" }, { value: "ce", label: "Élfico" }]} onChange={(value) => update((draft) => { draft.info.calendar = value as CharacterInfo["calendar"] })} /></div>
      <Field className="info-name" label="Nome" value={character.name} onChange={(value) => update((draft) => { draft.name = value })} />
      <TokenField character={character} update={update} />
      <div className="tools-info-grid">
        <Field label="Raça" value={info.race} onChange={(value) => updateInfo(update, "race", value)} />
        <Field label="Espécie" value={info.species} onChange={(value) => updateInfo(update, "species", value)} />
        <Field label="Ofício" value={info.profession} onChange={(value) => updateInfo(update, "profession", value)} />
        <Field label="Nascimento" value={info.birthDate} onChange={(value) => updateInfo(update, "birthDate", value)} />
        <Field label="Idade" value={info.age} onChange={(value) => updateInfo(update, "age", value)} />
        <Field label="Região" value={info.region} onChange={(value) => updateInfo(update, "region", value)} />
        <Field label="Classe" value={info.characterClass} onChange={(value) => updateInfo(update, "characterClass", value)} />
        <Field label="Arquétipo" value={info.archetype} onChange={(value) => updateInfo(update, "archetype", value)} />
        <Field label="Afinidade" value={info.affinity} onChange={(value) => updateInfo(update, "affinity", value)} />
        <Field label="Eficiência (%)" value={info.efficiency} onChange={(value) => updateInfo(update, "efficiency", value.replace(/%/g, ""))} />
        <Field label="Essências" value={info.essences} onChange={(value) => updateInfo(update, "essences", value)} />
        <Field label="Divindade" value={info.deity} onChange={(value) => updateInfo(update, "deity", value)} />
        <Field label="Alinhamento" value={info.alignment} onChange={(value) => updateInfo(update, "alignment", value)} />
        <Field label="Carma" value={info.karma} onChange={(value) => updateInfo(update, "karma", value)} />
        <Field label="Legado" value={info.legacy} onChange={(value) => updateInfo(update, "legacy", value)} />
        <Field label="Raridade" value={info.legacyRarity} onChange={(value) => updateInfo(update, "legacyRarity", value)} />
        <Field label="Pontos" value={info.legacyPoints} onChange={(value) => updateInfo(update, "legacyPoints", value)} />
      </div>
      <section className="tools-scale-card"><h4>Escala, dimensões e peso</h4><div className="tools-info-grid scale">
        <Field label="Tamanho real (m)" value={info.sizeReal} onChange={(value) => updateInfo(update, "sizeReal", value)} />
        <Field label="Modificador de tamanho (MT)" value={info.sizeModifier} onChange={(value) => updateInfo(update, "sizeModifier", value)} />
        <Field label="Bônus de MT" value={info.sizeModifierBonus} onChange={(value) => updateInfo(update, "sizeModifierBonus", value)} />
        <Field label="Tamanho base (m)" value={info.sizeBase} onChange={(value) => updateInfo(update, "sizeBase", value)} />
        <Field label="Peso real (kg)" value={info.weightReal} onChange={(value) => updateInfo(update, "weightReal", value)} />
        <Field label="Peso base (kg)" value={info.weightBase} onChange={(value) => updateInfo(update, "weightBase", value)} />
        <Field label="Bônus de peso" value={info.weightBonus} onChange={(value) => updateInfo(update, "weightBonus", value)} />
        <Field label="Multiplicador de escala" value={info.scaleMultiplier} onChange={(value) => updateInfo(update, "scaleMultiplier", value)} />
        <Field label="Carga base" value={info.loadBase} onChange={(value) => updateInfo(update, "loadBase", value)} />
      </div></section>
    </section>
  </AdvancedSection>
}

function updateInfo(update: UpdateCharacter, key: keyof CharacterInfo, value: string) { update((draft) => { draft.info[key] = value as never }) }

function StatisticsSection({ character, update }: { character: Character; update: UpdateCharacter }) {
  const { stats } = character
  const snapshot = calculateCharacterStatSnapshot(character.attributes, character.info, stats, character.skills, character.abilities)
  const masteryPoints = calculateMasteryImprovementPoints(character.info)
  const spentMasteryPoints = calculateSpentMasteryImprovementPoints(stats.masteryImprovements)
  const remainingMasteryPoints = masteryPoints - spentMasteryPoints
  function restore() { update((draft) => { draft.stats.pv = snapshot.pvMax; draft.stats.pa = snapshot.paMax; draft.stats.paExtra = snapshot.paExtraMax; draft.stats.pe = snapshot.peMax; draft.stats.peTemporary = snapshot.peTemporaryMax; draft.stats.determination = snapshot.determinationMax; draft.stats.casualty = snapshot.casualtyMax; draft.stats.focusCurrent = snapshot.focusMaximum }) }
  return <AdvancedSection title="Estatísticas" description="Recursos, atributos, resistências e melhorias na disposição histórica do Runas Tools.">
    <div className="tools-stats-top"><button className="restore-stats-button" onClick={restore}><RefreshCw size={15} /> Restaurar estatísticas</button></div>
    <AttributeBands attributes={character.attributes} onChange={(key: AttributeKey, value) => update((draft) => { draft.attributes[key] = value })} />
    <div className="tools-resource-grid">
      <ResourceCard tone="life" label="PV atual" current={stats.pv} maximum={snapshot.pvMax} modifier={stats.pvBonus} onCurrent={(value) => updateStat(update, "pv", value)} onModifier={(value) => updateStat(update, "pvBonus", value)} />
      <ResourceCard tone="aura" label="PA atual" current={stats.pa} maximum={snapshot.paMax} modifier={stats.paBonus} onCurrent={(value) => updateStat(update, "pa", value)} onModifier={(value) => updateStat(update, "paBonus", value)} />
      <ResourceCard tone="energy" label="PE atual" current={stats.pe} maximum={snapshot.peMax} modifier={stats.peBonus} onCurrent={(value) => updateStat(update, "pe", value)} onModifier={(value) => updateStat(update, "peBonus", value)} />
      <ResourceCard className="supporting" tone="aura" label="PA extra" current={stats.paExtra} maximum={snapshot.paExtraMax} modifier={stats.paExtraBonus} onCurrent={(value) => updateStat(update, "paExtra", value)} onModifier={(value) => updateStat(update, "paExtraBonus", value)} />
      <ResourceCard className="supporting" tone="energy" label="PE temporário" current={stats.peTemporary} maximum={snapshot.peTemporaryMax} modifier={0} onCurrent={(value) => updateStat(update, "peTemporary", value)} onRestore={() => updateStat(update, "peTemporary", snapshot.peTemporaryMax)} />
      <ResourceCard className="focus-resource" tone="focus" label="Tempo de foco" current={stats.focusCurrent} maximum={snapshot.focusMaximum} modifier={stats.focusModifier} onCurrent={(value) => updateStat(update, "focusCurrent", value)} onModifier={(value) => updateStat(update, "focusModifier", value)} footer={<><RotateCcw size={14} /> Tempo de Descanso: {snapshot.restMinutes} min.</>} />
      <ResourceCard className="supporting" tone="narrative" label="Determinação" current={stats.determination} maximum={snapshot.determinationMax} modifier={stats.determinationBonus} onCurrent={(value) => updateStat(update, "determination", value)} onModifier={(value) => updateStat(update, "determinationBonus", value)} />
      <ResourceCard className="supporting" tone="chance" label="Casualidade" current={stats.casualty} maximum={snapshot.casualtyMax} modifier={stats.casualtyBonus} onCurrent={(value) => updateStat(update, "casualty", value)} onModifier={(value) => updateStat(update, "casualtyBonus", value)} />
    </div>
    <div className="tools-derived-grid">
      <DerivedEdit label="Deslocamento" value={`${snapshot.movement} m`} modifier={stats.movementBonus} onModifier={(value) => updateStat(update, "movementBonus", value)} />
      <DerivedEdit label="Primeiras Impressões" value={formatSigned(snapshot.firstImpressionsBonus)} modifier={stats.firstImpressionsBonus} onModifier={(value) => updateStat(update, "firstImpressionsBonus", value)} />
      <DerivedEdit label="Carga" value={`${formatWeight(stats.currentLoad)} / ${formatWeight(snapshot.loadCapacity)} kg`} modifier={stats.loadBonus} onModifier={(value) => updateStat(update, "loadBonus", value)} />
      <DerivedEdit label="Vontade" value={snapshot.willTest} modifier={stats.willModifier} onModifier={(value) => updateStat(update, "willModifier", value)} />
      <DerivedEdit label="Acaso" value={snapshot.chanceTest} modifier={stats.chanceModifier} onModifier={(value) => updateStat(update, "chanceModifier", value)} />
      <DerivedEdit label="Percepção" value={snapshot.perceptionTest} modifier={stats.perceptionModifier} onModifier={(value) => updateStat(update, "perceptionModifier", value)} />
    </div>
    <div className="tools-stat-details">
      <SelectField label="Elemento principal" value={stats.elementId} options={[{ value: "none", label: "Nenhum" }, ...characterElements.map((element) => ({ value: element.id, label: element.name }))]} onChange={(value) => update((draft) => { draft.stats.elementId = value })} />
      <Field label="Resistências" value={stats.resistances.join(", ")} onChange={(value) => update((draft) => { draft.stats.resistances = splitList(value) })} />
      <Field label="Fraquezas" value={stats.weaknesses.join(", ")} onChange={(value) => update((draft) => { draft.stats.weaknesses = splitList(value) })} />
      <NumberField label="RDF natural" value={stats.naturalRdf} onChange={(value) => updateStat(update, "naturalRdf", value)} />
      <NumberField label="RDM natural" value={stats.naturalRdm} onChange={(value) => updateStat(update, "naturalRdm", value)} />
      <NumberField label="MT" value={stats.mt} onChange={(value) => updateStat(update, "mt", value)} />
      <TextArea label="Efeitos" value={stats.effects} onChange={(value) => update((draft) => { draft.stats.effects = value })} />
    </div>
    <section className="tools-mastery"><header><div><h4>Melhoria de Maestria</h4><p>Pontos definidos por Afinidade e Eficiência.</p></div><MasterySummary total={masteryPoints} spent={spentMasteryPoints} remaining={remainingMasteryPoints} /></header><div>{masteryImprovementOptions.map((option) => { const current = stats.masteryImprovements[option.key]; const maximum = Math.floor(Math.max(0, remainingMasteryPoints + current * option.cost) / option.cost); return <NumberField key={option.key} label={`${option.name} / ${option.cost} pontos`} value={current} min={0} max={maximum} onChange={(value) => update((draft) => { draft.stats.masteryImprovements[option.key] = clampMasteryImprovementQuantity(draft.stats.masteryImprovements, option.key, value, masteryPoints) })} /> })}</div>{remainingMasteryPoints < 0 && <p className="mastery-overage" role="alert">As melhorias excedem o limite atual. Reduza compras ou aumente Afinidade/Eficiência.</p>}</section>
  </AdvancedSection>
}

function updateStat(update: UpdateCharacter, key: keyof Character["stats"], value: number) { update((draft) => { (draft.stats[key] as number) = value }) }

function SkillsSection({ character, update }: { character: Character; update: UpdateCharacter }) {
  return <AdvancedSection title="Perícias" description="Edição direta, sem cartões expansíveis e sem botões de rolagem." action={() => update((draft) => { draft.skills.push({ id: uid("skill"), name: "Nova perícia", attributeKey: "", points: 0, modifier: 0, locked: false }) })}>
    <datalist id="advanced-system-skill-suggestions">{systemSkills.map((skill) => <option key={skill.name} value={skill.name} />)}</datalist>
    <div className="tools-table skill-table"><TableHeader labels={["Nome", "Teste", "Nível", "Atributo", "Pontos", "Mod.", ""]} />
      {character.skills.map((skill) => { const level = calculateSkillLevel(skill.points); const test = skill.attributeKey ? calculateAttributeTest(character.attributes, skill.attributeKey) + level + skill.modifier : null; return <div className="tools-table-row" key={skill.id}>
        <InlineText label="Nome" value={skill.name} list="advanced-system-skill-suggestions" readOnly={skill.locked} onChange={(value) => update((draft) => { const target = find(draft.skills, skill.id); const detected = findExactSystemSkill(value); target.name = detected?.name ?? value; if (detected) target.attributeKey = detected.attributeKey })} />
        <OutputCell label="Teste" value={test ?? "—"} /><OutputCell label="Nível" value={formatSigned(level)} />
        <InlineSelect label="Atributo" value={skill.attributeKey} options={[{ value: "", label: "Nenhum" }, ...secondaryAttributes.map((attribute) => ({ value: attribute.key, label: attribute.name }))]} onChange={(value) => update((draft) => { find(draft.skills, skill.id).attributeKey = value as SecondaryAttributeKey | "" })} />
        <InlineNumber label="Pontos" value={skill.points} onChange={(value) => update((draft) => { find(draft.skills, skill.id).points = Math.max(0, value) })} />
        <InlineNumber label="Mod." value={skill.modifier} onChange={(value) => update((draft) => { find(draft.skills, skill.id).modifier = value })} />
        <RowRemove disabled={skill.locked} onClick={() => update((draft) => { draft.skills = draft.skills.filter((candidate) => candidate.id !== skill.id) })} label={`Remover ${skill.name}`} />
      </div> })}
    </div>
  </AdvancedSection>
}

function BondsSection({ character, update }: { character: Character; update: UpdateCharacter }) {
  return <AdvancedSection title="Vínculos" description="Todos os valores ficam visíveis e editáveis na própria linha." action={() => update((draft) => { draft.bonds.push({ id: uid("bond"), category: "", name: "Novo vínculo", points: 0, modifier: 0 }) })}>
    <div className="tools-table bond-table"><TableHeader labels={["Ação", "Categoria", "Nome", "Teste", "Qualidade", "Nível", "Pontos", "Mod.", ""]} />
      {character.bonds.map((bond) => { const quality = calculateBondQuality(bond.points); return <div className="tools-table-row" key={bond.id}>
        <span className="bond-symbol" aria-hidden="true"><Handshake size={18} /></span>
        <InlineText label="Categoria" value={bond.category} onChange={(value) => update((draft) => { find(draft.bonds, bond.id).category = value })} />
        <InlineText label="Nome" value={bond.name} onChange={(value) => update((draft) => { find(draft.bonds, bond.id).name = value })} />
        <OutputCell label="Teste" value={calculateBondTest(character.attributes, character.stats, bond)} />
        <OutputCell label="Qualidade" value={quality.name} /><OutputCell label="Nível" value={formatSigned(quality.level)} />
        <InlineNumber label="Pontos" value={bond.points} onChange={(value) => update((draft) => { find(draft.bonds, bond.id).points = value })} />
        <InlineNumber label="Mod." value={bond.modifier} onChange={(value) => update((draft) => { find(draft.bonds, bond.id).modifier = value })} />
        <RowRemove onClick={() => update((draft) => { draft.bonds = draft.bonds.filter((candidate) => candidate.id !== bond.id) })} label={`Remover ${bond.name}`} />
      </div> })}
    </div>
  </AdvancedSection>
}

function AbilitiesSection({ items, update }: { items: CharacterAbility[]; update: UpdateCharacter }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find((item) => item.id === selectedId) ?? null
  return <AdvancedSection title="Habilidades" description="Categoria, nome, descrição e custo visíveis antes de abrir a edição." action={() => { const nextId = uid("ability"); update((draft) => { draft.abilities.push({ id: nextId, category: "", name: "Nova habilidade", description: "", permanentModifiers: "", costType: "none", costMode: "fixed", costValue: 0, costText: "" }) }); setSelectedId(nextId) }}>
    <div className="summary-table ability-summary"><TableHeader labels={["Categoria", "Nome", "Descrição", "Custo"]} />{items.map((item) => <button className="summary-row" key={item.id} onClick={() => setSelectedId(item.id)}><span>{item.category || "Sem categoria"}</span><strong>{item.name}</strong><span>{plainText(item.description) || "Sem descrição"}</span><span>{costLabel(item)}</span></button>)}</div>
    {selected && <RecordModal title="Editar habilidade" onClose={() => setSelectedId(null)}><AbilityForm item={selected} update={update} /><ModalActions onRemove={() => { update((draft) => { draft.abilities = draft.abilities.filter((candidate) => candidate.id !== selected.id) }); setSelectedId(null) }} onClose={() => setSelectedId(null)} /></RecordModal>}
  </AdvancedSection>
}

function SpellsSection({ items, update }: { items: CharacterSpell[]; update: UpdateCharacter }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find((item) => item.id === selectedId) ?? null
  return <AdvancedSection title="Magias" description="Lista compacta como no Runas Tools; clique apenas para editar uma magia." action={() => { const nextId = uid("spell"); update((draft) => { draft.spells.push({ id: nextId, category: "", name: "Nova magia", description: "", costType: "none", costMode: "fixed", costValue: 0, costText: "", magicType: "spell", rangeType: "personal", rangeText: "", area: "", duration: "", castingSkill: "" }) }); setSelectedId(nextId) }}>
    <div className="summary-table spell-summary"><TableHeader labels={["Nome", "Tipo", "Alcance", "Duração", "Custo"]} />{items.map((item) => <button className="summary-row" key={item.id} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><span>{magicTypes.find((option) => option.value === item.magicType)?.label}</span><span>{[item.rangeText, rangeTypes.find((option) => option.value === item.rangeType)?.label].filter(Boolean).join(", ")}</span><span>{item.duration || "—"}</span><span>{costLabel(item)}</span></button>)}</div>
    {selected && <RecordModal title="Editar magia" onClose={() => setSelectedId(null)}><SpellForm item={selected} update={update} /><ModalActions onRemove={() => { update((draft) => { draft.spells = draft.spells.filter((candidate) => candidate.id !== selected.id) }); setSelectedId(null) }} onClose={() => setSelectedId(null)} /></RecordModal>}
  </AdvancedSection>
}

function InventorySection({ character, update }: { character: Character; update: UpdateCharacter }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const selected = character.inventory.find((item) => item.id === selectedId) ?? null
  const defense = calculateEquippedArmorDefense(character.inventory)
  const load = calculateInventoryLoad(character.inventory, character.info.scaleMultiplier)
  function open(id: string, edit = false) { setSelectedId(id); setEditing(edit) }
  return <AdvancedSection title="Inventário" description="Carga, armadura, equipamentos e itens na mesma hierarquia do Runas Tools." action={() => { const nextId = uid("item"); update((draft) => { draft.inventory.push(emptyItem(nextId)) }); open(nextId, true) }}>
    <div className="inventory-overview"><InfoMetric label="Carga atual" value={`${formatWeight(load)} kg`} /><InfoMetric label="Capacidade" value={`${formatWeight(calculateCharacterStatSnapshot(character.attributes, character.info, character.stats, character.skills, character.abilities).loadCapacity)} kg`} /><NumberField label="Modificador de carga" value={character.stats.loadBonus} onChange={(value) => updateStat(update, "loadBonus", value)} /><InfoMetric label="Total de itens" value={character.inventory.reduce((sum, item) => sum + item.quantity, 0)} /></div>
    <section className="armor-overview"><header><Shield size={17} /><div><h4>Armadura</h4><label><span>Item usado como armadura</span><select value={character.inventory.find((item) => item.usage === "equipped" && item.equippedAsArmor)?.id ?? ""} onChange={(event) => update((draft) => { draft.inventory.forEach((item) => { item.equippedAsArmor = item.usage === "equipped" && item.id === event.target.value }) })}><option value="">Nenhum</option>{character.inventory.filter((item) => item.usage === "equipped").map((item) => <option key={item.id} value={item.id}>{item.name || "Item sem nome"}</option>)}</select></label></div></header><InfoMetric label="RDF" value={defense.rdf} /><InfoMetric label="RDM" value={defense.rdm} /></section>
    <h4 className="inventory-list-title">Todos os itens</h4>
    <div className="inventory-table"><TableHeader labels={["Uso", "Nome", "Tipo", "Descrição", "Qtd.", "Peso", "Editar"]} />{character.inventory.map((item) => <div className="inventory-row" key={item.id} onClick={() => open(item.id)}>
      <InlineSelect label="Uso" value={item.usage} options={inventoryUsageOptions} onClick={(event) => event.stopPropagation()} onChange={(value) => update((draft) => { find(draft.inventory, item.id).usage = value as CharacterInventoryItem["usage"] })} />
      <strong>{item.name}</strong><span>{inventoryTypeLabel(item.type)}</span><span>{plainText(item.description) || "Sem descrição"}</span><span>{item.quantity}</span><span>{formatWeight(calculateItemRealWeight(item, character.info.scaleMultiplier))} kg</span><button className="row-edit" onClick={(event) => { event.stopPropagation(); open(item.id, true) }} aria-label={`Editar ${item.name}`}><Edit3 size={15} /></button>
    </div>)}</div>
    {selected && <RecordModal title={editing ? "Editar item" : "Visualização do item"} subtitle={editing ? undefined : `${inventoryTypeLabel(selected.type)} · ${inventoryUsageLabel(selected.usage)}`} onClose={() => setSelectedId(null)}>{editing ? <InventoryForm item={selected} character={character} update={update} /> : <InventoryDetails item={selected} character={character} />}
      <ModalActions onRemove={() => { update((draft) => { draft.inventory = draft.inventory.filter((candidate) => candidate.id !== selected.id) }); setSelectedId(null) }} onClose={() => setSelectedId(null)} primary={editing ? "Concluir edição" : "Editar"} onPrimary={() => editing ? setSelectedId(null) : setEditing(true)} />
    </RecordModal>}
  </AdvancedSection>
}

function NotesSection({ items, update }: { items: CharacterNote[]; update: UpdateCharacter }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find((item) => item.id === selectedId) ?? null
  return <AdvancedSection title="Anotações" description="Registros livres da ficha completa." action={() => { const nextId = uid("note"); update((draft) => { draft.notes.push({ id: nextId, category: "", name: "Nova anotação", description: "", date: "" }) }); setSelectedId(nextId) }}>
    <div className="summary-table note-summary"><TableHeader labels={["Categoria", "Nome", "Data", "Descrição"]} />{items.map((item) => <button className="summary-row" key={item.id} onClick={() => setSelectedId(item.id)}><span>{item.category || "Sem categoria"}</span><strong>{item.name}</strong><span>{item.date || "—"}</span><span>{plainText(item.description) || "Sem descrição"}</span></button>)}</div>
    {selected && <RecordModal title="Editar anotação" onClose={() => setSelectedId(null)}><div className="record-form-grid"><Field label="Categoria" value={selected.category} onChange={(value) => update((draft) => { find(draft.notes, selected.id).category = value })} /><Field label="Nome" value={selected.name} onChange={(value) => update((draft) => { find(draft.notes, selected.id).name = value })} /><Field label="Data" value={selected.date} onChange={(value) => update((draft) => { find(draft.notes, selected.id).date = value })} /><TextArea label="Descrição" value={selected.description} onChange={(value) => update((draft) => { find(draft.notes, selected.id).description = value })} /></div><ModalActions onRemove={() => { update((draft) => { draft.notes = draft.notes.filter((candidate) => candidate.id !== selected.id) }); setSelectedId(null) }} onClose={() => setSelectedId(null)} /></RecordModal>}
  </AdvancedSection>
}

function AbilityForm({ item, update }: { item: CharacterAbility; update: UpdateCharacter }) { return <div className="record-form-grid"><Field label="Categoria" value={item.category} onChange={(value) => update((draft) => { find(draft.abilities, item.id).category = value })} /><Field className="span-2" label="Nome" value={item.name} onChange={(value) => update((draft) => { find(draft.abilities, item.id).name = value })} /><TextArea label="Descrição" value={item.description} onChange={(value) => update((draft) => { find(draft.abilities, item.id).description = value })} /><Field className="span-2" label="Modificadores permanentes" value={item.permanentModifiers} onChange={(value) => update((draft) => { find(draft.abilities, item.id).permanentModifiers = value })} /><SelectField label="Recurso de custo" value={item.costType} options={costResourceOptions} onChange={(value) => update((draft) => { find(draft.abilities, item.id).costType = value as CharacterAbility["costType"] })} /><SelectField label="Aplicação" value={item.costMode} options={[{ value: "fixed", label: "Fixo" }, { value: "relative", label: "Relativo" }]} onChange={(value) => update((draft) => { find(draft.abilities, item.id).costMode = value as CharacterAbility["costMode"] })} /><NumberField label="Valor" value={item.costValue} onChange={(value) => update((draft) => { find(draft.abilities, item.id).costValue = value })} /><Field label="Custo em texto" value={item.costText} onChange={(value) => update((draft) => { find(draft.abilities, item.id).costText = value })} /></div> }

function SpellForm({ item, update }: { item: CharacterSpell; update: UpdateCharacter }) { return <div className="record-form-grid"><Field label="Categoria" value={item.category} onChange={(value) => update((draft) => { find(draft.spells, item.id).category = value })} /><Field className="span-2" label="Nome" value={item.name} onChange={(value) => update((draft) => { find(draft.spells, item.id).name = value })} /><SelectField label="Tipo de magia" value={item.magicType} options={magicTypes} onChange={(value) => update((draft) => { find(draft.spells, item.id).magicType = value as CharacterSpell["magicType"] })} /><SelectField label="Tipo de alcance" value={item.rangeType} options={rangeTypes} onChange={(value) => update((draft) => { find(draft.spells, item.id).rangeType = value as CharacterSpell["rangeType"] })} /><Field label="Alcance" value={item.rangeText} onChange={(value) => update((draft) => { find(draft.spells, item.id).rangeText = value })} /><Field label="Área" value={item.area} onChange={(value) => update((draft) => { find(draft.spells, item.id).area = value })} /><Field label="Duração" value={item.duration} onChange={(value) => update((draft) => { find(draft.spells, item.id).duration = value })} /><Field label="Teste de conjuração" value={item.castingSkill} onChange={(value) => update((draft) => { find(draft.spells, item.id).castingSkill = value })} /><TextArea label="Descrição" value={item.description} onChange={(value) => update((draft) => { find(draft.spells, item.id).description = value })} /><SelectField label="Recurso de custo" value={item.costType} options={costResourceOptions} onChange={(value) => update((draft) => { find(draft.spells, item.id).costType = value as CharacterSpell["costType"] })} /><SelectField label="Aplicação" value={item.costMode} options={[{ value: "fixed", label: "Fixo" }, { value: "relative", label: "Relativo" }]} onChange={(value) => update((draft) => { find(draft.spells, item.id).costMode = value as CharacterSpell["costMode"] })} /><NumberField label="Valor" value={item.costValue} onChange={(value) => update((draft) => { find(draft.spells, item.id).costValue = value })} /><Field label="Custo em texto" value={item.costText} onChange={(value) => update((draft) => { find(draft.spells, item.id).costText = value })} /></div> }

function InventoryDetails({ item, character }: { item: CharacterInventoryItem; character: Character }) { return <div className="item-detail-view"><div className="item-metrics"><InfoMetric label="Afinidade" value={itemAffinityOptions.find((option) => option.value === item.affinity)?.label ?? item.affinity} /><InfoMetric label="Raridade" value={itemRarity(item.bondPoints)} /><InfoMetric label="Quantidade" value={item.quantity} /><InfoMetric label="Peso base (unidade)" value={`${formatWeight(item.baseWeight)} kg`} /><InfoMetric label="Peso total" value={`${formatWeight(calculateItemRealWeight(item, character.info.scaleMultiplier))} kg`} /></div>{item.damage && <InfoBlock label="Dano" value={item.damage} />}{(item.rdf > 0 || item.rdm > 0) && <InfoBlock label="Defesa" value={`RDF ${item.rdf} · RDM ${item.rdm}`} />}<InfoBlock label="Descrição" value={plainText(item.description) || "Sem descrição"} /></div> }

function InventoryForm({ item, character, update }: { item: CharacterInventoryItem; character: Character; update: UpdateCharacter }) { return <div className="record-form-grid"><Field className="span-2" label="Nome" value={item.name} onChange={(value) => update((draft) => { find(draft.inventory, item.id).name = value })} /><SelectField label="Uso" value={item.usage} options={inventoryUsageOptions} onChange={(value) => update((draft) => { find(draft.inventory, item.id).usage = value as CharacterInventoryItem["usage"] })} /><SelectField label="Tipo" value={item.type} options={inventoryTypeOptions} onChange={(value) => update((draft) => { find(draft.inventory, item.id).type = value as CharacterInventoryItem["type"] })} /><SelectField label="Afinidade" value={String(item.affinity)} options={itemAffinityOptions.map((option) => ({ value: String(option.value), label: option.label }))} onChange={(value) => update((draft) => { find(draft.inventory, item.id).affinity = Number(value) as CharacterInventoryItem["affinity"] })} /><NumberField label="Pontos de vínculo" value={item.bondPoints} onChange={(value) => update((draft) => { find(draft.inventory, item.id).bondPoints = value })} /><NumberField label="Quantidade" value={item.quantity} onChange={(value) => update((draft) => { find(draft.inventory, item.id).quantity = Math.max(1, value) })} /><NumberField label="Peso base" value={item.baseWeight} onChange={(value) => update((draft) => { find(draft.inventory, item.id).baseWeight = value })} /><CheckField label="Aplicar escala ao peso" checked={item.applyScaleWeight} onChange={(value) => update((draft) => { find(draft.inventory, item.id).applyScaleWeight = value })} /><InfoMetric label="Peso total" value={`${formatWeight(calculateItemRealWeight(item, character.info.scaleMultiplier))} kg`} /><Field label="Dano" value={item.damage} onChange={(value) => update((draft) => { find(draft.inventory, item.id).damage = value })} /><NumberField label="RDF" value={item.rdf} onChange={(value) => update((draft) => { find(draft.inventory, item.id).rdf = value })} /><NumberField label="RDM" value={item.rdm} onChange={(value) => update((draft) => { find(draft.inventory, item.id).rdm = value })} /><NullableNumber label="PR atual" value={item.prCurrent} onChange={(value) => update((draft) => { find(draft.inventory, item.id).prCurrent = value })} /><NullableNumber label="PR máximo" value={item.prMaximum} onChange={(value) => update((draft) => { find(draft.inventory, item.id).prMaximum = value })} /><SelectField label="Perícia vinculada" value={item.skillId} options={[{ value: "", label: "Nenhuma" }, ...character.skills.map((skill) => ({ value: skill.id, label: skill.name }))]} onChange={(value) => update((draft) => { find(draft.inventory, item.id).skillId = value })} /><Field label="Magia de encantamento (ID)" value={item.enchantmentSpellId} onChange={(value) => update((draft) => { find(draft.inventory, item.id).enchantmentSpellId = value })} /><Field label="Vínculo (ID)" value={item.bondId} onChange={(value) => update((draft) => { find(draft.inventory, item.id).bondId = value })} /><Field label="Habilidade de vínculo (ID)" value={item.bondAbilityId} onChange={(value) => update((draft) => { find(draft.inventory, item.id).bondAbilityId = value })} /><TextArea label="Descrição" value={item.description} onChange={(value) => update((draft) => { find(draft.inventory, item.id).description = value })} /></div> }

function emptyItem(id: string): CharacterInventoryItem { return { id, usage: "stored", name: "Novo item", type: "other", affinity: 0, bondPoints: 0, baseWeight: 0, quantity: 1, applyScaleWeight: false, damage: "", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, enchantmentSpellId: "", bondId: "", bondAbilityId: "", skillId: "", description: "" } }

function AdvancedSection({ title, description, action, children }: { title: string; description: string; action?: () => void; children: React.ReactNode }) { return <section className="advanced-section"><header><div><h3>{title}</h3><p>{description}</p></div>{action && <button className="primary-button" onClick={action}><Plus size={16} /> Adicionar</button>}</header>{children}</section> }
function TableHeader({ labels }: { labels: string[] }) { return <div className="tools-table-header" aria-hidden="true">{labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div> }
function Field({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (value: string) => void; className?: string }) { return <label className={`field ${className}`}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label> }
function DeferredNumber({ value, onChange, fallback = 0, min, max, ariaLabel }: { value: number; onChange: (value: number) => void; fallback?: number; min?: number; max?: number; ariaLabel?: string }) { const [draft, setDraft] = useState(String(Number.isFinite(value) ? value : fallback)); function commit(raw: string, blur = false) { setDraft(raw); if (raw === "" || raw === "+" || raw === "-") { if (blur) { setDraft(String(fallback)); onChange(fallback) }; return } const parsed = Number(raw.replace(",", ".")); if (!Number.isFinite(parsed)) return; onChange(Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed))) } return <input aria-label={ariaLabel} inputMode="decimal" value={draft} onChange={(event) => commit(event.target.value)} onBlur={() => commit(draft, true)} /> }
function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) { return <label className="field number-field"><span>{label}</span><DeferredNumber key={value} value={value} onChange={onChange} fallback={min ?? 0} min={min} max={max} /></label> }
function NullableNumber({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) { return <label className="field number-field"><span>{label}</span><input type="number" value={value ?? ""} placeholder="—" onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label> }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (value: string) => void }) { return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }
function Select({ value, options, onChange, ariaLabel }: { value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (value: string) => void; ariaLabel: string }) { return <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <RichTextEditor label={label} value={value} onChange={onChange} className="text-area-field" /> }
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="check-field"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label> }
function InlineText({ label, value, onChange, readOnly = false, list }: { label: string; value: string; onChange: (value: string) => void; readOnly?: boolean; list?: string }) { return <label className="inline-field"><span>{label}</span><input value={value} list={list} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} /></label> }
function InlineNumber({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="inline-field inline-number"><span>{label}</span><DeferredNumber key={value} value={value} onChange={onChange} /></label> }
function InlineSelect({ label, value, options, onChange, onClick }: { label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (value: string) => void; onClick?: (event: React.MouseEvent<HTMLSelectElement>) => void }) { return <label className="inline-field"><span>{label}</span><select value={value} onClick={onClick} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }
function OutputCell({ label, value }: { label: string; value: string | number }) { return <output className="table-output"><span>{label}</span><strong>{value}</strong></output> }
function RowRemove({ onClick, label, disabled = false }: { onClick: () => void; label: string; disabled?: boolean }) { return <button className="row-remove" disabled={disabled} onClick={onClick} aria-label={label}><Trash2 size={15} /></button> }
function ResourceCard({ label, current, maximum, modifier, onCurrent, onModifier, onRestore, tone, className = "", footer }: { label: string; current: number; maximum: number; modifier: number; onCurrent: (value: number) => void; onModifier?: (value: number) => void; onRestore?: () => void; tone: string; className?: string; footer?: React.ReactNode }) { return <section className={`tools-resource-card ${tone} ${className}`}><header><h4>{label}</h4>{onRestore ? <button type="button" onClick={onRestore}><RotateCcw size={13} /> Restaurar</button> : <span>Recurso</span>}</header><div className="resource-card-values"><InlineNumber label="Atual" value={current} onChange={onCurrent} /><OutputCell label="Máximo" value={maximum} />{onModifier ? <InlineNumber label="Mod." value={modifier} onChange={onModifier} /> : <OutputCell label="Mod." value="—" />}</div>{footer && <div className="resource-card-footer">{footer}</div>}</section> }
function DerivedEdit({ label, value, modifier, onModifier }: { label: string; value: string | number; modifier: number; onModifier: (value: number) => void }) { return <section className="derived-edit"><h4>{label}</h4><OutputCell label="Atual" value={value} /><InlineNumber label="Mod." value={modifier} onChange={onModifier} /></section> }
function MasterySummary({ total, spent, remaining }: { total: number; spent: number; remaining: number }) { return <div className="mastery-summary" aria-label="Resumo dos pontos de melhoria"><span>Total <strong>{total}</strong></span><span>Usados <strong>{spent}</strong></span><span className={remaining < 0 ? "over" : ""}>Restantes <strong>{remaining}</strong></span></div> }
function InfoMetric({ label, value }: { label: string; value: string | number }) { return <div className="info-metric"><span>{label}</span><strong>{value}</strong></div> }
function InfoBlock({ label, value }: { label: string; value: string }) { return <div className="info-block"><span>{label}</span><p>{value}</p></div> }
function RecordModal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) { useEscapeToClose(onClose); return <div className="record-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section className="record-modal" role="dialog" aria-modal="true" aria-label={title}><header><div><small>{subtitle ? "Visualização do item" : "Ficha completa"}</small><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header><div className="record-modal-body">{children}</div></section></div> }
function ModalActions({ onRemove, onClose, primary = "Concluir", onPrimary }: { onRemove: () => void; onClose: () => void; primary?: string; onPrimary?: () => void }) { return <div className="record-modal-actions"><button className="danger-button" onClick={onRemove}><Trash2 size={15} /> Remover</button><button className="primary-button" onClick={onPrimary ?? onClose}>{primary === "Editar" && <Edit3 size={15} />}{primary}</button></div> }
