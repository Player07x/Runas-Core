"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { AttributeKey } from "@runas/core/types/character"
import type { DamageConfig, DamageResult, ParsedDamage } from "@runas/core/types/damage"
import { damageTypes } from "@runas/core/data/damageTypes"
import { useCharacter } from "@/components/character/character-provider"
import { calculateDamage, calculateDamageSequence, convertDamageBonusesToDice, rollDice } from "@runas/core/lib/damageCalculator"
import { isAttributeKey } from "@/lib/attributeOptions"
import { parseDamageExpression, parseDamageExpressions } from "@runas/core/lib/damageParser"

function defaultConfig(): DamageConfig {
  return {
    numDice: 1,
    damageTypeId: damageTypes[0]?.id ?? "",
    attributeKey: "none",
    otherModifier: 0,
    mtEnabled: false,
    mtValue: 0,
    otherMultiplier: "1x",
    rdf: 0,
    rdm: 0,
  }
}

function configWithParsed(previous: DamageConfig, parsed: ParsedDamage): DamageConfig {
  const next: DamageConfig = { ...previous }
  if (parsed.hasDamageValue) {
    const conversion = convertDamageBonusesToDice(parsed.numDice, [parsed.bonus])
    next.numDice = conversion.numDice
    next.otherModifier = conversion.modifier
  } else {
    next.otherModifier = parsed.bonus
  }
  if (parsed.damageTypeId) next.damageTypeId = parsed.damageTypeId
  next.attributeKey = parsed.attributeKey && isAttributeKey(parsed.attributeKey) ? parsed.attributeKey : "none"
  return next
}

export function useDamageCalculator() {
  const { character } = useCharacter()
  const searchParams = useSearchParams()
  const [configs, setConfigs] = useState<DamageConfig[]>(() => [defaultConfig()])
  const config = configs[0]
  const [result, setResult] = useState<DamageResult | null>(null)
  const [results, setResults] = useState<DamageResult[]>([])
  const handledRollToken = useRef<string | null>(null)
  const requestedDamage = searchParams.get("damage") ?? ""
  const requestedRollToken = searchParams.get("roll")
  const requestedApplyMt = searchParams.get("applyMt") === "yes"
  const requestedMtValue = Number(searchParams.get("mt"))

  /** Valor atual do atributo selecionado, lido da ficha (0 se nenhum). */
  const getAttributeValue = useCallback(
    (key: AttributeKey | "none"): number => {
      if (key === "none") return 0
      return character.attributes[key] ?? 0
    },
    [character.attributes],
  )

  const updateAt = useCallback(<K extends keyof DamageConfig>(index: number, key: K, value: DamageConfig[K]) => {
    setConfigs((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  }, [])

  const update = useCallback(<K extends keyof DamageConfig>(key: K, value: DamageConfig[K]) => {
    updateAt(0, key, value)
  }, [updateAt])

  /** Ativa o MT e carrega o valor inicial da ficha. */
  const setMtEnabledAt = useCallback(
    (index: number, enabled: boolean) => {
      setConfigs((previous) => previous.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        mtEnabled: enabled,
        mtValue: enabled ? (item.mtValue || character.stats.mt || 0) : item.mtValue,
      } : item))
    },
    [character.stats.mt],
  )

  const setMtEnabled = useCallback((enabled: boolean) => setMtEnabledAt(0, enabled), [setMtEnabledAt])

  /** Aplica um resultado de parser aos campos. */
  const applyParsed = useCallback((parsed: ParsedDamage, expression = "") => {
    const parsedParts = expression ? parseDamageExpressions(expression) : []
    setConfigs((previous) => {
      const primary = previous[0] ?? defaultConfig()
      if (parsedParts.length === 0) return [configWithParsed(primary, parsed)]
      return parsedParts.map((part, index) => configWithParsed(previous[index] ?? primary, part))
    })
  }, [])

  useEffect(() => {
    if (!requestedDamage || !requestedRollToken || handledRollToken.current === requestedRollToken) return
    handledRollToken.current = requestedRollToken
    const parsedParts = parseDamageExpressions(requestedDamage)
    const nextConfigs = (parsedParts.length ? parsedParts : [parseDamageExpression(requestedDamage)]).map((part) => {
      const next = configWithParsed(config, part)
      if (requestedApplyMt) {
        next.mtEnabled = true
        next.mtValue = Number.isFinite(requestedMtValue) ? Math.trunc(requestedMtValue) : 0
      }
      return next
    })
    setConfigs(nextConfigs)
    const sequence = calculateDamageSequence(nextConfigs.map((next) => {
      const attributeValue = next.attributeKey === "none" ? 0 : character.attributes[next.attributeKey] ?? 0
      const conversion = convertDamageBonusesToDice(next.numDice, [attributeValue, next.otherModifier])
      return { config: next, diceRolls: rollDice(conversion.numDice), attributeValue }
    }), nextConfigs[0]?.rdf ?? 0, nextConfigs[0]?.rdm ?? 0)
    setResult(sequence.results[0] ?? null)
    setResults(sequence.results)
  }, [character.attributes, character.stats.mt, config, requestedApplyMt, requestedDamage, requestedMtValue, requestedRollToken])

  const roll = useCallback(() => {
    if (configs.length > 1) {
      const sequence = calculateDamageSequence(configs.map((partConfig) => {
        const attributeValue = getAttributeValue(partConfig.attributeKey)
        const conversion = convertDamageBonusesToDice(partConfig.numDice, [attributeValue, partConfig.otherModifier])
        return { config: partConfig, diceRolls: rollDice(conversion.numDice), attributeValue }
      }), config.rdf, config.rdm)
      setResults(sequence.results)
      setResult(sequence.results[0] ?? null)
      return
    }
    const attributeValue = getAttributeValue(config.attributeKey)
    const conversion = convertDamageBonusesToDice(config.numDice, [attributeValue, config.otherModifier])
    const diceRolls = rollDice(conversion.numDice)
    const rolled = calculateDamage({ config, diceRolls, attributeValue })
    setResult(rolled)
    setResults([rolled])
  }, [config, configs, getAttributeValue])

  return {
    config,
    configs,
    result,
    results,
    update,
    updateAt,
    setMtEnabled,
    setMtEnabledAt,
    applyParsed,
    roll,
    attributeValue: getAttributeValue(config.attributeKey),
    requestedDamage,
  }
}
