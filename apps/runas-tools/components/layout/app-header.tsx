"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { User } from "lucide-react"
import { cn } from "@/lib/utils"
import { navItems } from "@/data/navigation"
import { ThemeToggle } from "./theme-toggle"
import { useCharacterPanel } from "@/components/character/character-panel"
import { useRuleset } from "@/components/rulesets/ruleset-provider"
import { BRAND_LOGO_DATA_URL } from "@/lib/brandImages"
import { afterPageLoad } from "@/lib/afterPageLoad"

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname.startsWith(href)
}

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()

  // As rotas continuam pré-carregadas para a navegação ser instantânea, mas só depois
  // do carregamento: a pré-busca automática dos links disputava a primeira pintura.
  useEffect(() => afterPageLoad(() => { for (const item of navItems) router.prefetch(item.href) }), [router])
  const { open } = useCharacterPanel()
  const { activeRuleset } = useRuleset()
  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background shadow-[0_1px_0_rgba(20,25,40,0.02)]">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" prefetch={false} className="group flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <span className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-black shadow-[0_6px_18px_color-mix(in_srgb,var(--primary)_30%,transparent)] transition-transform group-hover:-rotate-3">
              {/* Logo 80×80 embutido: exibido a 40 px, sem requisição antes da primeira pintura. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BRAND_LOGO_DATA_URL} alt="Logo Runas Tools" width={80} height={80} decoding="async" className="size-full object-cover" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold tracking-tight text-foreground sm:text-base">Runas Tools</span>
              <span className="hidden truncate text-[0.62rem] font-semibold text-muted-foreground lg:block">{activeRuleset.shortName}</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                className={cn(
                    "rounded-xl px-2.5 py-2 text-sm font-semibold transition-all md:px-3.5",
                    active ? "bg-secondary text-secondary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <span className="md:hidden">{item.shortLabel}</span>
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              )
            })}
            <button
              type="button"
              onClick={open}
              className="ml-1 inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-px hover:brightness-105"
            >
              <User className="size-4" />
              Ficha
            </button>
            <div className="ml-1">
              <ThemeToggle />
            </div>
          </nav>

          {/* Mobile: theme toggle in top bar */}
          <div className="flex items-center gap-1 sm:hidden">
            <button
              type="button"
              onClick={open}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm"
            >
              <User className="size-4" />
              Ficha
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-3 bottom-3 z-30 rounded-2xl border border-border bg-card p-1.5 shadow-[0_10px_24px_rgba(24,29,45,0.16)] sm:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[0.68rem] font-semibold transition-colors min-[390px]:text-xs",
                  active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.shortLabel}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={open}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[0.68rem] font-semibold text-muted-foreground min-[390px]:text-xs"
          >
            <User className="size-5" />
            Ficha
          </button>
        </div>
      </nav>
    </>
  )
}
