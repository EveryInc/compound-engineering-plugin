// Types for the plain-JS modules tests import. Ambient module names cannot be
// relative, so each pattern matches the import specifier's tail.

declare module "*/index.js" {
  type ConfigHookInput = {
    skills?: { paths: string[] }
    command?: Record<string, { template: string; description?: string }>
  }
  const CompoundEngineeringPlugin: {
    id: string
    setup(ctx: never): Promise<void>
    server(): Promise<{ config(config: ConfigHookInput): Promise<void> }>
  }
  export default CompoundEngineeringPlugin
}

declare module "*/ce-optimize/scripts/decide.mjs" {
  export type ObjectiveComparison = {
    verdict: string
    delta: number
    relative: number
    violated: boolean
  }
  export type DecideResult = {
    decision: string
    eligible: boolean
    next_measurement: string
    target_reached: boolean
    improved_objectives: string[]
    violated_objectives: string[]
    comparisons: Record<string, ObjectiveComparison>
    primary_delta: number | null
    rank_score: number
    reason?: string
  }
  export function median(values: number[]): number | null
  export function gatePasses(value: unknown, check: string): boolean
  export function compareObjective(input: Record<string, unknown>): ObjectiveComparison
  export function decide(input: Record<string, unknown>): DecideResult
}
