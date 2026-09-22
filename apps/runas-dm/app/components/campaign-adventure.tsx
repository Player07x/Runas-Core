"use client"

import { CalendarDays, Network, Swords, Target } from "lucide-react"
import type { ReactNode } from "react"
import type { OrganizerEdge, OrganizerNode } from "../lib/knowledge-model"
import { CampaignOrganizer } from "./campaign-organizer"
import { SubpageHeader } from "./subpage-header"

export type CampaignAdventureSection = "mission" | "event" | "encounter" | "organizer"
const SECTIONS: Array<{ id: CampaignAdventureSection; label: string; description: string; icon: typeof Swords }> = [
  { id: "mission", label: "Missões", description: "Ordem narrativa e status", icon: Target },
  { id: "event", label: "Eventos", description: "Registros com status", icon: CalendarDays },
  { id: "encounter", label: "Encontros", description: "Criaturas e Mesa", icon: Swords },
  { id: "organizer", label: "Organizador", description: "Nós e relações", icon: Network },
]

export function CampaignAdventure({ section, onSection, onBack, children, organizer, onOrganizerChange }: { section?: CampaignAdventureSection; onSection: (section: CampaignAdventureSection) => void; onBack: () => void; children?: ReactNode; organizer?: { nodes: OrganizerNode[]; edges: OrganizerEdge[] }; onOrganizerChange?: (nodes: OrganizerNode[], edges: OrganizerEdge[]) => void }) {
  if (!section) return <section className="campaign-subpage"><h2 className="section-title">Aventura</h2><div className="subpage-grid">{SECTIONS.map(({ id, label, icon: Icon }) => <button className="subpage-card" key={id} onClick={() => onSection(id)}><Icon size={24} /><strong>{label}</strong></button>)}</div></section>
  if (section === "organizer") return <CampaignOrganizer nodes={organizer?.nodes ?? []} edges={organizer?.edges ?? []} onChange={onOrganizerChange ?? (() => undefined)} />
  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]
  return <section className="campaign-subpage"><SubpageHeader title={`Aventura · ${current.label}`} onBack={onBack} />{children}</section>
}
