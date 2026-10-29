import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { isAllowed, type Allowlist } from './allowlist.ts'

/** Must match PROXY_TARGET_HEADER in the web client. */
const TARGET_HEADER = 'x-typesense-target'

/** Only these request headers reach Typesense; cookies and auth for the dashboard itself stay here. */
const FORWARDED_REQUEST_HEADERS = ['x-typesense-api-key', 'content-type', 'accept']

/** Node's fetch already decoded the body, so these would describe the wrong bytes. */
const DROPPED_RESPONSE_HEADERS = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']

export interface AppConfig {
  /** Sub-path the dashboard is served under, e.g. "/dashboard"; empty for the root. */
  basePath: string
  allowlist: Allowlist
  /** Directory with the built web app; static serving is skipped when undefined. */
  staticDir?: string
  basicAuth?: { username: string; password: string }
}

export function createApp(config: AppConfig): Hono {
  const app = new Hono()
  const routes = new Hono()
  const proxyEnabled = config.allowlist.kind === 'all' || config.allowlist.patterns.length > 0

  if (config.basicAuth) routes.use('*', basicAuth(config.basicAuth))

  routes.get('/api/info', (c) => c.json({ proxy: { enabled: proxyEnabled } }))

  routes.all('/proxy/*', async (c) => {
    if (!proxyEnabled) {
      return c.json({ message: 'The proxy is disabled. Set PROXY_ALLOWED_TARGETS to enable it.' }, 403)
    }

    let target: URL
    try {
      target = new URL(c.req.header(TARGET_HEADER) ?? '')
    } catch {
      return c.json({ message: `Missing or invalid ${TARGET_HEADER} header.` }, 400)
    }
    if (!isAllowed(config.allowlist, target)) {
      return c.json({ message: `Proxy target ${target.origin} is not in PROXY_ALLOWED_TARGETS.` }, 403)
    }

    const incoming = new URL(c.req.url)
    const suffix = incoming.pathname.slice(`${config.basePath}/proxy`.length)
    const upstream = new URL(`${target.pathname.replace(/\/+$/, '')}${suffix}${incoming.search}`, target.origin)

    const headers = new Headers()
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = c.req.header(name)
      if (value) headers.set(name, value)
    }

    const hasBody = !['GET', 'HEAD'].includes(c.req.method)
    let response: Response
    try {
      response = await fetch(upstream, {
        method: c.req.method,
        headers,
        body: hasBody ? c.req.raw.body : undefined,
        // Streams large imports instead of buffering them in memory.
        duplex: hasBody ? 'half' : undefined,
        // A redirect could point anywhere, bypassing the allowlist.
        redirect: 'manual',
        signal: c.req.raw.signal,
      } as RequestInit)
    } catch (error) {
      const message = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error)
      return c.json({ message: `Could not reach ${target.origin}: ${message}` }, 502)
    }

    const responseHeaders = new Headers(response.headers)
    for (const name of DROPPED_RESPONSE_HEADERS) responseHeaders.delete(name)
    return new Response(response.body, { status: response.status, headers: responseHeaders })
  })

  if (config.staticDir) {
    const staticDir = config.staticDir
    const stripBase = (path: string) => path.slice(config.basePath.length) || '/'
    routes.use('*', serveStatic({ root: staticDir, rewriteRequestPath: stripBase }))
    // Routing happens in the URL hash, so every unknown path can fall back to the app shell.
    routes.get('*', serveStatic({ root: staticDir, path: 'index.html' }))
  }

  app.route(config.basePath || '/', routes)
  if (config.basePath) app.get('/', (c) => c.redirect(`${config.basePath}/`))
  return app
}
