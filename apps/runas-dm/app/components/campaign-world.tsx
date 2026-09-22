"use client"

import { Building2, MapPin, Package, Plus, UserRound, Unlink } from "lucide-react"
import type { KnowledgePage, KnowledgePageKind } from "../lib/knowledge-model"
import { SubpageHeader } from "./subpage-header"
import { KnowledgeCardImage } from "./knowledge-card-image"

export type CampaignWorldSection = "geography" | "organizations" | "items" | "characters"
const WORLD_SECTIONS: Array<{ id: CampaignWorldSection; label: string; singular: string; kind: KnowledgePageKind; icon: typeof MapPin }> = [
  { id: "geography", label: "Locais", singular: "local", kind: "geography", icon: MapPin },
  { id: "organizations", label: "Organizações", singular: "organização", kind: "organizations", icon: Building2 },
  { id: "items", label: "Itens", singular: "item", kind: "items", icon: Package },
  { id: "characters", label: "Personagens", singular: "personagem", kind: "characters", icon: UserRound },
]

export function CampaignWorld({ pages, allWikiPages, linkedIds, section, onSection, onCreate, onLink, onOpen, onUnlink, onBack }: { pages: KnowledgePage[]; allWikiPages: KnowledgePage[]; linkedIds: string[]; section?: CampaignWorldSection; onSection: (section: CampaignWorldSection) => void; onCreate: (kind: KnowledgePageKind, label: string) => void; onLink: (id: string) => void; onOpen: (page: KnowledgePage) => void; onUnlink: (id: string) => void; onBack: () => void }) {
  if (!section) return <section className="campaign-subpage"><h2 className="section-title">Mundo</h2><div className="subpage-grid">{WORLD_SECTIONS.map(({ id, label, icon: Icon }) => <button className="subpage-card" key={id} onClick={() => onSection(id)}><Icon size={24} /><strong>{label}</strong><small>{pages.filter((page) => page.kind === id).length} vinculados</small></button>)}</div></section>
  const current = WORLD_SECTIONS.find((item) => item.id === section) ?? WORLD_SECTIONS[0]
  const linked = pages.filter((page) => page.kind === current.kind)
  const choices = allWikiPages.filter((page) => page.kind === current.kind && !linkedIds.includes(page.id))
  return <section className="campaign-subpage"><SubpageHeader title={`Mundo · ${current.label}`} onBack={onBack} /><div className="subpage-actions"><button className="primary-button" onClick={() => onCreate(current.kind, current.label)}><Plus size={16} /> Criar {current.singular}</button><label><span>Vincular existente</span><select defaultValue="" onChange={(event) => { if (event.target.value) onLink(event.target.value); event.currentTarget.value = "" }}><option value="">Escolha uma página da Wiki…</option>{choices.map((page) => <option key={page.id} value={page.id}>{page.title || "Página sem nome"}</option>)}</select></label></div>{linked.length === 0 ? <div className="knowledge-empty"><current.icon size={30} /><strong>Nenhum registro vinculado.</strong><p>Crie uma página da Wiki ou vincule uma que já exista.</p></div> : <div className="world-linked-list">{linked.map((page) => <article className="world-linked-card" key={page.id}><button className="world-linked-main" onClick={() => onOpen(page)}><KnowledgeCardImage page={page} /><span><strong>{page.title || "Página sem nome"}</strong><small>{page.summary || "Sem resumo."}</small></span></button><button className="secondary-button world-unlink" onClick={() => onUnlink(page.id)} aria-label={`Desvincular ${page.title}`}><Unlink size={15} /> Desvincular</button></article>)}</div>}</section>
}
