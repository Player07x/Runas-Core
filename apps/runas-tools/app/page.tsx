"use client"

import { useState } from "react"
import { BookOpen, Dices, FlaskConical, Images, Layers3, ListChecks, Swords, LibraryBig } from "lucide-react"
import { PageContainer } from "@/components/layout/page-container"
import { ToolCard } from "@/components/home/tool-card"
import { FichaToolCard } from "@/components/home/ficha-tool-card"
import { PwaInstallCard } from "@/components/pwa-install-card"
import { useRuleset } from "@/components/rulesets/ruleset-provider"
import { BookSelectorDialog } from "@/components/rulesets/book-selector-dialog"

export default function HomePage() {
  const { activeRuleset, activeRulesetId, selectRuleset } = useRuleset()
  const [showBookSelector, setShowBookSelector] = useState(false)
  const isCronos = activeRulesetId === "cronos"

  return (
    <PageContainer>
      <section className="relative mb-10 overflow-hidden rounded-3xl border border-panel-border/45 bg-panel px-6 py-9 text-white shadow-[0_22px_60px_rgba(34,40,59,0.2)] sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full border-[44px] border-white/5" />
        <div className="pointer-events-none absolute bottom-[-5rem] right-24 size-40 rounded-full bg-highlight/10 blur-2xl" />
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85">
          <Dices className="size-3.5" />
          {activeRuleset.name}
        </span>
        <h1 className="relative mt-5 max-w-2xl text-4xl font-bold tracking-[-0.04em] text-white text-balance sm:text-5xl">
          Runas Tools
        </h1>
        <p className="relative mt-3 max-w-xl text-base leading-relaxed text-panel-muted text-pretty sm:text-lg">
          {isCronos ? "Ferramentas offline para fichas, testes e histórias em Sagas de Cronos." : "Uma coleção de ferramentas para facilitar partidas de Runas: Livro Azul."}
        </p>
        <button type="button" onClick={() => setShowBookSelector(true)} className="relative mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/16">
          <BookOpen className="size-4" /> Trocar livro
        </button>
      </section>

      <PwaInstallCard />

      <section aria-labelledby="available-tools-heading">
        <h2 id="available-tools-heading" className="sr-only">
          Ferramentas disponíveis
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <FichaToolCard />
          <ToolCard
            title="Calculadora de Dano"
            description="Role dados e calcule automaticamente modificadores, atributos e reduções de dano."
            icon={Swords}
            accent="blue"
            href="/calculadora-dano"
            actionLabel="Abrir calculadora"
          />
          <ToolCard
            title="Calculadora de Testes"
            description="Resolva testes de atributos e perícias com dados especiais e histórico de rolagens."
            icon={ListChecks}
            accent="yellow"
            href="/calculadora-testes"
            actionLabel="Abrir calculadora"
          />
          <ToolCard
            title="Galeria de Personagens"
            description="Salve e alterne entre até 100 fichas, com 20 personagens por página."
            icon={Images}
            href="/galeria-personagens"
            actionLabel="Abrir galeria"
          />
          <ToolCard
            title="Cartas Rúnicas"
            description="Crie cartas para ORDEM × CAOS: RÚNICA, recorte a arte e exporte em JSON ou PNG."
            icon={Layers3}
            accent="yellow"
            href="/cartas-runicas"
            actionLabel="Criar uma carta"
          />
          <ToolCard
            title="Runas Book"
            description="Consulte os livros de regras, navegue por capítulos e baixe registros prontos para sua ficha."
            icon={LibraryBig}
            accent="purple"
            href="https://runas-book.pages.dev"
            actionLabel="Abrir a wiki"
          />
        </div>
      </section>

      <div className="mt-12">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-base font-bold tracking-tight text-foreground">Em desenvolvimento</h2>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ToolCard
            title="Calculadora de Criação de Itens"
            description="Monte itens e equipamentos personalizados."
            icon={FlaskConical}
            comingSoon
          />
        </div>
      </div>
      <BookSelectorDialog open={showBookSelector} activeRulesetId={activeRulesetId} onSelect={selectRuleset} onClose={() => setShowBookSelector(false)} />
    </PageContainer>
  )
}
