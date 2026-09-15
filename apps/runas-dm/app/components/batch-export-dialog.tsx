"use client"

import { useMemo, useState } from "react"
import { CheckSquare, Download, Filter, Search, Square, X } from "lucide-react"
import { getCharacterElement } from "@runas/core/data/elements"
import type { BestiaryEntry } from "../lib/model"
import { exportCharactersZip } from "../lib/export"
import { useEscapeToClose } from "../lib/use-escape-to-close"

export function BatchExportDialog({ entries, onClose }: { entries: BestiaryEntry[]; onClose: () => void }) {
  useEscapeToClose(onClose)
  const [search, setSearch] = useState("")
  const [race, setRace] = useState("all")
  const [element, setElement] = useState("all")
  const [affinity, setAffinity] = useState("all")
  const [selected, setSelected] = useState<Set<string>>(() => new Set(entries.map((entry) => entry.id)))

  const races = useMemo(() => [...new Set(entries.map((entry) => entry.character.info.race.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [entries])
  const elements = useMemo(() => [...new Set(entries.map((entry) => entry.character.stats.elementId).filter((value) => value && value !== "none"))].map((id) => ({ id, name: getCharacterElement(id)?.name ?? id })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [entries])
  const affinities = useMemo(() => [...new Set(entries.map((entry) => entry.character.info.affinity.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })), [entries])
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR")
    return entries.filter(({ character }) => {
      const matchesTerm = !term || [character.name, character.info.race, character.info.affinity, getCharacterElement(character.stats.elementId)?.name].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term))
      return matchesTerm && (race === "all" || character.info.race === race) && (element === "all" || character.stats.elementId === element) && (affinity === "all" || character.info.affinity === affinity)
    })
  }, [affinity, element, entries, race, search])
  const selectedEntries = entries.filter((entry) => selected.has(entry.id))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return <div className="modal-backdrop batch-export-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="batch-export-modal" role="dialog" aria-modal="true" aria-labelledby="batch-export-title">
      <header><div><p className="eyebrow">Exportação em lote</p><h2 id="batch-export-title">Escolha as fichas do arquivo ZIP</h2><p>Use os filtros para localizar fichas mesmo em bestiários com centenas de registros.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar exportação"><X size={20} /></button></header>
      <div className="batch-export-filters">
        <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, raça, afinidade ou elemento…" /></label>
        <label className="gallery-select"><Filter size={15} /><span>Raça</span><select value={race} onChange={(event) => setRace(event.target.value)}><option value="all">Todas</option>{races.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="gallery-select"><Filter size={15} /><span>Elemento</span><select value={element} onChange={(event) => setElement(event.target.value)}><option value="all">Todos</option>{elements.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
        <label className="gallery-select"><Filter size={15} /><span>Afinidade</span><select value={affinity} onChange={(event) => setAffinity(event.target.value)}><option value="all">Todas</option>{affinities.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="batch-selection-toolbar"><span><strong>{selected.size}</strong> {selected.size === 1 ? "selecionada" : "selecionadas"} · {visible.length} nos filtros</span><div><button onClick={() => setSelected(new Set(entries.map((entry) => entry.id)))}><CheckSquare size={15} /> Todas</button><button onClick={() => setSelected((current) => new Set([...current, ...visible.map((entry) => entry.id)]))}><CheckSquare size={15} /> Exibidas</button><button onClick={() => setSelected(new Set())}><Square size={15} /> Limpar</button></div></div>
      <div className="batch-export-list">{visible.length === 0 ? <p className="batch-empty">Nenhuma ficha corresponde aos filtros.</p> : visible.map((entry) => {
        const checked = selected.has(entry.id)
        const character = entry.character
        return <label key={entry.id} className={checked ? "selected" : ""}><input type="checkbox" checked={checked} onChange={() => toggle(entry.id)} /><span className={`mini-rune ${character.portraitDataUrl ? "has-portrait" : ""}`}>{character.portraitDataUrl ? <img src={character.portraitDataUrl} alt="" /> : character.name.slice(0, 1) || "R"}</span><span><strong>{character.name || "Ficha sem nome"}</strong><small>{character.info.race || "Sem raça"} · {getCharacterElement(character.stats.elementId)?.name ?? "Sem elemento"} · {character.info.affinity || "Sem afinidade"}</small></span></label>
      })}</div>
      <footer><span>Será criado um ZIP com fichas JSON compatíveis com o Runas Tools e o Runas DM.</span><div><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={selectedEntries.length === 0} onClick={() => { exportCharactersZip(selectedEntries.map((entry) => entry.character)); onClose() }}><Download size={16} /> Exportar {selectedEntries.length || ""} ficha{selectedEntries.length === 1 ? "" : "s"}</button></div></footer>
    </section>
  </div>
}
