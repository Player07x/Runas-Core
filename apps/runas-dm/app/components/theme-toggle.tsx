"use client"

import { Moon, Sun } from "lucide-react"
import { useSyncExternalStore } from "react"

export type Theme = "dark" | "light"

const THEME_STORAGE_KEY = "runas-dm.theme"
const listeners = new Set<() => void>()

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark"
}

function getServerSnapshot(): Theme {
  return "dark"
}

/**
 * Alterna e persiste o tema claro/escuro lendo `<html data-theme>` como fonte
 * externa (já corrigida antes da pintura pelo script inline em `layout.tsx`),
 * então este componente funciona igual no Bestiário/Mesa e em Campanhas/Wiki
 * sem duplicar a leitura do localStorage nem disparar setState num efeito.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return <button className="icon-button" onClick={() => applyTheme(theme === "dark" ? "light" : "dark")} title="Alternar tema" aria-label={`Alternar para tema ${theme === "dark" ? "claro" : "escuro"}`}>
    {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
  </button>
}
