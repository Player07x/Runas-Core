"use client"
import { useState } from "react"
import type { OrganizerNode, OrganizerEdge } from "../lib/knowledge-model"
export function CampaignOrganizer({ nodes, edges, onChange }: { nodes: OrganizerNode[]; edges: OrganizerEdge[]; onChange: (nodes: OrganizerNode[], edges: OrganizerEdge[]) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  return <div className="knowledge-organizer" style={{ position: "relative", minHeight: 420 }}><svg width="100%" height="420" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{edges.map((edge) => { const from = nodes.find((node) => node.id === edge.fromId); const to = nodes.find((node) => node.id === edge.toId); return from && to ? <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" markerEnd="url(#arrow)" /> : null })}<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor" /></marker></defs></svg>{nodes.map((node) => <article key={node.id} className="knowledge-card" style={{ position: "absolute", left: node.x, top: node.y, width: 180, cursor: "move" }} onClick={() => setSelected(node.id)}><strong>{node.title || "Nó sem título"}</strong><p>{node.body}</p>{selected === node.id && <button onClick={(event) => { event.stopPropagation(); onChange(nodes.filter((item) => item.id !== node.id), edges.filter((edge) => edge.fromId !== node.id && edge.toId !== node.id)); setSelected(null) }}>Apagar</button>}</article>)}</div>
}

