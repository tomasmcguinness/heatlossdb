import { labelIn, NOT_SURE, PROPERTY_TYPES } from '../fabric/home'
import type { HomeFabric } from '../fabric/store'

/** Age bands as they read in a listing name: "pre-1919", "1945–64", "2003 on". */
const SHORT_AGES: Record<string, string> = {
  'pre-1919': 'pre-1919',
  '1919-1944': '1919–44',
  '1945-1964': '1945–64',
  '1965-1982': '1965–82',
  '1983-2002': '1983–2002',
  '2003-': '2003 on',
}

const INSULATED_WALLS = ['cavity-filled', 'timber-frame']

/** "insulated", "partly insulated" or "uninsulated", from the walls and the loft (just the walls
 *  when there's no loft); null if the user didn't say or isn't sure. */
function insulationOf(home: HomeFabric): string | null {
  const hasLoft = home.loft !== 'none'
  const answers = hasLoft ? [home.walls, home.loft] : [home.walls]
  if (answers.some((a) => !a || a === NOT_SURE)) return null
  const insulated = [INSULATED_WALLS.includes(home.walls!), hasLoft && home.loft === 'yes'].filter(Boolean).length
  if (insulated === answers.length) return 'insulated'
  return insulated ? 'partly insulated' : 'uninsulated'
}

/**
 * The name the home is listed under in search, such as "Detached, 1945–64, insulated home". It
 * says nothing about where the home is. Parts the user isn't sure of are left out.
 */
export function listingName(home: HomeFabric): string {
  const type = labelIn(PROPERTY_TYPES, home.propertyType)
  const age = home.ageBand ? SHORT_AGES[home.ageBand] : undefined
  const described = [type, age, insulationOf(home)].filter(Boolean).join(', ')
  const name = described ? `${described} home` : 'home'
  return name.charAt(0).toUpperCase() + name.slice(1)
}
