"use client"

import { Sparkles } from "lucide-react"

/** O bestiário existe e está guardado, mas o editor de fichas deste sistema ainda não chegou ao Runas DM. */
export function BestiaryComingSoon({ systemName }: { systemName: string }) {
  return <div className="knowledge-empty wiki-onboarding">
    <Sparkles size={32} />
    <strong>Fichas de {systemName} chegam em breve</strong>
    <p>Este bestiário já está criado e guardado — nome, sistema e sincronização funcionam normalmente. O editor de fichas de {systemName} dentro do Runas DM ainda está a caminho.</p>
  </div>
}
