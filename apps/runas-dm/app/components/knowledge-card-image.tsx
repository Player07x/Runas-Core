"use client"

import { useEffect, useState } from "react"
import type { KnowledgePage } from "../lib/knowledge-model"
import { readCachedVaultAsset } from "../lib/vault-assets"

export function KnowledgeCardImage({ page }: { page: KnowledgePage }) {
  const [preview, setPreview] = useState<{ html: string; src: string } | null>(null)
  useEffect(() => {
    if (page.backgroundImageDataUrl) return
    const image = new DOMParser().parseFromString(page.contentHtml, "text/html").querySelector("img")
    if (!image) return
    const path = image.getAttribute("data-obsidian-path")
    const source = image.getAttribute("src") || ""
    let active = true
    let objectUrl = ""
    const task = path ? readCachedVaultAsset(path).then((blob) => { if (blob && active) objectUrl = URL.createObjectURL(blob); return objectUrl }) : Promise.resolve(/^(data:image\/|https?:\/\/)/i.test(source) ? source : "")
    void task.then((src) => { if (active) setPreview({ html: page.contentHtml, src }) }).catch(() => { /* A missing local attachment leaves the card text visible. */ })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [page.backgroundImageDataUrl, page.contentHtml])
  const src = page.backgroundImageDataUrl || (preview?.html === page.contentHtml ? preview.src : "")
  return src ? <img className="knowledge-card-image" src={src} alt="" loading="lazy" /> : null
}
