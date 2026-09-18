"use client"

import { useState } from "react"
import { ChevronDown, CircleHelp, Eye, EyeOff, LockKeyhole, TriangleAlert } from "lucide-react"
import type { CharacterInfo as CharacterInfoType } from "@runas/core/types/character"
import { raceOptions as defaultRaceOptions } from "@runas/core/data/races"
import { cn } from "@/lib/utils"
import { CharacterPortraitEditor } from "./character-portrait-editor"
import { CharacterTokenEditor } from "./character-token-editor"

interface Props {
  name: string
  info: CharacterInfoType
  onNameChange: (value: string) => void
  onInfoChange: (key: keyof CharacterInfoType, value: string) => void
  portraitDataUrl?: string
  onPortraitChange: (value: string | undefined) => void
  tokenImageDataUrl?: string
  tokenSize?: number
  onTokenChange: (value: { tokenImageDataUrl?: string; tokenSize: number }) => void
}

interface FieldProps {
  label: string
  value: string
  onChange?: (value: string) => void
  required?: boolean
  maxLength?: number
  inputMode?: "text" | "numeric" | "decimal"
  min?: number
  max?: number
  step?: number
  readOnly?: boolean
  className?: string
  inputClassName?: string
  placeholder?: string
  onBlur?: (value: string) => void
  optional?: boolean
  defaultValueLabel?: string
  caution?: string
}

function Field({
  label,
  value,
  onChange,
  required,
  maxLength,
  inputMode = "text",
  min,
  max,
  step,
  readOnly,
  className,
  inputClassName,
  placeholder,
  onBlur,
  optional,
  defaultValueLabel,
  caution,
}: FieldProps) {
  const type = inputMode === "text" ? "text" : "number"
  return (
    <label className={cn("character-field grid min-w-0 gap-0.5", className)}>
      <span className="flex min-w-0 flex-wrap items-end gap-x-1.5 gap-y-0.5 px-2 text-sm leading-tight text-muted-foreground">
        <span>
          {label}
          {required && <span className="ml-1 text-primary" aria-label="obrigatório">*</span>}
        </span>
        {optional && (
          <span
            className="group/help relative inline-flex cursor-help items-center gap-1 rounded-full border border-yellow/40 bg-yellow-soft px-2 py-0.5 text-[0.65rem] font-semibold leading-none text-yellow-foreground outline-none"
            tabIndex={caution ? 0 : undefined}
            title={caution}
            aria-label={caution}
          >
            Opcional{defaultValueLabel ? ` · padrão ${defaultValueLabel}` : ""}
            {caution && <CircleHelp className="size-3" aria-hidden="true" />}
            {caution && (
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-64 rounded-xl border border-border bg-popover p-3 text-xs font-normal leading-relaxed text-popover-foreground shadow-xl group-hover/help:block group-focus/help:block"
              >
                {caution}
              </span>
            )}
          </span>
        )}
        {caution && !optional && (
          <span
            className="group/help relative mb-px inline-flex cursor-help items-center text-yellow-foreground outline-none"
            tabIndex={0}
            title={caution}
            aria-label={caution}
          >
            <CircleHelp className="size-4" aria-hidden="true" />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-64 rounded-xl border border-border bg-popover p-3 text-xs font-normal leading-relaxed text-popover-foreground shadow-xl group-hover/help:block group-focus/help:block"
            >
              {caution}
            </span>
          </span>
        )}
      </span>
      <span className="relative block min-w-0">
        <input
          type={type}
          value={value}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          onBlur={onBlur ? (event) => onBlur(event.target.value) : undefined}
          required={required}
          maxLength={maxLength}
          inputMode={inputMode}
          min={min}
          max={max}
          step={step}
          readOnly={readOnly}
          placeholder={placeholder}
          className={cn(
            "h-12 w-full min-w-0 rounded-[18px] border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 read-only:cursor-default read-only:bg-muted read-only:text-muted-foreground sm:h-11",
            caution && "border-dashed border-yellow/60 bg-yellow-soft/35 pr-11 dark:bg-yellow-soft/10",
            inputClassName,
          )}
        />
        {caution && (
          <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-yellow-foreground/80" aria-hidden="true" />
        )}
      </span>
    </label>
  )
}

function clampNumber(value: string, min: number, max: number): string {
  const parsed = Number(value.replace(",", "."))
  if (!Number.isFinite(parsed)) return value
  return String(Math.min(max, Math.max(min, parsed)))
}

