import { AI_ACTIONS, type AiActionId, type GpuClass } from './actions.js'

/**
 * What an action will cost, and what it did cost.
 *
 * Two shapes, kept apart by a discriminant, because the difference between
 * them is the whole point: {@link AiCostEstimate} is a range this file
 * derives from the parameters, and {@link AiCostActual} is arithmetic on the
 * worker milliseconds the backend reported. An estimate rendered as a fact
 * is worse than no estimate at all — the user makes a decision on it — so
 * the type system refuses to let a surface confuse the two.
 *
 * ## Why a range, and never a number
 *
 * A GPU job's duration is not knowable in advance. Queue time depends on
 * other people, cold start on whether a worker is up (min workers is 0
 * everywhere — see the deployment table in `docs/architecture/ai.md`), and
 * the sampling time on hardware that is a *class* rather than a model. So
 * the estimate is a band, its high end includes a cold start, and the
 * surface says "estimate" out loud.
 *
 * ## Where the numbers come from, honestly
 *
 * The per-second rates are the deployment's list prices for the hardware
 * each GPU class targets; the seconds-per-unit-of-work constants are
 * reasoned from the same table. **They are decisions, not measurements** —
 * the admission the deployment table already makes about idle timeouts and
 * cold starts. 21.4 is what replaces the estimate with a metered ledger
 * line; until then this file is the only thing standing between a user and
 * an unlabelled bill, which is why it exists now rather than then.
 *
 * Nothing here is a secret: a rate is a line off a public price list, not a
 * credential, and an estimate the browser can compute is one the user can
 * see before pressing the button rather than after.
 */

/** Everything here is quoted in one currency, and it is named on screen. */
export type AiCurrency = 'USD'

export interface AiCostRange {
  readonly low: number
  readonly high: number
}

export interface AiCostEstimate {
  readonly kind: 'estimate'
  readonly currency: AiCurrency
  readonly gpuClass: GpuClass
  /** Billable worker seconds — the unit the rate applies to. */
  readonly gpuSeconds: AiCostRange
  readonly amount: AiCostRange
  /** Whether the high end assumes a worker has to be started first. */
  readonly coldStart: boolean
}

export interface AiCostActual {
  readonly kind: 'actual'
  readonly currency: AiCurrency
  readonly gpuClass: GpuClass
  readonly gpuSeconds: number
  readonly amount: number
}

export type AiCost = AiCostEstimate | AiCostActual

/**
 * USD per billable GPU-second, by class.
 *
 * List prices for the hardware each class targets in the deployment table
 * (the 16 GB, 24 GB and 48 GB serverless tiers). A deployment that
 * negotiates different rates, or moves a class onto different hardware,
 * corrects this table — it is the only place a price appears.
 *
 * Deliberately NOT an environment variable. Anything `VITE_`-prefixed is
 * compiled into the public bundle anyway, so a "configurable" rate would be
 * a published constant with extra steps; and a rate the server knows but
 * the browser does not cannot be shown before the button is pressed, which
 * is the one thing this file is for.
 */
export const AI_GPU_RATES: Readonly<Record<GpuClass, number>> = {
  light: 0.00016,
  standard: 0.00019,
  heavy: 0.00034,
}

/**
 * Seconds a worker spends coming up, by class.
 *
 * Billable: a serverless worker is charged from the moment it starts, which
 * is why the estimate's high end carries it and its low end does not. Fast
 * boot is on for `light` and `standard` and off for `heavy`, and that
 * decision shows up here as a price.
 */
const COLD_START_SECONDS: Readonly<Record<GpuClass, number>> = {
  light: 8,
  standard: 12,
  heavy: 25,
}

/** Fixed per-job overhead: weights off the page cache, decode, result upload. */
const OVERHEAD_SECONDS: Readonly<Record<GpuClass, AiCostRange>> = {
  light: { low: 1, high: 3 },
  standard: { low: 2, high: 4 },
  heavy: { low: 3, high: 6 },
}

/** Seconds of sampling per step per megapixel, by class. */
const SECONDS_PER_STEP_MP: Readonly<Record<GpuClass, AiCostRange>> = {
  light: { low: 0.12, high: 0.25 },
  standard: { low: 0.3, high: 0.6 },
  heavy: { low: 0.25, high: 0.5 },
}

/**
 * The pixel area an action works on when the parameters do not say.
 *
 * `inpaint` and `image-to-image` are driven by an image the user supplies,
 * and its size is not in the parameter bag — so the estimate assumes one
 * megapixel and the band absorbs being wrong. Assuming the largest allowed
 * input instead would quote a ceiling nobody ever pays.
 */
const NOMINAL_MEGAPIXELS = 1

