"use client"
export function SubpageHeader({ title, onBack }: { title: string; onBack: () => void }) { return <header className="knowledge-toolbar"><button onClick={onBack}>Voltar</button><h2>{title}</h2></header> }

