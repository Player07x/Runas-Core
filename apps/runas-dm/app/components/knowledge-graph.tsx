"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Focus, Network, Search, ZoomIn, ZoomOut } from "lucide-react"
import { effectivePageLinks, plainTextFromHtml, wikiLinkTitles, type KnowledgePage, type KnowledgePageKind } from "../lib/knowledge-model"
import { bindGraphWheel } from "../lib/graph-wheel"

const VIEWBOX_WIDTH = 1400
const VIEWBOX_HEIGHT = 850

const GRAPH_GROUPS: Array<{ id: KnowledgePageKind; label: string; color: string }> = [
  { id: "chronology", label: "Cronologia", color: "#f06f78" },
  { id: "geography", label: "Geografia", color: "#58a667" },
  { id: "characters", label: "Personagens", color: "#ff244d" },
  { id: "creatures", label: "Criaturas", color: "#35aaa5" },
  { id: "items", label: "Itens", color: "#f2aa17" },
  { id: "organizations", label: "Organizações", color: "#8d79d6" },
  { id: "mission", label: "Missões", color: "#ad95c6" },
  { id: "event", label: "Eventos", color: "#e4b368" },
  { id: "gm-note", label: "Notas", color: "#68babb" },
]

const GROUP_BY_KIND = new Map<KnowledgePageKind, (typeof GRAPH_GROUPS)[number]>(GRAPH_GROUPS.map((group) => [group.id, group]))

export interface KnowledgeGraphNode {
  page: KnowledgePage
  x: number
  y: number
  degree: number
  radius: number
  color: string
}

export interface KnowledgeGraphEdge {
  sourceId: string
  targetId: string
}

function stringHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function linksForPages(pages: KnowledgePage[]): KnowledgeGraphEdge[] {
  const byTitle = new Map(pages.map((page) => [page.title.trim().toLocaleLowerCase("pt-BR"), page.id]))
  const pageIds = new Set(pages.map((page) => page.id))
  const edgeKeys = new Set<string>()
  const edges: KnowledgeGraphEdge[] = []

  for (const page of pages) {
    const implicit = wikiLinkTitles(plainTextFromHtml(page.contentHtml))
      .map((title) => byTitle.get(title.toLocaleLowerCase("pt-BR")))
      .filter((id): id is string => Boolean(id))
    for (const targetId of [...effectivePageLinks(page, pages), ...implicit]) {
      if (!pageIds.has(targetId) || targetId === page.id) continue
      const [sourceId, normalizedTargetId] = [page.id, targetId].sort()
      const key = `${sourceId}:${normalizedTargetId}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      edges.push({ sourceId, targetId: normalizedTargetId })
    }
  }

  return edges
}

function forceLayout(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]): KnowledgeGraphNode[] {
  if (nodes.length <= 1) return nodes
  const mutable = nodes.map((node) => ({ ...node, velocityX: 0, velocityY: 0 }))
  const byId = new Map(mutable.map((node) => [node.page.id, node]))
  const iterations = Math.min(230, Math.max(130, 100 + nodes.length))

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const cooling = 1 - iteration / iterations * 0.72

    for (let leftIndex = 0; leftIndex < mutable.length; leftIndex += 1) {
      const left = mutable[leftIndex]
      for (let rightIndex = leftIndex + 1; rightIndex < mutable.length; rightIndex += 1) {
        const right = mutable[rightIndex]
        let deltaX = right.x - left.x
        let deltaY = right.y - left.y
        let distanceSquared = deltaX * deltaX + deltaY * deltaY
        if (distanceSquared < 1) {
          deltaX = ((stringHash(left.page.id) & 31) - 15) / 10 || 0.1
          deltaY = ((stringHash(right.page.id) & 31) - 15) / 10 || 0.1
          distanceSquared = deltaX * deltaX + deltaY * deltaY
        }
        const distance = Math.sqrt(distanceSquared)
        const repulsion = Math.min(4.2, 1750 / Math.max(80, distanceSquared)) * cooling
        const forceX = deltaX / distance * repulsion
        const forceY = deltaY / distance * repulsion
        left.velocityX -= forceX
        left.velocityY -= forceY
        right.velocityX += forceX
        right.velocityY += forceY

        const collisionDistance = left.radius + right.radius + 8
        if (distance < collisionDistance) {
          const overlap = (collisionDistance - distance) * 0.13
          left.velocityX -= deltaX / distance * overlap
          left.velocityY -= deltaY / distance * overlap
          right.velocityX += deltaX / distance * overlap
          right.velocityY += deltaY / distance * overlap
        }
      }
    }

    for (const edge of edges) {
      const source = byId.get(edge.sourceId)
      const target = byId.get(edge.targetId)
      if (!source || !target) continue
      const deltaX = target.x - source.x
      const deltaY = target.y - source.y
      const distance = Math.max(1, Math.hypot(deltaX, deltaY))
      const desiredDistance = 76 + Math.min(55, (source.degree + target.degree) * 2)
      const spring = (distance - desiredDistance) * 0.0075 * cooling
      const forceX = deltaX / distance * spring
      const forceY = deltaY / distance * spring
      source.velocityX += forceX
      source.velocityY += forceY
      target.velocityX -= forceX
      target.velocityY -= forceY
    }

    for (const node of mutable) {
      const groupIndex = Math.max(0, GRAPH_GROUPS.findIndex((group) => group.id === node.page.kind))
      const groupAngle = groupIndex / GRAPH_GROUPS.length * Math.PI * 2 - Math.PI / 2
      const groupRadius = node.degree === 0 ? 330 : 225
      const targetX = Math.cos(groupAngle) * groupRadius
      const targetY = Math.sin(groupAngle) * groupRadius * 0.72
      node.velocityX += (targetX - node.x) * 0.0018 * cooling
      node.velocityY += (targetY - node.y) * 0.0018 * cooling
      node.velocityX += -node.x * 0.0007
      node.velocityY += -node.y * 0.0007
      node.velocityX = Math.max(-9, Math.min(9, node.velocityX)) * 0.84
      node.velocityY = Math.max(-9, Math.min(9, node.velocityY)) * 0.84
      node.x += node.velocityX
      node.y += node.velocityY
    }
  }

  return mutable.map((node) => ({ page: node.page, x: node.x, y: node.y, degree: node.degree, radius: node.radius, color: node.color }))
}

export function buildKnowledgeGraph(pages: KnowledgePage[]): { nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] } {
  const known = new Set([...GRAPH_GROUPS.map((group) => group.id), "story", "event", "encounter"])
  pages = pages.filter((page) => known.has(page.kind))
  const edges = linksForPages(pages)
  const degree = new Map<string, number>()
  for (const edge of edges) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1)
    degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1)
  }

  const nodes = pages.map((page) => {
    const hash = stringHash(page.id)
    const groupIndex = Math.max(0, GRAPH_GROUPS.findIndex((group) => group.id === page.kind))
    const groupAngle = groupIndex / GRAPH_GROUPS.length * Math.PI * 2 - Math.PI / 2
    const jitterAngle = hash / 0xffffffff * Math.PI * 2
    const jitterRadius = 35 + (hash % 155)
    const pageDegree = degree.get(page.id) ?? 0
    return {
      page,
      x: Math.cos(groupAngle) * 225 + Math.cos(jitterAngle) * jitterRadius,
      y: Math.sin(groupAngle) * 165 + Math.sin(jitterAngle) * jitterRadius,
      degree: pageDegree,
      radius: Math.min(19, 4.5 + Math.sqrt(pageDegree) * 2.8),
      color: GROUP_BY_KIND.get(page.kind)?.color ?? "#777b7c",
    }
  })

  return { nodes: forceLayout(nodes, edges), edges }
}

type ViewTransform = { x: number; y: number; scale: number }
type PointerAction = { kind: "pan"; pointerId: number; x: number; y: number; moved: boolean } | { kind: "node"; pointerId: number; nodeId: string; x: number; y: number; moved: boolean }

function fitTransform(nodes: KnowledgeGraphNode[]): ViewTransform {
  if (nodes.length === 0) return { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2, scale: 1 }
  const minX = Math.min(...nodes.map((node) => node.x - node.radius - 70))
  const maxX = Math.max(...nodes.map((node) => node.x + node.radius + 70))
  const minY = Math.min(...nodes.map((node) => node.y - node.radius - 45))
  const maxY = Math.max(...nodes.map((node) => node.y + node.radius + 45))
  const scale = Math.min(1.35, (VIEWBOX_WIDTH - 90) / Math.max(1, maxX - minX), (VIEWBOX_HEIGHT - 90) / Math.max(1, maxY - minY))
  return { x: VIEWBOX_WIDTH / 2 - (minX + maxX) / 2 * scale, y: VIEWBOX_HEIGHT / 2 - (minY + maxY) / 2 * scale, scale }
}

export function KnowledgeGraph({ pages, onOpen }: { pages: KnowledgePage[]; onOpen: (page: KnowledgePage) => void }) {
  const calculatedGraph = useMemo(() => buildKnowledgeGraph(pages), [pages])
  const graphKey = useMemo(() => calculatedGraph.nodes.map((node) => `${node.page.id}:${node.page.updatedAt}`).sort().join("|"), [calculatedGraph.nodes])

  if (pages.length === 0) return <div className="knowledge-empty"><Network size={32} /><strong>O gráfico nasce junto com sua Wiki.</strong><p>Crie páginas e conecte-as para visualizar personagens, lugares e acontecimentos relacionados.</p></div>

  return <KnowledgeGraphView key={graphKey} graph={calculatedGraph} onOpen={onOpen} />
}

function KnowledgeGraphView({ graph: calculatedGraph, onOpen }: { graph: ReturnType<typeof buildKnowledgeGraph>; onOpen: (page: KnowledgePage) => void }) {
  const [nodes, setNodes] = useState(calculatedGraph.nodes)
  const [view, setView] = useState<ViewTransform>(() => fitTransform(calculatedGraph.nodes))
  const [query, setQuery] = useState("")
  const [hiddenKinds, setHiddenKinds] = useState<Set<KnowledgePageKind>>(() => new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const pointer = useRef<PointerAction | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const visibleIds = useMemo(() => new Set(nodes.filter((node) => !hiddenKinds.has(node.page.kind)).map((node) => node.page.id)), [hiddenKinds, nodes])
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR")
  const matchingIds = useMemo(() => new Set(nodes.filter((node) => !normalizedQuery || `${node.page.title} ${node.page.tags.join(" ")}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery)).map((node) => node.page.id)), [nodes, normalizedQuery])
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.page.id, node])), [nodes])

  const resetView = useCallback(() => setView(fitTransform(nodes.filter((node) => visibleIds.has(node.page.id)))), [nodes, visibleIds])
  const zoom = useCallback((factor: number) => setView((current) => {
    const scale = Math.max(0.32, Math.min(3.8, current.scale * factor))
    return { x: VIEWBOX_WIDTH / 2 - (VIEWBOX_WIDTH / 2 - current.x) * scale / current.scale, y: VIEWBOX_HEIGHT / 2 - (VIEWBOX_HEIGHT / 2 - current.y) * scale / current.scale, scale }
  }), [])

  function pointerPosition(event: ReactPointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) * VIEWBOX_WIDTH / bounds.width, y: (event.clientY - bounds.top) * VIEWBOX_HEIGHT / bounds.height }
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const position = pointerPosition(event)
    pointer.current = { kind: "pan", pointerId: event.pointerId, ...position, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function startNodeDrag(event: ReactPointerEvent<SVGGElement>, nodeId: string) {
    event.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    const bounds = svg.getBoundingClientRect()
    pointer.current = { kind: "node", pointerId: event.pointerId, nodeId, x: (event.clientX - bounds.left) * VIEWBOX_WIDTH / bounds.width, y: (event.clientY - bounds.top) * VIEWBOX_HEIGHT / bounds.height, moved: false }
    svg.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const action = pointer.current
    if (!action || action.pointerId !== event.pointerId) return
    const position = pointerPosition(event)
    const deltaX = position.x - action.x
    const deltaY = position.y - action.y
    if (Math.abs(deltaX) + Math.abs(deltaY) > 1.5) action.moved = true
    if (action.kind === "pan") setView((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }))
    else setNodes((current) => current.map((node) => node.page.id === action.nodeId ? { ...node, x: node.x + deltaX / view.scale, y: node.y + deltaY / view.scale } : node))
    action.x = position.x
    action.y = position.y
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const action = pointer.current
    if (!action || action.pointerId !== event.pointerId) return
    if (action.kind === "node" && !action.moved) {
      const node = nodeById.get(action.nodeId)
      if (node) onOpen(node.page)
    }
    pointer.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    return bindGraphWheel(svg, (event) => {
      const bounds = svg.getBoundingClientRect()
      const position = { x: (event.clientX - bounds.left) * VIEWBOX_WIDTH / bounds.width, y: (event.clientY - bounds.top) * VIEWBOX_HEIGHT / bounds.height }
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1)
      const factor = Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.004)
      setView((current) => {
        const scale = Math.max(0.32, Math.min(3.8, current.scale * factor))
        return { x: position.x - (position.x - current.x) * scale / current.scale, y: position.y - (position.y - current.y) * scale / current.scale, scale }
      })
    })
  }, [])

  function toggleKind(kind: KnowledgePageKind) {
    setHiddenKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  return <section className="knowledge-graph" aria-label="Gráfico de vínculos entre páginas">
    <div className="graph-stage">
      <div className="graph-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar nós…" aria-label="Filtrar nós do gráfico" /><kbd>{visibleIds.size}</kbd></div>
      <div className="graph-controls" aria-label="Controles do gráfico"><button onClick={() => zoom(0.82)} aria-label="Diminuir zoom"><ZoomOut size={17} /></button><button onClick={resetView} aria-label="Centralizar gráfico"><Focus size={17} /></button><button onClick={() => zoom(1.22)} aria-label="Aumentar zoom"><ZoomIn size={17} /></button></div>
      <svg ref={svgRef} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="img" aria-label={`${visibleIds.size} páginas e ${calculatedGraph.edges.length} vínculos`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { pointer.current = null }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <g className="graph-edges">{calculatedGraph.edges.map((edge) => {
            const source = nodeById.get(edge.sourceId)
            const target = nodeById.get(edge.targetId)
            if (!source || !target || !visibleIds.has(edge.sourceId) || !visibleIds.has(edge.targetId)) return null
            const related = hoveredId === edge.sourceId || hoveredId === edge.targetId
            return <line key={`${edge.sourceId}-${edge.targetId}`} className={related ? "related" : ""} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
          })}</g>
          <g className="graph-nodes">{nodes.map((node) => {
            if (!visibleIds.has(node.page.id)) return null
            const matches = matchingIds.has(node.page.id)
            const related = hoveredId === node.page.id || calculatedGraph.edges.some((edge) => (edge.sourceId === hoveredId && edge.targetId === node.page.id) || (edge.targetId === hoveredId && edge.sourceId === node.page.id))
            const showLabel = view.scale >= 1.15 || node.degree >= 5 || hoveredId === node.page.id || Boolean(normalizedQuery && matches)
            return <g key={node.page.id} className={`${matches ? "" : "dimmed"} ${related ? "related" : ""}`} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex={0} aria-label={`Abrir ${node.page.title}`} onPointerDown={(event) => startNodeDrag(event, node.page.id)} onPointerEnter={() => setHoveredId(node.page.id)} onPointerLeave={() => setHoveredId(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(node.page) }}>
              <circle r={node.radius + 7} className="graph-node-halo" />
              <circle r={node.radius} fill={node.color} />
              {showLabel && <text x={node.radius + 7} y="4">{node.page.title}</text>}
            </g>
          })}</g>
        </g>
      </svg>
      <p className="graph-hint">Arraste para mover · roda para ampliar · selecione um nó para abrir</p>
    </div>
    <aside className="graph-groups" aria-label="Grupos do gráfico"><header><strong>Grupos</strong><span>{calculatedGraph.edges.length} vínculos</span></header>{GRAPH_GROUPS.map((group) => {
      const count = nodes.filter((node) => node.page.kind === group.id).length
      if (!count) return null
      const enabled = !hiddenKinds.has(group.id)
      return <label key={group.id} className={enabled ? "" : "disabled"}><input type="checkbox" checked={enabled} onChange={() => toggleKind(group.id)} /><i style={{ backgroundColor: group.color }} /><span>{group.label}</span><small>{count}</small></label>
    })}</aside>
  </section>
}
