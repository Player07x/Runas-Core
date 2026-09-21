"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import type { CharacterTab } from "./character-sheet"
import { useRuleset } from "@/components/rulesets/ruleset-provider"
import { LazyBoundary } from "@/components/ui/lazy-boundary"

const CharacterPanelOverlay = dynamic(
  () => import("./character-panel-overlay").then((module) => module.CharacterPanelOverlay),
  { ssr: false },
)

const ACTIVE_TAB_STORAGE_KEY = "runas-tools:character-active-tab"

function isCharacterTab(value: string | null): value is CharacterTab {
  return value === "information" || value === "statistics" || value === "skills" || value === "bonds" || value === "abilities" || value === "inventory" || value === "spells" || value === "notes"
}

interface PanelContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  activeTab: CharacterTab
  setActiveTab: (tab: CharacterTab) => void
}

const PanelContext = createContext<PanelContextValue | null>(null)

export function CharacterPanelProvider({ children }: { children: React.ReactNode }) {
  const { activeRulesetId } = useRuleset()
  const [isOpen, setIsOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const [activeTab, setActiveTabState] = useState<CharacterTab>("information")

  const open = useCallback(() => {
    setHasOpened(true)
    setIsOpen(true)
  }, [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => {
    setHasOpened(true)
    setIsOpen((value) => !value)
  }, [])
  const setActiveTab = useCallback((tab: CharacterTab) => {
    setActiveTabState(tab)
    try {
      window.localStorage.setItem(`${ACTIVE_TAB_STORAGE_KEY}:${activeRulesetId}`, tab)
    } catch {
      // A ficha continua funcionando mesmo se o armazenamento estiver indisponível.
    }
  }, [activeRulesetId])

  useEffect(() => {
    try {
      const storedTab = window.localStorage.getItem(`${ACTIVE_TAB_STORAGE_KEY}:${activeRulesetId}`)
      if (isCharacterTab(storedTab)) setActiveTabState(storedTab)
      else setActiveTabState("information")
    } catch {
      // Mantém a aba inicial quando o armazenamento estiver indisponível.
    }
  }, [activeRulesetId])

  return (
    <PanelContext.Provider value={{ isOpen, open, close, toggle, activeTab, setActiveTab }}>
      {children}
      {hasOpened && <LazyBoundary label="a ficha"><CharacterPanelOverlay isOpen={isOpen} close={close} activeTab={activeTab} setActiveTab={setActiveTab} /></LazyBoundary>}
    </PanelContext.Provider>
  )
}

export function useCharacterPanel(): PanelContextValue {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error("useCharacterPanel deve ser usado dentro de <CharacterPanelProvider>")
  return ctx
}
