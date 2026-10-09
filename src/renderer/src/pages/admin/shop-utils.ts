import { MAX_SALE_PERCENT } from '@shared/online'

export const MAX_PRICE = 1_000_000

/** A whole number from 0 to 1,000,000, or null. */
export function parsePrice(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= MAX_PRICE ? n : null
}

/** A whole sale percentage from 0 to 90 (empty means 0), or null. */
export function parseSalePercent(raw: string): number | null {
  if (raw.trim() === '') return 0
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= MAX_SALE_PERCENT ? n : null
}
