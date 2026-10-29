export type Protocol = 'http' | 'https'

/**
 * How requests reach the Typesense node.
 * - direct: browser fetch straight to the node (requires `--enable-cors`)
 * - proxy: through the bundled Node server's `/proxy` endpoint
 * - native: through the desktop shell's HTTP client (no CORS); chosen automatically in the desktop app
 */
export type TransportMode = 'direct' | 'proxy' | 'native'

export interface Connection {
  id: string
  name: string
  protocol: Protocol
  host: string
  port: number
  path: string
  tag?: string
  transport: Exclude<TransportMode, 'native'>
  /** Also keep the API key in localStorage; otherwise it lives only in this tab's sessionStorage. */
  rememberApiKey: boolean
}

/** Form values: connection settings plus the API key, which is stored separately. */
export type ConnectionInput = Omit<Connection, 'id'> & { apiKey: string }

export interface DebugInfo {
  state: number
  version: string
}

export interface HealthInfo {
  ok: boolean
  resource_error?: string
}

/** Typesense returns every metric as a string. */
export type Metrics = Record<string, string>

export interface Stats {
  latency_ms?: Record<string, number>
  requests_per_second?: Record<string, number>
  search_latency_ms?: number
  search_requests_per_second?: number
  write_latency_ms?: number
  write_requests_per_second?: number
  import_latency_ms?: number
  import_requests_per_second?: number
  delete_latency_ms?: number
  delete_requests_per_second?: number
  overloaded_requests_per_second?: number
  pending_write_batches?: number
  total_requests_per_second?: number
}

export interface CollectionField {
  name: string
  type: string
  facet?: boolean
  optional?: boolean
  index?: boolean
  sort?: boolean
  infix?: boolean
  locale?: string
  [key: string]: unknown
}

export interface CollectionSchema {
  name: string
  num_documents: number
  created_at: number
  fields: CollectionField[]
  default_sorting_field?: string
  enable_nested_fields?: boolean
  token_separators?: string[]
  symbols_to_index?: string[]
  synonym_sets?: string[]
  curation_sets?: string[]
  metadata?: Record<string, unknown>
  [key: string]: unknown
}
