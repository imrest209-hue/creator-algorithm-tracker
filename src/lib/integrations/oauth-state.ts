/** Shared cookie-name helper for the OAuth CSRF state, used by both the start and callback routes. */
export function oauthStateCookieName(platformParam: string): string {
  return 'cat_oauth_state_' + platformParam;
}

/** Cookie name for the PKCE code_verifier, for platforms whose integration sets `usesPkce`. */
export function pkceVerifierCookieName(platformParam: string): string {
  return 'cat_oauth_pkce_' + platformParam;
}
