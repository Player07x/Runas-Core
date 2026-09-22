"use client"
import { ArrowLeft } from "lucide-react"
export function SubpageHeader({ title, onBack }: { title: string; onBack: () => void }) { return <header className="subpage-header"><button className="secondary-button back-button" onClick={onBack}><ArrowLeft size={16} /> Voltar</button><h2>{title}</h2></header> }

