import type { TypesenseClient } from './client'
import type { CollectionSchema, DebugInfo, HealthInfo, Metrics, Stats } from './types'

export const api = {
  health: (client: TypesenseClient, signal?: AbortSignal) =>
    client.request<HealthInfo>('GET', '/health', { signal }),
  debug: (client: TypesenseClient, signal?: AbortSignal) =>
    client.request<DebugInfo>('GET', '/debug', { signal }),
  metrics: (client: TypesenseClient, signal?: AbortSignal) =>
    client.request<Metrics>('GET', '/metrics.json', { signal }),
  stats: (client: TypesenseClient, signal?: AbortSignal) =>
    client.request<Stats>('GET', '/stats.json', { signal }),
  collections: (client: TypesenseClient, signal?: AbortSignal) =>
    client.request<CollectionSchema[]>('GET', '/collections', { query: { exclude_fields: 'fields' }, signal }),
  collection: (client: TypesenseClient, name: string, signal?: AbortSignal) =>
    client.request<CollectionSchema>('GET', `/collections/${encodeURIComponent(name)}`, { signal }),
}
