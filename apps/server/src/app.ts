import { timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { request as httpRequest, type IncomingMessage, type RequestListener, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { extname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { isAllowed, type Allowlist } from './allowlist.ts'

/** Must match PROXY_TARGET_HEADER in the web client. */
const TARGET_HEADER = 'x-typesense-target'

/** Only these request headers reach Typesense; cookies and auth for the dashboard itself stay here. */
const FORWARDED_REQUEST_HEADERS = ['x-typesense-api-key', 'content-type', 'content-length', 'accept']

/** Hop-by-hop headers describe the upstream connection, not ours; cookies never reach the dashboard origin. */
const DROPPED_RESPONSE_HEADERS = ['transfer-encoding', 'connection', 'keep-alive', 'set-cookie']

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export interface AppConfig {
  /** Sub-path the dashboard is served under, e.g. "/dashboard"; empty for the root. */
  basePath: string
  allowlist: Allowlist
  /** Directory with the built web app; static serving is skipped when undefined. */
  staticDir?: string
  basicAuth?: { username: string; password: string }
}

export function createApp(config: AppConfig): RequestListener {
  const proxyEnabled = config.allowlist.kind === 'all' || config.allowlist.patterns.length > 0
  const staticDir = config.staticDir && resolve(config.staticDir)
  const expectedAuth =
    config.basicAuth &&
    Buffer.from(`Basic ${Buffer.from(`${config.basicAuth.username}:${config.basicAuth.password}`).toString('base64')}`)

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      let path = url.pathname

      if (config.basePath) {
        if (path === '/') return redirect(res, `${config.basePath}/`)
        if (path !== config.basePath && !path.startsWith(`${config.basePath}/`)) return sendJson(res, 404, { message: 'Not found' })
        path = path.slice(config.basePath.length) || '/'
      }

      if (expectedAuth && !matchesAuth(req, expectedAuth)) {
        res.writeHead(401, { 'www-authenticate': 'Basic realm="Typesense Studio"' }).end('Unauthorized')
        return
      }

      if (path === '/api/info' && req.method === 'GET') return sendJson(res, 200, { proxy: { enabled: proxyEnabled } })

      if (path.startsWith('/proxy/')) {
        if (!proxyEnabled) {
          return sendJson(res, 403, { message: 'The proxy is disabled. Set PROXY_ALLOWED_TARGETS to enable it.' })
        }
        return proxy(req, res, config.allowlist, `${path.slice('/proxy'.length)}${url.search}`)
      }

      if (staticDir && (req.method === 'GET' || req.method === 'HEAD')) return await serveStatic(req, res, staticDir, path)

      sendJson(res, 404, { message: 'Not found' })
    } catch (error) {
      if (res.headersSent) res.destroy(error as Error)
      else sendJson(res, 500, { message: error instanceof Error ? error.message : String(error) })
    }
  }
}

function proxy(req: IncomingMessage, res: ServerResponse, allowlist: Allowlist, pathAndQuery: string): void {
  let target: URL
  try {
    target = new URL(String(req.headers[TARGET_HEADER] ?? ''))
  } catch {
    return sendJson(res, 400, { message: `Missing or invalid ${TARGET_HEADER} header.` })
  }
  if (!isAllowed(allowlist, target)) {
    return sendJson(res, 403, { message: `Proxy target ${target.origin} is not in PROXY_ALLOWED_TARGETS.` })
  }

  const upstream = new URL(`${target.pathname.replace(/\/+$/, '')}${pathAndQuery}`, target.origin)
  const headers: Record<string, string> = {}
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name]
    if (typeof value === 'string') headers[name] = value
  }

  // node:http never follows redirects, so a redirect cannot lead past the allowlist.
  const send = upstream.protocol === 'https:' ? httpsRequest : httpRequest
  const outgoing = send(upstream, { method: req.method, headers })

  outgoing.on('response', (incoming) => {
    const responseHeaders = { ...incoming.headers }
    for (const name of DROPPED_RESPONSE_HEADERS) delete responseHeaders[name]
    res.writeHead(incoming.statusCode ?? 502, responseHeaders)
    // A rejection only means the client went away; pipeline already tore down both streams.
    pipeline(incoming, res).catch(() => {})
  })
  outgoing.on('error', (error) => {
    if (res.headersSent) res.destroy(error)
    else sendJson(res, 502, { message: `Could not reach ${target.origin}: ${error.message}` })
  })

  // Streams large imports instead of buffering them in memory; errors surface on `outgoing`.
  pipeline(req, outgoing).catch(() => {})
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, root: string, path: string): Promise<void> {
  let file = resolve(root, `.${safeDecode(path)}`)
  // Routing happens in the URL hash, so every unknown or unsafe path falls back to the app shell.
  if (!file.startsWith(`${root}${sep}`) || !(await isFile(file))) file = resolve(root, 'index.html')

  const { size } = await stat(file)
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'content-length': size,
  })
  if (req.method === 'HEAD') res.end()
  else await pipeline(createReadStream(file), res)
}

function matchesAuth(req: IncomingMessage, expected: Buffer): boolean {
  const actual = Buffer.from(req.headers.authorization ?? '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return '/'
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location }).end()
}
