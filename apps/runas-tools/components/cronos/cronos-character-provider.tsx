"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { CronosCharacter, CronosCharacterGalleryEntry } from "@runas/cronos-core/types/character"
import { createEmptyCronosCharacter } from "@runas/cronos-core/lib/characterStorage"
import { synchronizeCronosCharacter } from "@runas/cronos-core/lib/characterSynchronization"
import { loadCronosCharacterDatabase, loadCronosCharacterGalleryDatabase, saveCronosCharacterDatabase, saveCronosCharacterGalleryDatabase } from "@/lib/cronosCharacterDatabase"
import { createId } from "@runas/core/lib/ids"

type SaveStatus = "idle" | "saving" | "saved"

interface CronosCharacterContextValue {
  character: CronosCharacter
  updateCharacter: (updater: (previous: CronosCharacter) => CronosCharacter) => void
  replaceCharacter: (character: CronosCharacter) => void
  resetCharacter: () => void
  saveStatus: SaveStatus
  isReady: boolean
  galleryEntries: CronosCharacterGalleryEntry[]
  activeGalleryId: string | null
  createGalleryCharacter: () => boolean
  importGalleryCharacter: (character: CronosCharacter) => boolean
  useGalleryCharacter: (id: string) => void
  deleteGalleryCharacter: (id: string) => void
}

const CronosCharacterContext = createContext<CronosCharacterContextValue | null>(null)

export function CronosCharacterProvider({ children }: { children: React.ReactNode }) {
  const [character, setCharacter] = useState(createEmptyCronosCharacter)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [isReady, setIsReady] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const galleryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [galleryEntries, setGalleryEntries] = useState<CronosCharacterGalleryEntry[]>([])
  const [activeGalleryId, setActiveGalleryId] = useState<string | null>(null)
  const [isGalleryReady, setIsGalleryReady] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([loadCronosCharacterDatabase(), loadCronosCharacterGalleryDatabase()]).then(([stored, gallery]) => {
      if (!active) return
      const hydrated = synchronizeCronosCharacter(stored ?? createEmptyCronosCharacter())
      setCharacter(hydrated)
      let entries = gallery.entries
      let activeId = gallery.activeId
      if (entries.length === 0 && stored) {
        activeId = createId()
        entries = [{ id: activeId, character: hydrated, updatedAt: Date.now() }]
      }
      setGalleryEntries(entries.map((entry) => entry.id === activeId ? { ...entry, character: hydrated } : entry))
      setActiveGalleryId(activeId)
      setIsGalleryReady(true)
      setIsReady(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!isReady) return
    setSaveStatus("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void saveCronosCharacterDatabase(character).then(() => setSaveStatus("saved"))
    }, 300)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [character, isReady])

  useEffect(() => {
    if (!isReady || !activeGalleryId) return
    setGalleryEntries((entries) => entries.map((entry) => entry.id === activeGalleryId ? { ...entry, character, updatedAt: Date.now() } : entry))
  }, [activeGalleryId, character, isReady])

  useEffect(() => {
    if (!isReady || !isGalleryReady) return
    if (galleryTimer.current) clearTimeout(galleryTimer.current)
    galleryTimer.current = setTimeout(() => void saveCronosCharacterGalleryDatabase({ activeId: activeGalleryId, entries: galleryEntries }), 350)
    return () => { if (galleryTimer.current) clearTimeout(galleryTimer.current) }
  }, [activeGalleryId, galleryEntries, isGalleryReady, isReady])

  const updateCharacter = useCallback((updater: (previous: CronosCharacter) => CronosCharacter) => {
    setCharacter((previous) => synchronizeCronosCharacter(updater(previous)))
  }, [])

  const replaceCharacter = useCallback((next: CronosCharacter) => setCharacter(synchronizeCronosCharacter(next)), [])
  const resetCharacter = useCallback(() => setCharacter(createEmptyCronosCharacter()), [])

  const createGalleryCharacter = useCallback(() => {
    if (galleryEntries.length >= 100) return false
    const id = createId()
    const next = createEmptyCronosCharacter()
    setGalleryEntries((entries) => [...entries, { id, character: next, updatedAt: Date.now() }])
    setActiveGalleryId(id)
    setCharacter(next)
    return true
  }, [galleryEntries.length])

  const importGalleryCharacter = useCallback((imported: CronosCharacter) => {
    if (galleryEntries.length >= 100) return false
    setGalleryEntries((entries) => [...entries, { id: createId(), character: synchronizeCronosCharacter(imported), updatedAt: Date.now() }])
    return true
  }, [galleryEntries.length])

  const useGalleryCharacter = useCallback((id: string) => {
    const entry = galleryEntries.find((candidate) => candidate.id === id)
    if (!entry) return
    setActiveGalleryId(id)
    setCharacter(entry.character)
  }, [galleryEntries])

  const deleteGalleryCharacter = useCallback((id: string) => {
    setGalleryEntries((entries) => entries.filter((entry) => entry.id !== id))
    setActiveGalleryId((active) => active === id ? null : active)
  }, [])

  return (
    <CronosCharacterContext.Provider value={{ character, updateCharacter, replaceCharacter, resetCharacter, saveStatus, isReady, galleryEntries, activeGalleryId, createGalleryCharacter, importGalleryCharacter, useGalleryCharacter, deleteGalleryCharacter }}>
      {children}
    </CronosCharacterContext.Provider>
  )
}

export function useCronosCharacter(): CronosCharacterContextValue {
  const context = useContext(CronosCharacterContext)
  if (!context) throw new Error("useCronosCharacter deve ser usado dentro de <CronosCharacterProvider>")
  return context
}
