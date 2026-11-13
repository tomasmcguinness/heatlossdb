/**
 * Calls to HeatLossDB's API as the signed-in user. Clerk's session token goes in the
 * Authorization header; Clerk's React hooks hand over how to get one (see AuthProvider).
 */
type TokenGetter = () => Promise<string | null>

let getToken: TokenGetter = async () => null

export function setTokenGetter(getter: TokenGetter) {
  getToken = getter
}

/** Thrown when there's no signed-in user to make the call as. */
export class SignedOutError extends Error {
  constructor() {
    super('Sign in first.')
  }
}

/** fetch, signed in as the current user. */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  if (!token) throw new SignedOutError()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers })
}
