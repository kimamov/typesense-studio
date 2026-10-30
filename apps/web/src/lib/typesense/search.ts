import type { CollectionField, CollectionSchema } from './types'

/** Query params of `GET /collections/:name/documents/search` that the search page uses. */
export interface SearchParams {
  q: string
  query_by?: string
  filter_by?: string
  facet_by?: string
  facet_query?: string
  max_facet_values?: number
  sort_by?: string
  page?: number
  per_page?: number
  highlight_start_tag?: string
  highlight_end_tag?: string
  [key: string]: string | number | undefined
}

export interface FacetCount {
  field_name: string
  counts: { value: string; count: number }[]
  stats?: { min?: number; max?: number; total_values?: number }
}

export interface SearchHit {
  document: Record<string, unknown>
  highlight?: Record<string, unknown>
}

export interface SearchResponse {
  found: number
  out_of: number
  page: number
  search_time_ms: number
  hits?: SearchHit[]
  facet_counts?: FacetCount[]
}

/** Typesense does not HTML-escape snippets, so matches are marked with control characters instead of tags. */
export const HIGHLIGHT_START = '\u0001'
export const HIGHLIGHT_END = '\u0002'

export const PER_PAGE_OPTIONS = [10, 25, 50, 100, 250] as const

/**
 * Up to this many values a facet is shown as a checkbox list, above as a searchable combobox.
 * Searches ask for one value more to tell the two apart: `stats.total_values` is capped at
 * `max_facet_values` for wildcard queries, so it cannot be used for that.
 */
export const FACET_LIST_LIMIT = 10
export const FACET_VALUES = FACET_LIST_LIMIT + 1

/** Filter values per field: selected values, a numeric range or a boolean. */
export type FilterValue = string[] | { min?: number; max?: number } | boolean
export type Filters = Record<string, FilterValue>

export type FacetKind = 'value' | 'range' | 'bool'
export interface FacetField {
  name: string
  kind: FacetKind
}

const NUMERIC = /^(int32|int64|float)(\[\])?$/

/** Wildcard field definitions such as `.*` are patterns, not fields that can be searched or filtered. */
const isConcrete = (field: CollectionField) => !/[*^$\\]/.test(field.name)

/** Fields searched by default: every indexed string field. */
export function textFields(schema: CollectionSchema): string[] {
  return schema.fields
    .filter((f) => isConcrete(f) && f.index !== false && (f.type === 'string' || f.type === 'string[]'))
    .map((f) => f.name)
}

export function facetFields(schema: CollectionSchema): FacetField[] {
  return schema.fields.flatMap((f): FacetField[] => {
    if (!f.facet || !isConcrete(f)) return []
    if (f.type === 'bool' || f.type === 'bool[]') return [{ name: f.name, kind: 'bool' }]
    if (NUMERIC.test(f.type)) return [{ name: f.name, kind: 'range' }]
    if (f.type === 'string' || f.type === 'string[]') return [{ name: f.name, kind: 'value' }]
    return []
  })
}

/** Fields that can be used in `sort_by`: numeric fields sort by default, strings only with `sort: true`. */
export function sortFields(schema: CollectionSchema): string[] {
  return schema.fields
    .filter((f) => isConcrete(f) && f.index !== false && (f.sort || (NUMERIC.test(f.type) && !f.type.endsWith('[]'))))
    .map((f) => f.name)
}

function fieldFilter(name: string, value: FilterValue): string | null {
  if (typeof value === 'boolean') return `${name}:=${value}`
  if (Array.isArray(value)) {
    // Backticks keep values with commas, spaces or operators intact.
    return value.length ? `${name}:=[${value.map((v) => `\`${v}\``).join(',')}]` : null
  }
  const { min, max } = value
  if (min !== undefined && max !== undefined) return `${name}:[${min}..${max}]`
  if (min !== undefined) return `${name}:>=${min}`
  if (max !== undefined) return `${name}:<=${max}`
  return null
}

/** `filter_by` for all filters, optionally leaving one field out (for that field's own facet counts). */
export function buildFilterBy(filters: Filters, exclude?: string): string | undefined {
  const parts = Object.entries(filters)
    .filter(([name]) => name !== exclude)
    .map(([name, value]) => fieldFilter(name, value))
    .filter((part): part is string => part !== null)
  return parts.length ? parts.join(' && ') : undefined
}

export function isActive(value: FilterValue | undefined): boolean {
  if (value === undefined) return false
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  return value.min !== undefined || value.max !== undefined
}

/** Splits a highlighted snippet into plain and matched parts. */
export function splitHighlight(snippet: string): { text: string; match: boolean }[] {
  return snippet
    .split(HIGHLIGHT_START)
    .flatMap((part, i) => {
      if (i === 0) return [{ text: part, match: false }]
      const [match, rest = ''] = part.split(HIGHLIGHT_END)
      return [
        { text: match, match: true },
        { text: rest, match: false },
      ]
    })
    .filter((part) => part.text)
}

/** Search state kept in the URL of the search page. */
export interface DocumentSearch {
  q?: string
  /** Fields to search in; all text fields when missing. */
  in?: string[]
  filters?: Filters
  /** `field:asc` / `field:desc`; relevance when missing. */
  sort?: string
  page?: number
  per_page?: number
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

function parseFilterValue(value: unknown): FilterValue | undefined {
  if (typeof value === 'boolean' || isStringArray(value)) return value
  if (value && typeof value === 'object') {
    const { min, max } = value as Record<string, unknown>
    return {
      ...(typeof min === 'number' && { min }),
      ...(typeof max === 'number' && { max }),
    }
  }
  return undefined
}

/** Keeps only well-formed values, so a hand-edited or outdated URL cannot break the page. */
export function parseDocumentSearch(raw: Record<string, unknown>): DocumentSearch {
  const filters = Object.fromEntries(
    Object.entries(raw.filters && typeof raw.filters === 'object' ? raw.filters : {})
      .map(([name, value]) => [name, parseFilterValue(value)] as const)
      .filter((entry): entry is readonly [string, FilterValue] => entry[1] !== undefined && isActive(entry[1])),
  )
  const positive = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined)
  return {
    ...(typeof raw.q === 'string' && raw.q && { q: raw.q }),
    ...(isStringArray(raw.in) && raw.in.length > 0 && { in: raw.in }),
    ...(Object.keys(filters).length > 0 && { filters }),
    ...(typeof raw.sort === 'string' && /^[\w.]+:(asc|desc)$/.test(raw.sort) && { sort: raw.sort }),
    ...(positive(raw.page) && { page: positive(raw.page) }),
    ...(PER_PAGE_OPTIONS.includes(raw.per_page as (typeof PER_PAGE_OPTIONS)[number]) && { per_page: raw.per_page as number }),
  }
}
