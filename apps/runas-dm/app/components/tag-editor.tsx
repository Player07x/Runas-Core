"use client"
import { useState } from "react"
import type { KnowledgeTag } from "../lib/knowledge-model"
import { tagEmoji } from "./tag-grid"
export function TagEditor({ tag, onSave }: { tag?: Partial<KnowledgeTag>; onSave: (value: Pick<KnowledgeTag, "name" | "icon" | "color">) => void }) {
  const [name, setName] = useState(tag?.name ?? ""); const [icon, setIcon] = useState(tagEmoji(tag?.icon ?? "🏷️")); const [color, setColor] = useState(tag?.color ?? "#87909b")
  return <form className="tag-editor" onSubmit={(event) => { event.preventDefault(); onSave({ name: name.trim(), icon: icon.trim() || "🏷️", color }) }}><label><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da tag" required /></label><label><span>Emoji</span><input className="tag-emoji-input" value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="🏷️" aria-label="Emoji da tag" /></label><label><span>Cor</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><button className="primary-button">Salvar tag</button></form>
}
