"use client"

import type { CSSProperties } from "react"
import type { CampaignRecord } from "../lib/knowledge-model"
import { KnowledgeImagePicker } from "./knowledge-image-picker"

export function campaignTheme(campaign: CampaignRecord | null): CSSProperties {
  if (!campaign) return {}
  return {
    ...(campaign.backgroundColor ? { "--bg": campaign.backgroundColor, background: campaign.backgroundColor } : {}),
    ...(campaign.boxColor ? { "--panel": campaign.boxColor, "--panel-2": campaign.boxColor, "--panel-hover": `color-mix(in srgb, ${campaign.boxColor} 90%, var(--text))` } : {}),
    ...(campaign.textColor ? { "--text": campaign.textColor, "--muted": `color-mix(in srgb, ${campaign.textColor} 76%, transparent)` } : {}),
    ...(campaign.accentColor ? { "--violet": campaign.accentColor, "--cyan": campaign.accentColor } : {}),
    ...(campaign.buttonColor ? { "--campaign-button": campaign.buttonColor } : {}),
  } as CSSProperties
}

export function CampaignAppearance({ campaign, onChange }: { campaign: CampaignRecord; onChange: (values: Partial<CampaignRecord>) => void }) {
  const colors = [
    ["backgroundColor", "Fundo da página", "#100d0e"],
    ["boxColor", "Caixas e painéis", "#1b1517"],
    ["buttonColor", "Botões", "#35242b"],
    ["textColor", "Textos", "#f5eeee"],
    ["accentColor", "Destaques e aba ativa", "#9987a3"],
  ] as const
  return <section className="campaign-appearance" aria-label="Estilo da campanha">
    <header><p className="eyebrow">Aparência</p><h2>Estilo da campanha</h2><p>As mudanças são salvas automaticamente e se aplicam a esta campanha.</p></header>
    <div className="campaign-color-grid">{colors.map(([field, label, fallback]) => <label key={field}><span>{label}</span><input type="color" value={campaign[field] || fallback} onChange={(event) => onChange({ [field]: event.target.value })} /><button className="secondary-button" disabled={!campaign[field]} onClick={() => onChange({ [field]: "" })}>Padrão</button></label>)}</div>
    <section className="campaign-cover-settings"><h3>Imagem da caixa da campanha</h3><p>A imagem fica atrás do nome e da descrição, com uma camada fosca para facilitar a leitura.</p>
      <KnowledgeImagePicker value={campaign.backgroundImageDataUrl || ""} onChange={(backgroundImageDataUrl) => onChange({ backgroundImageDataUrl })} />
      <label className="campaign-blur"><span>Desfoque da imagem</span><input type="range" min="0" max="24" value={campaign.imageBlur ?? 8} onChange={(event) => onChange({ imageBlur: Number(event.target.value) })} /><output>{campaign.imageBlur ?? 8} px</output></label>
    </section>
    <button className="secondary-button" onClick={() => onChange({ accentColor: "", backgroundColor: "", boxColor: "", buttonColor: "", textColor: "", imageBlur: 8 })}>Restaurar cores e desfoque padrão</button>
  </section>
}