function numberParam(params: Readonly<Record<string, unknown>>, name: string): number | null {
  const value = params[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The value a caller passed, or the catalogue's declared default. */
function param(
  actionId: AiActionId,
  params: Readonly<Record<string, unknown>>,
  name: string,
): number {
  const passed = numberParam(params, name)
  if (passed !== null) return passed
  const spec = AI_ACTIONS[actionId].params[name]
  return spec && spec.kind === 'number' ? spec.default : 0
}

/**
 * Billable worker seconds for this action with these parameters.
 *
 * `null` when no GPU time is involved at all: `design-set` has no GPU class,
 * and an action with no class is not something a GPU backend can charge for.
 * That is a different answer from "zero", and the surface says a different
 * sentence for it.
 */
export function gpuSecondsFor(
  actionId: AiActionId,
  params: Readonly<Record<string, unknown>> = {},
): AiCostRange | null {
  const action = AI_ACTIONS[actionId]
  const gpuClass = action.gpuClass
  if (!gpuClass) return null

  const overhead = OVERHEAD_SECONDS[gpuClass]
  const rate = SECONDS_PER_STEP_MP[gpuClass]

  let work: AiCostRange
  switch (actionId) {
    case 'text-to-image': {
      const megapixels =
        (param(actionId, params, 'width') * param(actionId, params, 'height')) / 1_048_576
      const steps = param(actionId, params, 'steps')
      work = { low: steps * megapixels * rate.low, high: steps * megapixels * rate.high }
      break
    }
    case 'image-to-image': {
      // denoising strength IS the fraction of the schedule that runs, so a
      // 0.3-strength pass genuinely costs a third of a full one
      const steps =
        param(actionId, params, 'steps') * Math.max(0.1, param(actionId, params, 'strength'))
      work = {
        low: steps * NOMINAL_MEGAPIXELS * rate.low,
        high: steps * NOMINAL_MEGAPIXELS * rate.high,
      }
      break
    }
    case 'inpaint': {
      const steps = param(actionId, params, 'steps')
      work = {
        low: steps * NOMINAL_MEGAPIXELS * rate.low,
        high: steps * NOMINAL_MEGAPIXELS * rate.high,
      }
      break
    }
    case 'upscale': {
      // an upscaler is one pass, and its cost is the OUTPUT area: 4x is four
      // times the pixels of 2x, not twice
      const requested = typeof params.scale === 'string' ? Number(params.scale) : 2
      const factor = (Number.isFinite(requested) ? requested : 2) ** 2
      work = { low: 0.7 * factor, high: 1.8 * factor }
      break
    }
    default:
      // background-removal: one pass of a small model, no parameters to read
      work = { low: 1.5, high: 4 }
  }

  return { low: work.low + overhead.low, high: work.high + overhead.high }
}

/**
 * What this action is likely to cost, as a labelled range.
 *
 * `null` means no GPU time is billed — which does NOT mean free. Who pays is
 * the provider's `disclosure.cost`, and a third-party model on the user's
 * own key bills them directly. The surface owes both sentences.
 */
export function estimateCost(
  actionId: AiActionId,
  params: Readonly<Record<string, unknown>> = {},
): AiCostEstimate | null {
  const gpuClass = AI_ACTIONS[actionId].gpuClass
  const seconds = gpuSecondsFor(actionId, params)
  if (!gpuClass || !seconds) return null

  const gpuSeconds = { low: seconds.low, high: seconds.high + COLD_START_SECONDS[gpuClass] }
  const rate = AI_GPU_RATES[gpuClass]
  return {
    kind: 'estimate',
    currency: 'USD',
    gpuClass,
    gpuSeconds,
    amount: { low: gpuSeconds.low * rate, high: gpuSeconds.high * rate },
    coldStart: true,
  }
}

/**
 * What it actually cost, from the worker milliseconds the backend reported.
 *
 * `null` when the backend reported none — the honest answer for a provider
 * that has no worker seconds to report, and for a hosted job whose
 * completion arrived without them. A zero would read as free.
 */
export function actualCost(
  actionId: AiActionId,
  executionMs: number | undefined,
): AiCostActual | null {
  const gpuClass = AI_ACTIONS[actionId].gpuClass
  if (!gpuClass || typeof executionMs !== 'number' || !Number.isFinite(executionMs)) return null
  const gpuSeconds = Math.max(0, executionMs) / 1000
  return {
    kind: 'actual',
    currency: 'USD',
    gpuClass,
    gpuSeconds,
    amount: gpuSeconds * AI_GPU_RATES[gpuClass],
  }
}

/**
 * Sum of what a set of jobs actually cost.
 *
 * The only spend figure this phase can state as a fact: arithmetic on
 * reported worker time, not a budget. There is no ceiling to compare it
 * against until 21.4 builds the ledger, and inventing one here would be the
 * second kind of dishonesty this file exists to avoid.
 */
export function totalCost(costs: readonly (AiCostActual | null)[]): number {
  return costs.reduce((sum, cost) => sum + (cost?.amount ?? 0), 0)
}

/**
 * A money string with enough decimals to be true.
 *
 * A generation costs fractions of a cent, and Intl's two-decimal default
 * renders most of this catalogue as "0.00" — a number that is both wrong and
 * impossible to argue with. Below a cent the figure keeps four decimals,
 * which is the precision at which the difference between an upscale and an
 * inpaint is visible.
 */
export function formatMoney(
  locale: string,
  amount: number,
  currency: AiCurrency = 'USD',
): string {
  const digits = amount > 0 && amount < 0.01 ? 4 : 2
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
}

/**
 * The range as one string, collapsed when both ends round to the same thing:
 * a range whose two halves are identical is a range nobody needed to see.
 */
export function formatCostRange(locale: string, cost: AiCostEstimate): string {
  const low = formatMoney(locale, cost.amount.low, cost.currency)
  const high = formatMoney(locale, cost.amount.high, cost.currency)
  return low === high ? low : `${low} – ${high}`
}
