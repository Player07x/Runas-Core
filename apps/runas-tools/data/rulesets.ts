/**
 * A lista concreta dos sistemas vive em `@runas/ruleset-contracts`, para que
 * o Runas DM também possa consumi-la (por exemplo, ao criar um bestiário)
 * sem duplicar nome, descrição ou ordem. Este arquivo só reexporta, mantendo
 * a mesma API que o Tools já usava.
 */
export { RULESET_DEFINITIONS as rulesets, getRulesetDefinition } from "@runas/ruleset-contracts/definitions"
