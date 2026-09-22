import { useCallback, useEffect, useState } from "react"

export interface KnowledgeRoute {
  campaignId: string | null
  page: string | null
  section: string | null
  tag: string | null
}

export function readKnowledgeRoute(input: string | URL = typeof window === "undefined" ? "http://localhost/" : window.location.href): KnowledgeRoute {
  const url = new URL(String(input), "http://localhost/")
  return { campaignId: url.searchParams.get("c"), page: url.searchParams.get("p"), section: url.searchParams.get("s"), tag: url.searchParams.get("t") }
}

export function knowledgeRouteUrl(path: "/campaigns" | "/wiki", route: Partial<KnowledgeRoute>): string {
  const params = new URLSearchParams()
  if (route.campaignId) params.set("c", route.campaignId)
  if (route.page) params.set("p", route.page)
  if (route.section) params.set("s", route.section)
  if (route.tag) params.set("t", route.tag)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export function pushKnowledgeRoute(path: "/campaigns" | "/wiki", route: Partial<KnowledgeRoute>): KnowledgeRoute {
  const next = knowledgeRouteUrl(path, route)
  if (typeof window !== "undefined") window.history.pushState(null, "", next)
  return readKnowledgeRoute(next)
}

export function replaceKnowledgeRoute(path: "/campaigns" | "/wiki", route: Partial<KnowledgeRoute>): KnowledgeRoute {
  const next = knowledgeRouteUrl(path, route)
  if (typeof window !== "undefined") window.history.replaceState(null, "", next)
  return readKnowledgeRoute(next)
}

/** Mantém a tela sincronizada com Voltar/Avançar do navegador. */
export function useKnowledgeRoute(path: "/campaigns" | "/wiki"): [KnowledgeRoute, (route: Partial<KnowledgeRoute>, replace?: boolean) => void] {
  const [route, setRoute] = useState<KnowledgeRoute>(() => readKnowledgeRoute())
  useEffect(() => {
    const onPopState = () => setRoute(readKnowledgeRoute())
    window.addEventListener("popstate", onPopState)
    onPopState()
    return () => window.removeEventListener("popstate", onPopState)
  }, [path])
  const navigate = useCallback((next: Partial<KnowledgeRoute>, replace = false) => {
    const result = replace ? replaceKnowledgeRoute(path, next) : pushKnowledgeRoute(path, next)
    setRoute(result)
  }, [path])
  return [route, navigate]
}
