import { describe, expect, it } from 'vitest'
import {
  AI_GPU_RATES,
  actualCost,
  estimateCost,
  formatCostRange,
  formatMoney,
  gpuSecondsFor,
  totalCost,
} from './cost'

/**
 * The distinction the whole file exists to protect: an estimate is a range
 * this code derived, and an actual is arithmetic on what the backend
 * reported. A surface that shows one as the other is asking the user to make
 * a decision on a number that was invented.
 */

describe('an estimate is never a fact', () => {
  it('is a range, and says a cold start is in the high end', () => {
    const estimate = estimateCost('text-to-image')!
    expect(estimate.kind).toBe('estimate')
    expect(estimate.coldStart).toBe(true)
    expect(estimate.amount.high).toBeGreaterThan(estimate.amount.low)
    // the cold start is the gap between the work and the ceiling, and it is
    // billable: a serverless worker is charged from the moment it starts
    expect(estimate.gpuSeconds.high).toBeGreaterThan(gpuSecondsFor('text-to-image')!.high)
  })

  it('prices from the class the catalogue declares, not from the action name', () => {
    // upscale is deliberately on the cheap tier; inpaint is on the expensive
    // one. That decision is the largest cost lever in the phase, and it has
    // to be visible in the number the user sees.
    expect(estimateCost('upscale')!.gpuClass).toBe('light')
    expect(estimateCost('inpaint')!.gpuClass).toBe('heavy')
    expect(AI_GPU_RATES.heavy).toBeGreaterThan(AI_GPU_RATES.light)
  })

  it('moves with the settings that actually cost money', () => {
    const cheap = estimateCost('text-to-image', {
      width: 512,
      height: 512,
      steps: 10,
    })!
    const dear = estimateCost('text-to-image', {
      width: 2048,
      height: 2048,
      steps: 50,
    })!
    expect(dear.amount.low).toBeGreaterThan(cheap.amount.low * 5)
  })

  it('charges a 4x upscale by output area, not by the number 4', () => {
    const two = gpuSecondsFor('upscale', { scale: '2' })!
    const four = gpuSecondsFor('upscale', { scale: '4' })!
    // four times the pixels, so the sampling part quadruples; the fixed
    // overhead is what keeps the ratio under four
    expect(four.low / two.low).toBeGreaterThan(2.5)
  })

  it('falls back to the catalogue defaults for a parameter nobody passed', () => {
    expect(estimateCost('text-to-image', {})).toEqual(estimateCost('text-to-image'))
  })
})

describe('an action with no GPU class has no GPU cost', () => {
  /**
   * `design-set` is a language model answering a prompt, and inventing a GPU
   * price for it would be a number that lies. `null` is a different answer
   * from zero, and the surface says a different sentence for it — who pays is
   * then the provider's disclosure, not this file's business.
   */
  it('returns null rather than zero', () => {
    expect(estimateCost('design-set')).toBeNull()
    expect(gpuSecondsFor('design-set')).toBeNull()
    expect(actualCost('design-set', 5000)).toBeNull()
  })
})

describe('what it actually cost', () => {
  it('is the reported worker time at the class rate', () => {
    const cost = actualCost('upscale', 12_000)!
    expect(cost.kind).toBe('actual')
    expect(cost.gpuSeconds).toBe(12)
    expect(cost.amount).toBeCloseTo(12 * AI_GPU_RATES.light, 10)
  })

  /** A zero would read as free, and "the backend told us nothing" is not free. */
  it('is null when the backend reported no worker time', () => {
    expect(actualCost('upscale', undefined)).toBeNull()
    expect(actualCost('upscale', Number.NaN)).toBeNull()
  })

  it('sums into a spend figure, skipping the jobs that reported nothing', () => {
    expect(totalCost([actualCost('upscale', 1000), null, actualCost('upscale', 1000)])).toBeCloseTo(
      2 * AI_GPU_RATES.light,
      10,
    )
  })
})

describe('formatting a fraction of a cent', () => {
  /**
   * Intl's two-decimal default renders most of this catalogue as "$0.00" — a
   * number that is both wrong and impossible to argue with.
   */
  it('keeps four decimals below a cent', () => {
    expect(formatMoney('en', 0.0021)).toContain('0.0021')
    expect(formatMoney('en', 1.5)).toContain('1.50')
  })

  it('collapses a range whose ends round to the same string', () => {
    const flat = { ...estimateCost('upscale')!, amount: { low: 0.002, high: 0.002 } }
    expect(formatCostRange('en', flat)).not.toContain('–')
  })

  it('shows both ends when they differ', () => {
    expect(formatCostRange('en', estimateCost('text-to-image')!)).toContain('–')
  })
})
