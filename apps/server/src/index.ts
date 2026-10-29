import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { parseAllowlist } from './allowlist.ts'
import { createApp } from './app.ts'

const env = process.env
const port = Number(env.PORT ?? 8787)
const host = env.HOST ?? '0.0.0.0'
const basePath = (env.BASE_PATH ?? '').replace(/\/+$/, '')
if (basePath && !basePath.startsWith('/')) throw new Error('BASE_PATH must start with "/"')

const staticDir = env.STATIC_DIR ?? '../web/dist'
const allowlist = parseAllowlist(env.PROXY_ALLOWED_TARGETS)

if ((env.BASIC_AUTH_USERNAME ?? '') !== '' && (env.BASIC_AUTH_PASSWORD ?? '') === '') {
  throw new Error('BASIC_AUTH_PASSWORD must be set when BASIC_AUTH_USERNAME is set')
}

const app = createApp({
  basePath,
  allowlist,
  staticDir: existsSync(staticDir) ? staticDir : undefined,
  basicAuth: env.BASIC_AUTH_USERNAME
    ? { username: env.BASIC_AUTH_USERNAME, password: env.BASIC_AUTH_PASSWORD! }
    : undefined,
})

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  const proxy =
    allowlist.kind === 'all' ? 'enabled for all targets' : allowlist.patterns.length ? 'enabled (allowlist)' : 'disabled'
  console.log(`Typesense Studio listening on http://${host}:${info.port}${basePath}/ — proxy ${proxy}`)
})
