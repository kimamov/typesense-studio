import type { Connection, TransportMode } from './types'

export class TypesenseError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'TypesenseError'
    this.status = status
  }
}

/**
 * Studio only accepts keys that may manage keys (`GET /keys`). Typesense answers 401 both for
 * unknown keys and for keys without that permission, e.g. search-only keys.
 */
export function isKeyRejected(error: unknown): boolean {
  return error instanceof TypesenseError && error.status === 401
}

type Query = Record<string, string | number | boolean | undefined>

export interface RequestOptions {
  query?: Query
  /** Objects are JSON-encoded; strings are sent as-is (e.g. JSONL imports). */
  body?: unknown
  signal?: AbortSignal
  /** Return the raw response text instead of parsing JSON (e.g. JSONL exports). */
  raw?: boolean
}

/** Header the bundled proxy reads to know where to forward a request. */
export const PROXY_TARGET_HEADER = 'X-Typesense-Target'

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function effectiveTransport(connection: Connection): TransportMode {
  return isDesktop() ? 'native' : connection.transport
}

export function nodeUrl({ protocol, host, port, path }: Pick<Connection, 'protocol' | 'host' | 'port' | 'path'>): string {
  const trimmedPath = path.replace(/\/+$/, '')
  const normalizedPath = trimmedPath && !trimmedPath.startsWith('/') ? `/${trimmedPath}` : trimmedPath
  return `${protocol}://${host}:${port}${normalizedPath}`
}

function buildQuery(query?: Query): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

async function nativeFetch(input: string, init: RequestInit): Promise<Response> {
  // Loaded lazily so the web build never pulls in the desktop runtime.
  const { fetch } = await import('@tauri-apps/plugin-http')
  return fetch(input, init)
}

export interface TypesenseClient {
  connection: Connection
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>
}

export function createClient(connection: Connection, apiKey: string): TypesenseClient {
  const transport = effectiveTransport(connection)
  const target = nodeUrl(connection)

  async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { 'X-TYPESENSE-API-KEY': apiKey }
    let body: BodyInit | undefined
    if (options.body !== undefined) {
      if (typeof options.body === 'string') {
        body = options.body
        headers['Content-Type'] = 'text/plain'
      } else {
        body = JSON.stringify(options.body)
        headers['Content-Type'] = 'application/json'
      }
    }

    const suffix = `${path}${buildQuery(options.query)}`
    let url: string
    if (transport === 'proxy') {
      url = `${import.meta.env.BASE_URL}proxy${suffix}`
      headers[PROXY_TARGET_HEADER] = target
    } else {
      url = `${target}${suffix}`
    }

    const init: RequestInit = { method, headers, body, signal: options.signal }
    let response: Response
    try {
      response = transport === 'native' ? await nativeFetch(url, init) : await fetch(url, init)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      // Browsers report CORS, DNS and TLS failures as an opaque network error.
      throw new TypesenseError(0, error instanceof Error ? error.message : String(error))
    }

    const text = await response.text()
    if (!response.ok) {
      let message = text || response.statusText
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? message
      } catch {
        // Non-JSON error bodies (e.g. from a reverse proxy) are shown verbatim.
      }
      throw new TypesenseError(response.status, message)
    }
    if (options.raw) return text as T
    return (text ? JSON.parse(text) : undefined) as T
  }

  return { connection, request }
}
