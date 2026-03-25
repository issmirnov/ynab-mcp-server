export interface AuthProps extends Record<string, unknown> {
  ynabUserId: string;
}

export interface StoredUserPreferences {
  defaultBudgetId?: string;
  defaultBudgetName?: string;
}

export interface StoredYnabToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
}

export interface OAuthGrantStatePayload {
  flow: "grant";
  oauthReqInfo: unknown;
  codeVerifier: string;
}

export interface OAuthDeleteStatePayload {
  flow: "delete";
  codeVerifier: string;
}

export type OAuthStatePayload = OAuthGrantStatePayload | OAuthDeleteStatePayload;
