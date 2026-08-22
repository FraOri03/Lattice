/**
 * Types for the catalogue generator, so `comfy/pipeline.test.ts` can import
 * it and assert the committed copy still matches the source.
 *
 * Hand-written rather than inferred: `scripts/` is deliberately outside both
 * tsconfig programs — it is build tooling, not shipped code — and switching
 * `allowJs` on to type one function would pull every script into the
 * typecheck for no benefit.
 */
export interface GeneratedCatalogue {
  $comment: string
  maxInputBytes: number
  actions: Record<
    string,
    {
      inputs: readonly string[]
      output: string
      gpuClass?: string
      deterministicWithSeed: boolean
      maxInputBytes: number
      params: Record<string, Record<string, unknown>>
    }
  >
}

export function buildCatalogue(): Promise<GeneratedCatalogue>
