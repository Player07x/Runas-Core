"use client"
import { useState } from "react"
import type { KnowledgeTag } from "../lib/knowledge-model"
export function TagEditor({ tag, onSave }: { tag?: Partial<KnowledgeTag>; onSave: (value: Pick<KnowledgeTag, "name" | "icon" | "color">) => void }) {
  const [name, setName] = useState(tag?.name ?? ""); const [icon, setIcon] = useState(tag?.icon ?? "Tag"); const [color, setColor] = useState(tag?.color ?? "#87909b")
  return <form className="knowledge-toolbar tag-editor" onSubmit={(event) => { event.preventDefault(); onSave({ name: name.trim(), icon, color }) }}><label><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da tag" required /></label><label><span>Ícone</span><select value={icon} onChange={(event) => setIcon(event.target.value)}><option>Tag</option><option>Clock3</option><option>Map</option><option>UserRound</option><option>PawPrint</option><option>Package</option><option>Building2</option><option>FolderOpen</option></select></label><label><span>Cor</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><button className="primary-button">Salvar</button></form>
}
