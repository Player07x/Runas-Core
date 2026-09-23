"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Focus, Link2, Pencil, Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react"
import { createKnowledgeId, type OrganizerEdge, type OrganizerNode } from "../lib/knowledge-model"
import { bindGraphWheel } from "../lib/graph-wheel"

const WIDTH = 1200
const HEIGHT = 620
type View = { x: number; y: number; scale: number }
type Drag = { id: string; pointerId: number; x: number; y: number } | null

export function CampaignOrganizer({ nodes: inputNodes, edges: inputEdges, onChange }: { nodes: OrganizerNode[]; edges: OrganizerEdge[]; onChange: (nodes: OrganizerNode[], edges: OrganizerEdge[]) => void }) {
  const [nodes, setNodes] = useState(inputNodes)
  const [edges, setEdges] = useState(inputEdges)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<OrganizerNode | null>(null)
  const [linkTarget, setLinkTarget] = useState("")
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const stage = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag>(null)
  const nodesRef = useRef(nodes)

  useEffect(() => {
    const timeout = window.setTimeout(() => { nodesRef.current = inputNodes; setNodes(inputNodes); setEdges(inputEdges) }, 0)
    return () => window.clearTimeout(timeout)
  }, [inputEdges, inputNodes])

  function commit(nextNodes: OrganizerNode[], nextEdges = edges) {
    nodesRef.current = nextNodes
    setNodes(nextNodes)
    setEdges(nextEdges)
    onChange(nextNodes, nextEdges)
  }

  function addNode() {
    const node: OrganizerNode = { id: createKnowledgeId("organizer-node"), title: "Novo nó", body: "", x: Math.max(40, WIDTH / 2 - 95), y: Math.max(40, HEIGHT / 2 - 45), color: "#8d79d6" }
    commit([...nodes, node])
    setSelected(node.id)
    setEditing(node)
  }

  function saveNode() {
    if (!editing) return
    commit(nodes.map((node) => node.id === editing.id ? { ...editing, title: editing.title.trim() || "Nó sem título" } : node))
    setEditing(null)
  }

  function removeSelected() {
    if (!selected) return
    commit(nodes.filter((node) => node.id !== selected), edges.filter((edge) => edge.fromId !== selected && edge.toId !== selected))
    setSelected(null)
    setEditing(null)
  }

  function linkSelected() {
    if (!selected || !linkTarget || selected === linkTarget || edges.some((edge) => edge.fromId === selected && edge.toId === linkTarget)) return
    const edge: OrganizerEdge = { id: createKnowledgeId("organizer-edge"), fromId: selected, toId: linkTarget }
    commit(nodes, [...edges, edge])
    setLinkTarget("")
  }

  function position(event: ReactPointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) * WIDTH / bounds.width, y: (event.clientY - bounds.top) * HEIGHT / bounds.height }
  }

  function startDrag(event: ReactPointerEvent<SVGGElement>, id: string) {
    event.stopPropagation()
    const bounds = stage.current?.getBoundingClientRect()
    if (!bounds) return
    drag.current = { id, pointerId: event.pointerId, x: (event.clientX - bounds.left) * WIDTH / bounds.width, y: (event.clientY - bounds.top) * HEIGHT / bounds.height }
    stage.current?.setPointerCapture(event.pointerId)
    setSelected(id)
  }

  function moveDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const point = position(event)
    const dx = (point.x - current.x) / view.scale
    const dy = (point.y - current.y) / view.scale
    if (!current.id) {
      setView((value) => ({ ...value, x: value.x + dx, y: value.y + dy }))
      current.x = point.x
      current.y = point.y
      return
    }
    const next = nodes.map((node) => node.id === current.id ? { ...node, x: Math.max(8, Math.min(WIDTH - 208, node.x + dx)), y: Math.max(8, Math.min(HEIGHT - 100, node.y + dy)) } : node)
    current.x = point.x
    current.y = point.y
    nodesRef.current = next
    setNodes(next)
  }

  function endDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    if (drag.current.id) onChange(nodesRef.current, edges)
    drag.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* ponteiro já liberado */ }
  }

  function zoom(factor: number) {
    setView((current) => ({ ...current, scale: Math.max(0.45, Math.min(2.5, current.scale * factor)) }))
  }

  useEffect(() => {
    const svg = stage.current
    if (!svg) return
    return bindGraphWheel(svg, (event) => {
      const factor = Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * 0.004)
      setView((current) => ({ ...current, scale: Math.max(0.45, Math.min(2.5, current.scale * factor)) }))
    })
  }, [])

  return <section className="knowledge-organizer" aria-label="Organizador da campanha">
    <header className="organizer-toolbar"><div><p className="eyebrow">Aventura</p><h2>Organizador</h2><p>Arraste os nós para montar a relação entre cenas, pistas e personagens.</p></div><div className="organizer-actions"><button className="primary-button" onClick={addNode}><Plus size={16} /> Novo nó</button><button className="secondary-button" disabled={!selected || !linkTarget} onClick={linkSelected}><Link2 size={16} /> Ligar</button><button className="icon-button" disabled={!selected} onClick={() => { const node = nodes.find((item) => item.id === selected); if (node) setEditing(node) }} aria-label="Editar nó"><Pencil size={16} /></button><button className="icon-button danger-icon" disabled={!selected} onClick={removeSelected} aria-label="Apagar nó"><Trash2 size={16} /></button></div></header>
    <div className="organizer-workspace">
    {editing && <form className="organizer-editor" onSubmit={(event) => { event.preventDefault(); saveNode() }}><label><span>Título</span><input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label><label><span>Texto</span><textarea value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} /></label><label><span>Cor</span><input type="color" value={editing.color || "#8d79d6"} onChange={(event) => setEditing({ ...editing, color: event.target.value })} /></label><footer><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="primary-button">Salvar nó</button></footer></form>}
    <div className="organizer-stage">
      <div className="organizer-controls"><button onClick={() => zoom(0.8)} aria-label="Diminuir zoom"><ZoomOut size={16} /></button><button onClick={() => setView({ x: 0, y: 0, scale: 1 })} aria-label="Centralizar organizador"><Focus size={16} /></button><button onClick={() => zoom(1.2)} aria-label="Aumentar zoom"><ZoomIn size={16} /></button></div>
      <svg ref={stage} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${nodes.length} nós e ${edges.length} ligações`} onPointerDown={(event) => { if (event.target !== event.currentTarget) return; const point = position(event); drag.current = { id: "", pointerId: event.pointerId, ...point }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <g className="organizer-edges">{edges.map((edge) => { const from = nodes.find((node) => node.id === edge.fromId); const to = nodes.find((node) => node.id === edge.toId); return from && to ? <line key={edge.id} x1={from.x + 100} y1={from.y + 42} x2={to.x + 100} y2={to.y + 42} markerEnd="url(#organizer-arrow)" /> : null })}</g>
          <defs><marker id="organizer-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" /></marker></defs>
          <g className="organizer-nodes">{nodes.map((node) => <g key={node.id} transform={`translate(${node.x} ${node.y})`} className={selected === node.id ? "selected" : ""} role="button" tabIndex={0} onPointerDown={(event) => startDrag(event, node.id)} onDoubleClick={() => setEditing(node)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(node.id) }}>
            <rect width="200" height="84" rx="12" fill={node.color || "#8d79d6"} /><text x="14" y="25">{node.title || "Nó sem título"}</text><foreignObject x="14" y="34" width="172" height="40"><p>{node.body || "Sem descrição"}</p></foreignObject>
          </g>)}</g>
        </g>
      </svg>
      <p className="organizer-hint">Arraste · duplo clique para editar · roda para ampliar</p>
    </div>
    </div>
    {selected && <label className="organizer-link-target"><span>Ligar nó selecionado a</span><select value={linkTarget} onChange={(event) => setLinkTarget(event.target.value)}><option value="">Escolha um nó…</option>{nodes.filter((node) => node.id !== selected).map((node) => <option key={node.id} value={node.id}>{node.title || "Nó sem título"}</option>)}</select></label>}
  </section>
}
