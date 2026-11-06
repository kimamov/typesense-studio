import { TypesenseError, type TypesenseClient } from './client'
import type { DocumentAction, ImportResult, TypesenseDocument } from './document-form'
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
    client.request<CollectionSchema[]>('GET', '/collections', { signal }),
  collection: (client: TypesenseClient, name: string, signal?: AbortSignal) =>
    client.request<CollectionSchema>('GET', `/collections/${encodeURIComponent(name)}`, { signal }),
  deleteCollection: (client: TypesenseClient, name: string) =>
    client.request<CollectionSchema>('DELETE', `/collections/${encodeURIComponent(name)}`),
  /** Copies the schema and its synonym and curation set references, not the documents. */
  cloneCollection: (client: TypesenseClient, source: string, name: string) =>
    client.request<CollectionSchema>('POST', '/collections', { query: { src_name: source }, body: { name } }),
  /** All documents as JSONL. */
  exportDocuments: (client: TypesenseClient, name: string) =>
    client.request<string>('GET', `/collections/${encodeURIComponent(name)}/documents/export`, { raw: true }),
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
  document: (client: TypesenseClient, collection: string, id: string, signal?: AbortSignal) =>
    client.request<TypesenseDocument>(
      'GET',
      `/collections/${encodeURIComponent(collection)}/documents/${encodeURIComponent(id)}`,
      { signal },
    ),
  /** Writes documents as JSONL; the answer is HTTP 200 with one result per document, failed ones included. */
  importDocuments: async (client: TypesenseClient, collection: string, documents: TypesenseDocument[], action: DocumentAction) => {
    const text = await client.request<string>('POST', `/collections/${encodeURIComponent(collection)}/documents/import`, {
      query: { action, return_id: true },
      body: documents.map((document) => JSON.stringify(document)).join('\n'),
      raw: true,
    })
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ImportResult)
  },
  deleteDocument: (client: TypesenseClient, collection: string, id: string) =>
    client.request<Record<string, unknown>>(
      'DELETE',
      `/collections/${encodeURIComponent(collection)}/documents/${encodeURIComponent(id)}`,
    ),
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
