"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { Character, CharacterGalleryEntry } from "@runas/core/types/character"
import { synchronizeCharacterDerivedValues } from "@runas/core/lib/characterSynchronization"
import { createEmptyCharacter } from "@/lib/characterStorage"
import { loadCharacterDatabase, loadCharacterGalleryDatabase, saveCharacterDatabase, saveCharacterGalleryDatabase } from "@/lib/characterDatabase"
import { GALLERY_MAX_CHARACTERS } from "@/lib/galleryLimits"
import { characterFromVttToken, getRunasVtt, toVttCharacter } from "@runas/vtt-bridge"
import { isRunasVttSeat } from "@/lib/vttBridge"

type SaveStatus = "idle" | "saving" | "saved"

interface CharacterContextValue {
  character: Character
  /** Atualiza a ficha via updater imutável. */
  updateCharacter: (updater: (prev: Character) => Character) => void
  /** Substitui a ficha inteira (ex: importação). */
  replaceCharacter: (next: Character) => void
  /** Reseta para uma ficha em branco. */
  resetCharacter: () => void
  saveStatus: SaveStatus
  /** Indica se a ficha já foi hidratada do armazenamento local. */
  isReady: boolean
  galleryEntries: CharacterGalleryEntry[]
  activeGalleryId: string | null
  saveCurrentToGallery: () => boolean
  createGalleryCharacter: () => boolean
  importGalleryCharacter: (character: Character) => boolean
  importGalleryCharacters: (characters: Character[]) => number
  useGalleryCharacter: (id: string) => void
  deleteGalleryCharacter: (id: string) => void
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: React.ReactNode }) {
  const [character, setCharacter] = useState<Character>(() => createEmptyCharacter())
  const [isReady, setIsReady] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [storedGalleryEntries, setStoredGalleryEntries] = useState<CharacterGalleryEntry[]>([])
  const [isGalleryReady, setIsGalleryReady] = useState(false)
  const [activeGalleryId, setActiveGalleryId] = useState<string | null>(null)
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const galleryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remoteUpdate = useRef(false)
  const characterRef = useRef(character)

  useEffect(() => { characterRef.current = character }, [character])

  // Hidrata a ficha do IndexedDB e migra automaticamente o formato legado.
  useEffect(() => {
    let active = true
    let idleId: number | null = null
    void loadCharacterDatabase().then((stored) => {
      if (!active) return
      setCharacter(stored ?? createEmptyCharacter())
      setIsReady(true)

      const hydrateGallery = () => void loadCharacterGalleryDatabase().then((gallery) => {
        if (!active) return
        let entries = gallery.entries
        let activeId = gallery.activeId
        if (entries.length === 0 && stored) {
          activeId = crypto.randomUUID()
          entries = [{ id: activeId, character: stored, updatedAt: Date.now() }]
        }
        setStoredGalleryEntries(entries.map((entry) => entry.id === activeId && stored ? { ...entry, character: stored } : entry))
        setActiveGalleryId(activeId)
        setIsGalleryReady(true)
      }).catch(() => setIsGalleryReady(true))

      idleId = window.requestIdleCallback(hydrateGallery, { timeout: 1200 })
    })
    return () => {
      active = false
      if (idleId !== null) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [])

  // Uma sessão de jogador também recebe alterações feitas pelo mestre. O
  // envelope continua sendo reconstruído pelo Runas Core; o VTT só transporta.
  useEffect(() => {
    if (!isReady || !isRunasVttSeat() || typeof window === "undefined") return
    const bridge = getRunasVtt(window)
    if (!bridge) return
    let active = true
    const pull = async () => {
      try {
        const token = (await bridge.getTokens())[0]
        if (!active || !token) return
        const incoming = characterFromVttToken(token)
        if (JSON.stringify(incoming) !== JSON.stringify(characterRef.current)) {
          remoteUpdate.current = true
          setCharacter(incoming)
        }
      } catch { /* reconexão ou ficha ainda não anexada */ }
    }
    const unsubscribe = bridge.onTokensChanged(() => { void pull() })
    void pull()
    return () => { active = false; unsubscribe() }
  }, [isReady])

  // Autosave com debounce: agrupa edições rápidas em uma única transação e,
  // quando o Tools veio de um assento, envia a mesma versão ao VTT.
  useEffect(() => {
    if (!isReady) return
    setSaveStatus("saving")
    if (savedTimeout.current) clearTimeout(savedTimeout.current)
    const saveTimeout = setTimeout(() => {
      void saveCharacterDatabase(character).then(() => setSaveStatus("saved"))
    }, 300)
    savedTimeout.current = saveTimeout
    let vttTimeout: ReturnType<typeof setTimeout> | null = null
    if (remoteUpdate.current) {
      remoteUpdate.current = false
    } else if (isRunasVttSeat() && typeof window !== "undefined") {
      vttTimeout = setTimeout(async () => {
        try {
          const bridge = getRunasVtt(window)
          const token = bridge ? (await bridge.getTokens())[0] : null
          if (bridge && token) {
            const value = toVttCharacter(characterRef.current, "tools")
            await bridge.updateTokenCharacter(token.id, value.envelope, value.summary)
          }
        } catch { /* a conflict will be surfaced by the next bridge refresh */ }
      }, 400)
    }
    return () => { clearTimeout(saveTimeout); if (vttTimeout) clearTimeout(vttTimeout) }
  }, [character, isReady])

  useEffect(() => {
    if (!isReady || !activeGalleryId) return
    setStoredGalleryEntries((current) => current.map((entry) => entry.id === activeGalleryId
      ? { ...entry, character, updatedAt: Date.now() }
      : entry))
  }, [activeGalleryId, character, isReady])

  const galleryEntries = storedGalleryEntries

  useEffect(() => {
    if (!isReady || !isGalleryReady) return
    if (galleryTimeout.current) clearTimeout(galleryTimeout.current)
    const timeout = setTimeout(() => {
      void saveCharacterGalleryDatabase({ activeId: activeGalleryId, entries: galleryEntries })
    }, 350)
    galleryTimeout.current = timeout
    return () => clearTimeout(timeout)
  }, [activeGalleryId, galleryEntries, isGalleryReady, isReady])

  const updateCharacter = useCallback((updater: (prev: Character) => Character) => {
    setCharacter((prev) => synchronizeCharacterDerivedValues(prev, updater(prev)))
  }, [])

  const replaceCharacter = useCallback((next: Character) => {
    setCharacter(synchronizeCharacterDerivedValues(next, next))
  }, [])

  const resetCharacter = useCallback(() => {
    setCharacter(createEmptyCharacter())
  }, [])

  const saveCurrentToGallery = useCallback(() => {
    if (galleryEntries.length >= GALLERY_MAX_CHARACTERS) return false
    const id = crypto.randomUUID()
    setStoredGalleryEntries((current) => [...current, { id, character, updatedAt: Date.now() }])
    setActiveGalleryId(id)
    return true
  }, [character, galleryEntries.length])

  const createGalleryCharacter = useCallback(() => {
    if (galleryEntries.length >= GALLERY_MAX_CHARACTERS) return false
    const id = crypto.randomUUID()
    const next = createEmptyCharacter()
    setStoredGalleryEntries((current) => [
      ...current.map((entry) => entry.id === activeGalleryId ? { ...entry, character, updatedAt: Date.now() } : entry),
      { id, character: next, updatedAt: Date.now() },
    ])
    setActiveGalleryId(id)
    setCharacter(next)
    return true
  }, [activeGalleryId, character, galleryEntries.length])

  const importGalleryCharacter = useCallback((imported: Character) => {
    if (galleryEntries.length >= GALLERY_MAX_CHARACTERS) return false
    const id = crypto.randomUUID()
    setStoredGalleryEntries((current) => [...current, { id, character: imported, updatedAt: Date.now() }])
    return true
  }, [galleryEntries.length])

  const importGalleryCharacters = useCallback((imported: Character[]) => {
    const accepted = imported.slice(0, Math.max(0, GALLERY_MAX_CHARACTERS - galleryEntries.length))
    if (accepted.length === 0) return 0
    const updatedAt = Date.now()
    setStoredGalleryEntries((current) => [
      ...current,
      ...accepted.map((nextCharacter) => ({ id: crypto.randomUUID(), character: nextCharacter, updatedAt })),
    ])
    return accepted.length
  }, [galleryEntries.length])

  const useGalleryCharacter = useCallback((id: string) => {
    const entry = galleryEntries.find((candidate) => candidate.id === id)
    if (!entry) return
    setStoredGalleryEntries((current) => current.map((candidate) => candidate.id === activeGalleryId
      ? { ...candidate, character, updatedAt: Date.now() }
      : candidate))
    setActiveGalleryId(id)
    setCharacter(entry.character)
  }, [activeGalleryId, character, galleryEntries])

  const deleteGalleryCharacter = useCallback((id: string) => {
    setStoredGalleryEntries((current) => current.filter((entry) => entry.id !== id))
    setActiveGalleryId((current) => current === id ? null : current)
  }, [])

  return (
    <CharacterContext.Provider
      value={{ character, updateCharacter, replaceCharacter, resetCharacter, saveStatus, isReady, galleryEntries, activeGalleryId, saveCurrentToGallery, createGalleryCharacter, importGalleryCharacter, importGalleryCharacters, useGalleryCharacter, deleteGalleryCharacter }}
    >
      {children}
    </CharacterContext.Provider>
  )
}

export function useCharacter(): CharacterContextValue {
  const ctx = useContext(CharacterContext)
  if (!ctx) throw new Error("useCharacter deve ser usado dentro de <CharacterProvider>")
  return ctx
}
