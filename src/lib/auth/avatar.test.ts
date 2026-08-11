import { describe, expect, it } from 'vitest'
import { coverCrop } from './avatar'

describe('coverCrop', () => {
  it('takes the whole frame when the image is already square', () => {
    expect(coverCrop(400, 400)).toEqual({ x: 0, y: 0, size: 400 })
  })

  it('centres the crop on a landscape photo', () => {
    expect(coverCrop(1000, 400)).toEqual({ x: 300, y: 0, size: 400 })
  })

  it('centres the crop on a portrait photo', () => {
    expect(coverCrop(400, 1000)).toEqual({ x: 0, y: 300, size: 400 })
  })

  it('rounds rather than leaving a sub-pixel offset', () => {
    expect(coverCrop(101, 40)).toEqual({ x: 31, y: 0, size: 40 })
  })
})
