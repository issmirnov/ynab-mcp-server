export interface AuthProps extends Record<string, unknown> {
  ynabUserId: string;
}

export interface StoredYnabToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
}

export interface OAuthStatePayload {
  oauthReqInfo: unknown;
  codeVerifier: string;
}
