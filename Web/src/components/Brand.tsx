import { homeHref, useAccount } from './useAccount'

/** The HeatLossDB logo at the top left of every page, linking home. */
export function Brand({ size = 26 }: { size?: number }) {
  const { isSignedIn } = useAccount()
  return (
    <a className="brand" href={homeHref(isSignedIn)} aria-label={isSignedIn ? 'HeatLossDB, my scans' : 'HeatLossDB, open a scan'}>
      <img src="/logo.svg" alt="" width={size} height={size} />
      <span aria-hidden="true">
        heatloss<span className="brand-db">db</span>
      </span>
    </a>
  )
}
