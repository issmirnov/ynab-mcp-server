interface Env extends Cloudflare.Env {
  YNAB_OAUTH_CLIENT_ID: string;
  YNAB_OAUTH_CLIENT_SECRET: string;
  YNAB_OAUTH_SCOPE?: string;
}
