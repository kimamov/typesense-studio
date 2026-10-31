import { TypesenseError, type TypesenseClient } from './client'
import type { SearchParams, SearchResponse } from './search'
import type { ApiKey, ApiKeyInput, CollectionSchema, DebugInfo, HealthInfo, Metrics, SchemaUpdate, Stats } from './types'

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
  updateCollection: (client: TypesenseClient, name: string, body: SchemaUpdate) =>
    client.request<SchemaUpdate>('PATCH', `/collections/${encodeURIComponent(name)}`, { body }),
  keys: (client: TypesenseClient, signal?: AbortSignal) =>
    client.request<{ keys: ApiKey[] }>('GET', '/keys', { signal }).then((response) => response.keys),
  createKey: (client: TypesenseClient, input: ApiKeyInput) => client.request<ApiKey>('POST', '/keys', { body: input }),
  deleteKey: (client: TypesenseClient, id: number) => client.request<{ id: number }>('DELETE', `/keys/${id}`),
  search: (client: TypesenseClient, collection: string, params: SearchParams, signal?: AbortSignal) =>
    client.request<SearchResponse>('GET', `/collections/${encodeURIComponent(collection)}/documents/search`, {
      query: params,
      signal,
    }),
  /** Several searches in one request; a failed search rejects the whole call. */
  multiSearch: async (client: TypesenseClient, searches: (SearchParams & { collection: string })[], signal?: AbortSignal) => {
    const { results } = await client.request<{ results: (SearchResponse & { code?: number; error?: string })[] }>(
      'POST',
      '/multi_search',
      { body: { searches }, signal },
    )
    const failed = results.find((result) => result.error)
    if (failed) throw new TypesenseError(failed.code ?? 400, failed.error ?? 'Search failed')
    return results as SearchResponse[]
  },
}
