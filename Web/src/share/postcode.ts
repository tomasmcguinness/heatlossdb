/** A UK outward code: the first part of a postcode, such as "SW1A", "M1" or "EH12". */
const OUTWARD = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/
/** The second part of a postcode, such as "1AA". */
const INWARD = /^[0-9][A-Z]{2}$/

/**
 * The first part of a postcode, uppercased, from what the owner typed. A full postcode is cut
 * down to its first part, so the rest is never kept. Null if it doesn't look like a postcode.
 */
export function outwardCode(typed: string): string | null {
  const text = typed.toUpperCase().replace(/\s+/g, ' ').trim()
  if (OUTWARD.test(text)) return text
  // "SW1A 1AA", or "SW1A1AA" without the space: the inward code is always the last three characters.
  const compact = text.replace(/ /g, '')
  if (compact.length >= 5 && INWARD.test(compact.slice(-3)) && OUTWARD.test(compact.slice(0, -3))) return compact.slice(0, -3)
  return null
}
