import { describe, expect, it } from 'vitest'
import { DESKTOP_PADDING, mapPadding, SHEET_PEEK, SHEET_TOP_GAP, sheetVisible } from './layout'

describe('sheetVisible', () => {
  it('snaps to a peek, half the screen, or all but the top gap', () => {
    expect(sheetVisible('peek', 800)).toBe(SHEET_PEEK)
    expect(sheetVisible('half', 800)).toBe(400)
    expect(sheetVisible('full', 800)).toBe(800 - SHEET_TOP_GAP)
  })

  it('never shows less than the peek on very short screens', () => {
    expect(sheetVisible('half', 200)).toBe(SHEET_PEEK)
    expect(sheetVisible('full', 100)).toBe(SHEET_PEEK)
  })
})

describe('mapPadding', () => {
  const phone = { compact: true, viewportHeight: 800, dockHeight: 96 }

  it('uses the fixed desktop padding beside the sidebar', () => {
    expect(mapPadding({ ...phone, compact: false, snap: 'peek' })).toEqual(DESKTOP_PADDING)
  })

  it('frames routes above the sheet and the dock riding on it', () => {
    expect(mapPadding({ ...phone, snap: 'half' }).bottom).toBe(400 + 96 + 34)
    expect(mapPadding({ ...phone, snap: 'peek' }).bottom).toBe(SHEET_PEEK + 96 + 34)
  })

  it('keeps the half-open framing when the sheet covers the map', () => {
    expect(mapPadding({ ...phone, snap: 'full' })).toEqual(mapPadding({ ...phone, snap: 'half' }))
  })

  it('always leaves some map to frame on short screens', () => {
    expect(mapPadding({ ...phone, viewportHeight: 500, snap: 'half' }).bottom).toBe(500 - 140)
  })
})
