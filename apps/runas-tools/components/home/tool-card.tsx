"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

type Accent = "purple" | "blue" | "yellow"

const accentClasses: Record<Accent, string> = {
  purple: "bg-purple-soft text-purple-foreground",
  blue: "bg-blue-soft text-blue-foreground",
  yellow: "bg-yellow-soft text-yellow-foreground",
}

interface ToolCardProps {
  title: string
  description: string
  icon: LucideIcon
  accent?: Accent
  href?: string
  onClick?: () => void
  actionLabel?: string
  comingSoon?: boolean
}

export function ToolCard({
  title,
  description,
  icon: Icon,
  accent = "purple",
  href,
  onClick,
  actionLabel,
  comingSoon,
}: ToolCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex size-12 items-center justify-center rounded-2xl", accentClasses[accent])}>
          <Icon className="size-5.5" />
        </span>
        {comingSoon && (
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[0.7rem] font-semibold text-foreground">
            Em breve
          </span>
        )}
      </div>
      <div className="mt-5">
        <h3 className="text-lg font-bold tracking-tight text-card-foreground text-balance">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
      </div>
      {!comingSoon && actionLabel && (
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
          {actionLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  )

  const base = "flex min-h-56 flex-col rounded-2xl border border-border/90 bg-card p-5 shadow-[0_10px_30px_rgba(30,36,55,0.06)] sm:p-6"
  const interactive = "group transition-all duration-200 hover:-translate-y-1 hover:border-primary/45 hover:shadow-[0_16px_40px_rgba(30,36,55,0.12)]"

  if (comingSoon) {
    return <div className={cn(base, "border-dashed bg-card/75")}>{content}</div>
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, interactive, "text-left")}>
        {content}
      </button>
    )
  }

  if (href) {
    return (
      <Link href={href} prefetch={false} className={cn(base, interactive)}>
        {content}
      </Link>
    )
  }

  return <div className={cn(base, "opacity-60")}>{content}</div>
}
