"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { BookMarked, ChevronRight, Plus } from "lucide-react"
import type { CampaignRecord } from "../lib/knowledge-model"

export function CampaignPortal({ campaigns, selectedCampaignId, pageCounts, onSelect, onCreate, onReorder, children }: { campaigns: CampaignRecord[]; selectedCampaignId: string | null; pageCounts: Map<string, number>; onSelect: (id: string) => void; onCreate: () => void; onReorder: (from: string, to: string) => void; children: ReactNode }) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const pointerStart = useRef<{ id: string; x: number; y: number } | null>(null)
  const nativeDropHandled = useRef(false)

  useEffect(() => {
    function pointerMove(event: PointerEvent) {
      const start = pointerStart.current
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) return
      setDraggedId(start.id)
      setOverId(document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-campaign-id]")?.dataset.campaignId ?? null)
    }
    function pointerUp(event: PointerEvent) {
      const start = pointerStart.current
      pointerStart.current = null
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-campaign-id]")?.dataset.campaignId
        if (target && target !== start.id) onReorder(start.id, target)
      }
      setDraggedId(null)
      setOverId(null)
    }
    window.addEventListener("pointermove", pointerMove)
    window.addEventListener("pointerup", pointerUp)
    return () => { window.removeEventListener("pointermove", pointerMove); window.removeEventListener("pointerup", pointerUp) }
  }, [onReorder])

  return <div className="knowledge-layout"><aside className="campaign-sidebar"><header><span><BookMarked size={18} /> Campanhas</span><button onClick={onCreate} aria-label="Criar campanha"><Plus size={17} /></button></header><div>{campaigns.map((campaign) => <button key={campaign.id} data-campaign-id={campaign.id} draggable className={`${campaign.id === selectedCampaignId ? "active" : ""} ${campaign.id === overId && draggedId !== overId ? "drag-over" : ""}`} onClick={() => onSelect(campaign.id)} onPointerDown={(event) => { if (event.button === 0) pointerStart.current = { id: campaign.id, x: event.clientX, y: event.clientY } }} onDragStart={(event) => { pointerStart.current = null; nativeDropHandled.current = false; setDraggedId(campaign.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", campaign.id) }} onDragOver={(event) => { event.preventDefault(); setOverId(campaign.id) }} onDrop={(event) => { event.preventDefault(); nativeDropHandled.current = true; const from = event.dataTransfer.getData("text/plain"); if (from && from !== campaign.id) onReorder(from, campaign.id); setDraggedId(null); setOverId(null) }} onDragEnd={(event) => { if (!nativeDropHandled.current) { const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-campaign-id]")?.dataset.campaignId; if (target && target !== campaign.id) onReorder(campaign.id, target) } setDraggedId(null); setOverId(null) }}><span>{campaign.title || "Campanha sem nome"}</span><small>{pageCounts.get(campaign.id) ?? 0} registros</small><ChevronRight size={15} /></button>)}</div>{campaigns.length === 0 && <p>Crie sua primeira campanha para organizar missões e sessões.</p>}</aside><section className="knowledge-workspace">{children}</section></div>
}
