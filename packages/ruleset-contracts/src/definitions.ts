import type { RulesetDefinition } from "./index"

/**
 * Lista concreta dos sistemas hoje suportados pela suíte. Vive aqui, e não em
 * `apps/runas-tools`, para que o Runas DM também possa listar os mesmos
 * sistemas (por exemplo, ao criar um bestiário) sem duplicar nome, descrição
 * nem a ordem deles.
 */
export const RULESET_DEFINITIONS: RulesetDefinition[] = [
  {
    id: "runas-blue",
    name: "Runas: Livro Azul",
    shortName: "Livro Azul",
    description: "A ficha original e todas as regras atuais do Runas Tools.",
  },
  {
    id: "cronos",
    name: "Sagas de Cronos",
    shortName: "Cronos",
    description: "Sincronia, Aura, Fama e regras próprias de Sagas de Cronos.",
  },
]

export function getRulesetDefinition(id: RulesetDefinition["id"]): RulesetDefinition {
  return RULESET_DEFINITIONS.find((ruleset) => ruleset.id === id) ?? RULESET_DEFINITIONS[0]
}
