/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {}
}
