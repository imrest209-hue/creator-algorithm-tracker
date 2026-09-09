/** Shared cookie-name helper for the OAuth CSRF state, used by both the start and callback routes. */
export function oauthStateCookieName(platformParam: string): string {
  return 'cat_oauth_state_' + platformParam;
}