function Select({
  label,
  value,
  onChange,
  options,
  required,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  required?: boolean
  className?: string
}) {
  return (
    <label className={cn("character-field grid min-w-0 gap-0.5", className)}>
      <span className="flex items-end px-2 text-sm leading-tight text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-primary" aria-label="obrigatório">*</span>}
      </span>
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          className="h-12 w-full appearance-none rounded-[18px] border border-input bg-background px-4 pr-10 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 sm:h-11"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  )
}

export function CharacterInfo({ name, info, onNameChange, onInfoChange, portraitDataUrl, onPortraitChange, tokenImageDataUrl, tokenSize = 1, onTokenChange }: Props) {
  const [showBaseFields, setShowBaseFields] = useState(false)
  const [showScaleExplanation, setShowScaleExplanation] = useState(false)
  const raceOptions = defaultRaceOptions.some((option) => option.value === info.race)
    ? defaultRaceOptions
    : [{ value: info.race, label: info.race }, ...defaultRaceOptions]

  return (
    <section aria-label="Informações do personagem" className="rounded-b-[27px] rounded-t-none border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-end gap-3">
          <span className="text-right text-sm leading-tight text-muted-foreground">Ano<br />Atual</span>
          <input
            aria-label="Ano atual"
            title="No calendário élfico, use um valor negativo para anos anteriores à sua criação."
            type="number"
            inputMode="numeric"
            value={info.currentYear}
            onChange={(event) => onInfoChange("currentYear", event.target.value)}
            className="size-16 rounded-full border-2 border-yellow/40 bg-yellow-soft text-center text-xl font-bold text-yellow-foreground outline-none focus:border-yellow"
          />
          <span className="relative">
            <select
              aria-label="Calendário"
              value={info.calendar}
              onChange={(event) => onInfoChange("calendar", event.target.value)}
              className="h-12 appearance-none rounded-[18px] border border-input bg-background pl-4 pr-10 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40 sm:h-11"
            >
              <option value="logi">Logi</option>
              <option value="ce">C.E.</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[12.5rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <CharacterPortraitEditor value={portraitDataUrl} onChange={onPortraitChange} />
          <CharacterTokenEditor image={tokenImageDataUrl} size={tokenSize} onChange={onTokenChange} />
        </div>
        <div className="grid min-w-0 gap-y-2">
          <Field label="Nome" value={name} onChange={onNameChange} maxLength={80} required />

          <div className="grid min-w-0 grid-rows-[1.5rem_auto] gap-0.5">
            <span className="flex items-end px-2 text-sm leading-tight text-muted-foreground">
              Raça e Espécie <span className="text-primary" aria-label="obrigatório">*</span>
            </span>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,0.72fr)] overflow-hidden rounded-[18px] border border-input bg-background transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
              <label className="relative min-w-0 border-r border-input">
                <span className="sr-only">Raça</span>
                <select
                  value={info.race}
                  onChange={(event) => onInfoChange("race", event.target.value)}
                  required
                  className="h-12 w-full appearance-none bg-transparent px-4 pr-9 text-sm text-foreground outline-none sm:h-11"
                >
                  {raceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              </label>
              <label className="min-w-0">
                <span className="sr-only">Espécie</span>
                <input
                  value={info.species}
                  onChange={(event) => onInfoChange("species", event.target.value)}
                  maxLength={20}
                  placeholder="Espécie"
                  className="h-12 w-full min-w-0 bg-transparent px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground sm:h-11"
                />
              </label>
            </div>
          </div>
          <Field label="Ofício" value={info.profession} onChange={(value) => onInfoChange("profession", value)} maxLength={30} />
          <div className="aligned-field-grid grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <Field label="Nascimento" value={info.birthDate} onChange={(value) => onInfoChange("birthDate", value)} maxLength={20} required placeholder="400/12/01 Logi ou 01/12/-100 C.E." />
            <Field label="Idade" value={info.age} readOnly />
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        <Field label="Região" value={info.region} onChange={(value) => onInfoChange("region", value)} maxLength={40} />

        <Select
          label="Classe"
          value={info.characterClass}
          onChange={(value) => onInfoChange("characterClass", value)}
          options={[
            { value: "", label: "Selecione" },
            { value: "Reforço", label: "Reforço" },
            { value: "Ampliação", label: "Ampliação" },
            { value: "Invocação", label: "Invocação" },
          ]}
        />
        <Field label="Arquétipo" value={info.archetype} onChange={(value) => onInfoChange("archetype", value)} maxLength={40} />

        <Field label="Afinidade" value={info.affinity} readOnly />
        <div className="aligned-field-grid grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.85fr)] gap-3">
          <Field label="Eficiência (%)" value={info.efficiency} readOnly />
          <Field label="Essências" value={info.essences} onChange={(value) => onInfoChange("essences", value)} inputMode="numeric" min={0} step={1} required />
        </div>

        <Field label="Divindade" value={info.deity} onChange={(value) => onInfoChange("deity", value)} maxLength={40} />
        <div className="aligned-field-grid grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <Field label="Alinhamento" value={info.alignment} readOnly />
          <Field label="Carma" value={info.karma} onChange={(value) => onInfoChange("karma", value)} inputMode="numeric" min={-60} max={60} step={1} required />
        </div>

        <Field label="Legado" value={info.legacy} onChange={(value) => onInfoChange("legacy", value)} maxLength={40} required />
        <div className="aligned-field-grid grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <Field label="Raridade" value={info.legacyRarity} readOnly />
          <Field label="Pontos" value={info.legacyPoints} onChange={(value) => onInfoChange("legacyPoints", value)} inputMode="numeric" min={0} step={1} required />
        </div>

        <div className="space-y-2.5 rounded-[22px] border border-border bg-muted/25 p-2.5 sm:col-span-2">
          <p className="px-2 text-sm font-semibold text-foreground">Escala, dimensões e peso</p>

          <div className="aligned-field-grid grid grid-cols-1 gap-x-2.5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tamanho Real (m)" value={info.sizeReal} onChange={(value) => onInfoChange("sizeReal", value)} inputMode="decimal" min={0.01} step={0.01} required />
            <Field label="Modificador de Tamanho (MT)" value={info.sizeModifier} readOnly />
            <Field label="Mod. de MT" value={info.sizeModifierBonus} onChange={(value) => onInfoChange("sizeModifierBonus", value)} inputMode="numeric" step={1} />
            <Field label="Modificador de Peso (kg)" value={info.weightBonus} onChange={(value) => onInfoChange("weightBonus", value)} inputMode="decimal" step={0.1} />
            <Field label="Peso Real (kg)" value={info.weightReal} readOnly />
          </div>

          <div className="grid gap-2.5 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <div className="rounded-[18px] border border-border bg-background/55 p-2.5">
              <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modificador de escala</p>
              <Field label="Multiplicador de Escala (ME)" value={info.scaleMultiplier} readOnly />
            </div>

            <div className="rounded-[18px] border border-border bg-background/55 p-2.5">
              <div className="flex flex-col gap-2">
                <div className="flex min-w-0 items-start gap-2 px-1 text-sm text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-yellow-foreground" aria-hidden="true" />
                  <p><strong className="font-semibold text-foreground">Calibração avançada.</strong> Não altere os valores base sem conhecer a regra de escala.</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowScaleExplanation((current) => !current)}
                    aria-expanded={showScaleExplanation}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-input bg-background px-3 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
                  >
                    <CircleHelp className="size-4" /> Como funciona?
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBaseFields((current) => !current)}
                    aria-expanded={showBaseFields}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-semibold text-secondary-foreground transition hover:bg-accent"
                  >
                    {showBaseFields ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {showBaseFields ? "Ocultar bases" : "Exibir bases"}
                  </button>
                </div>
              </div>

              {showScaleExplanation && (
                <div className="mt-2 rounded-xl border border-border bg-muted/45 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
                  Runas Livro Azul foi pensado para personagens de MT +0. Como o inventário é calculado em quilos, personagens maiores ou menores precisam ter os pesos convertidos para a própria escala: uma espada usada por um personagem de 10 metros não deve pesar os mesmos 400 gramas de uma espada para alguém de 2 metros. O ME usa a proporção do MT +0 para calcular um peso coerente com o tamanho real.
                </div>
              )}

              {showBaseFields && (
                <div className="aligned-field-grid mt-2 grid grid-cols-1 gap-x-2.5 gap-y-1 sm:grid-cols-2">
                  <Field
                    label="Tamanho Base (m)"
                    value={info.sizeBase}
                    onChange={(value) => onInfoChange("sizeBase", value)}
                    onBlur={(value) => onInfoChange("sizeBase", clampNumber(value, 0.25, 2.5))}
                    inputMode="decimal"
                    min={0.25}
                    max={2.5}
                    step={0.01}
                  />
                  <Field
                    label="Peso Base (kg)"
                    value={info.weightBase}
                    onChange={(value) => onInfoChange("weightBase", value)}
                    onBlur={(value) => onInfoChange("weightBase", clampNumber(value, 0.2, 600))}
                    inputMode="decimal"
                    min={0.2}
                    max={600}
                    step={0.1}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground"><span className="text-primary">*</span> Campo obrigatório</p>
    </section>
  )
}
