"use client"

import type { ReactNode } from "react"
import { BookMarked, ChevronRight, Plus } from "lucide-react"
import type { CampaignRecord } from "../lib/knowledge-model"

export function CampaignPortal({ campaigns, selectedCampaignId, pageCounts, onSelect, onCreate, children }: { campaigns: CampaignRecord[]; selectedCampaignId: string | null; pageCounts: Map<string, number>; onSelect: (id: string) => void; onCreate: () => void; children: ReactNode }) {
  return <div className="knowledge-layout"><aside className="campaign-sidebar"><header><span><BookMarked size={18} /> Campanhas</span><button onClick={onCreate} aria-label="Criar campanha"><Plus size={17} /></button></header><div>{campaigns.map((campaign) => <button key={campaign.id} className={campaign.id === selectedCampaignId ? "active" : ""} onClick={() => onSelect(campaign.id)}><span>{campaign.title || "Campanha sem nome"}</span><small>{pageCounts.get(campaign.id) ?? 0} registros</small><ChevronRight size={15} /></button>)}</div>{campaigns.length === 0 && <p>Crie sua primeira campanha para organizar missões e sessões.</p>}</aside><section className="knowledge-workspace">{children}</section></div>
}
