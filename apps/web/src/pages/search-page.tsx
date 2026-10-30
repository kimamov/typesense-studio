import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { SearchIcon, SearchXIcon } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QueryError } from '@/components/query-error'
import { FacetBar } from '@/components/search/facet-filters'
import { HitCard } from '@/components/search/hit-card'
import { Pagination } from '@/components/search/pagination'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { formatNumber } from '@/lib/format'
import { api } from '@/lib/typesense/api'
import {
  buildFilterBy,
  FACET_VALUES,
  facetFields,
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  isActive,
  PER_PAGE_OPTIONS,
  sortFields,
  textFields,
  type DocumentSearch,
  type FacetCount,
  type FilterValue,
  type SearchParams,
} from '@/lib/typesense/search'
import type { CollectionSchema } from '@/lib/typesense/types'
import type { JsonEditorProps } from '@/components/json-editor'

// CodeMirror is only loaded once JSON mode is opened. If its chunk fails to load (offline, or replaced
// by a newer deploy), a plain textarea takes its place so JSON mode keeps working.
const JsonEditor = lazy(() =>
  import('@/components/json-editor').catch((error: unknown) => {
    console.error('Failed to load the JSON editor', error)
    return { default: JsonTextarea }
  }),
)

const DEFAULT_PER_PAGE = 25
const DEBOUNCE_MS = 300
const RELEVANCE = 'relevance'

export function SearchPage({ name, search }: { name: string; search: DocumentSearch }) {
  const { connection, client } = useActiveConnection()
  const schema = useQuery({
    queryKey: [connection.id, 'collections', name],
    queryFn: ({ signal }) => api.collection(client, name, signal),
  })

  return (
    <>
      <div>
        <h1 className="font-mono text-2xl font-semibold break-all">{name}</h1>
      </div>
      {schema.error ? (
        <QueryError error={schema.error} onRetry={() => void schema.refetch()} />
      ) : !schema.data ? (
        <Skeleton className="h-64" />
      ) : (
        <SearchView schema={schema.data} search={search} />
      )}
    </>
  )
}

function SearchView({ schema, search }: { schema: CollectionSchema; search: DocumentSearch }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage
  const navigate = useNavigate({ from: '/c/$connectionId/collections/$name/search' })
  const { connection, client } = useActiveConnection()

  const texts = textFields(schema)
  const facets = facetFields(schema)
  const sorts = sortFields(schema)
  const searchIn = search.in?.filter((field) => texts.includes(field)) ?? []
  const queryBy = (searchIn.length ? searchIn : texts).join(',') || undefined
  const filters = search.filters ?? {}
  const page = search.page ?? 1
  const perPage = search.per_page ?? DEFAULT_PER_PAGE

  // Every change except paging starts again on the first page.
  const update = (patch: DocumentSearch, replace = false) =>
    void navigate({ search: (prev) => ({ ...prev, page: undefined, ...patch }), replace })

  const setFilter = (field: string, value: FilterValue | undefined) => {
    const others = Object.fromEntries(Object.entries(filters).filter(([name]) => name !== field))
    const next = value === undefined ? others : { ...others, [field]: value }
    update({ filters: Object.keys(next).length ? next : undefined })
  }

  const jsonMode = search.json !== undefined
  const base = { collection: schema.name, q: search.q || '*', query_by: queryBy }
  // What the form searches for, as Typesense parameters: the starting point of JSON mode.
  const formParams = { q: base.q, query_by: queryBy, filter_by: buildFilterBy(filters), sort_by: search.sort }
  // Value facets with an active filter get their counts from a search without their own filter, so the
  // other values stay selectable (disjunctive faceting).
  const ownCounts = jsonMode ? [] : facets.filter((f) => f.kind === 'value' && isActive(filters[f.name]))
  const queryKey = [connection.id, 'collections', schema.name, 'search', search]
  const results = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.multiSearch(
        client,
        jsonMode
          ? [
              {
                q: '*',
                ...(search.json as Partial<SearchParams>),
                // Paging is controlled below the results, and highlights must use the tags HitCard understands.
                collection: schema.name,
                page,
                per_page: perPage,
                highlight_start_tag: HIGHLIGHT_START,
                highlight_end_tag: HIGHLIGHT_END,
              },
            ]
          : [
          {
            ...base,
            filter_by: buildFilterBy(filters),
            facet_by: facets.map((f) => f.name).join(',') || undefined,
            max_facet_values: FACET_VALUES,
            sort_by: search.sort,
            page,
            per_page: perPage,
            highlight_start_tag: HIGHLIGHT_START,
            highlight_end_tag: HIGHLIGHT_END,
          },
          ...ownCounts.map((f) => ({
            ...base,
            filter_by: buildFilterBy(filters, f.name),
            facet_by: f.name,
            max_facet_values: FACET_VALUES,
            per_page: 0,
          })),
            ],
        signal,
      ),
    placeholderData: keepPreviousData,
  })

  const [main, ...rest] = results.data ?? []
  // While the next search loads, the previous results are shown; their extra searches may belong to other
  // filtered facets, so they are only used once they match the current search.
  const own = results.isPlaceholderData ? [] : rest
  const counts: Record<string, FacetCount | undefined> = Object.fromEntries([
    ...(main?.facet_counts ?? []).map((c) => [c.field_name, c] as const),
    ...own.map((r, i) => [ownCounts[i].name, r.facet_counts?.[0]] as const),
  ])

  const searchValues = async (field: string, query: string, signal: AbortSignal) => {
    const params: SearchParams = {
      ...base,
      filter_by: buildFilterBy(filters, field),
      facet_by: field,
      facet_query: `${field}:${query}`,
      max_facet_values: 20,
      per_page: 0,
    }
    const response = await api.search(client, schema.name, params, signal)
    return response.facet_counts?.[0]?.counts ?? []
  }

  const activeFilters = Object.entries(filters).filter(([, value]) => isActive(value))
  const pages = main ? Math.ceil(main.found / perPage) : 0
  const first = main && main.found > 0 ? (page - 1) * perPage + 1 : 0
  const last = main ? Math.min(page * perPage, main.found) : 0

  const sortItems: Record<string, string> = {
    [RELEVANCE]: t('search.relevance'),
    ...Object.fromEntries(
      sorts.flatMap((field) => [
        [`${field}:desc`, t('search.sortDesc', { field })],
        [`${field}:asc`, t('search.sortAsc', { field })],
      ]),
    ),
  }

  const applyJson = (json: Record<string, unknown>) => {
    // Running the same search again only refreshes it, since the URL would not change.
    if (JSON.stringify(json) === JSON.stringify(search.json)) void results.refetch()
    else update({ json })
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <Label htmlFor="search-json-mode" className="font-normal text-muted-foreground">
          {t('search.jsonMode')}
        </Label>
        <Switch
          id="search-json-mode"
          checked={jsonMode}
          // Entering JSON mode starts from the form's search; leaving it keeps the form as it was.
          onCheckedChange={(checked) => update({ json: checked ? JSON.parse(JSON.stringify(formParams)) : undefined })}
        />
      </div>

      {jsonMode ? (
        <JsonSearchInput value={search.json ?? {}} onApply={applyJson} />
      ) : (
        <>
        <div className="flex flex-wrap gap-2">
          <SearchBox value={search.q ?? ''} disabled={texts.length === 0} onChange={(q, replace) => update({ q: q || undefined }, replace)} />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" disabled={texts.length === 0} />}>
              {searchIn.length ? t('search.searchInSome', { count: searchIn.length }) : t('search.searchInAll')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t('search.searchIn')}</DropdownMenuLabel>
                {texts.map((field) => (
                  <DropdownMenuCheckboxItem
                    key={field}
                    className="font-mono"
                    checked={searchIn.includes(field)}
                    onCheckedChange={(checked) => {
                      const next = checked ? [...searchIn, field] : searchIn.filter((f) => f !== field)
                      update({ in: next.length && next.length < texts.length ? next : undefined })
                    }}
                  >
                    {field}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FacetBar
            facets={facets}
            counts={counts}
            filters={filters}
            onChange={setFilter}
            onClearAll={() => update({ filters: undefined })}
            searchValues={searchValues}
            queryKey={queryKey}
          />
          <div className="ml-auto">
            <Select
              value={search.sort ?? RELEVANCE}
              onValueChange={(sort) => update({ sort: sort === RELEVANCE ? undefined : (sort as string) })}
              items={sortItems}
            >
              <SelectTrigger size="sm" aria-label={t('search.sortBy')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sortItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        </>
      )}

        {results.error ? (
          <QueryError error={results.error} onRetry={() => void results.refetch()} />
        ) : !main ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : main.found === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
            <SearchXIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{main.out_of === 0 ? t('search.emptyCollection') : t('search.noResults')}</p>
            {!jsonMode && activeFilters.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => update({ filters: undefined })}>
                {t('search.clearFilters')}
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t('search.summary', {
                first: formatNumber(first, lng, 0),
                last: formatNumber(last, lng, 0),
                found: formatNumber(main.found, lng, 0),
                ms: main.search_time_ms,
              })}
            </p>
            <div className={results.isPlaceholderData ? 'flex flex-col gap-3 opacity-60 transition-opacity' : 'flex flex-col gap-3'}>
              {main.hits?.map((hit) => (
                <HitCard key={String(hit.document.id)} hit={hit} />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Pagination page={page} pages={pages} onChange={(next) => update({ page: next === 1 ? undefined : next })} />
              <Select
                value={String(perPage)}
                onValueChange={(value) => update({ per_page: Number(value) === DEFAULT_PER_PAGE ? undefined : Number(value) })}
                items={Object.fromEntries(PER_PAGE_OPTIONS.map((n) => [String(n), t('search.perPage', { count: n })]))}
              >
                <SelectTrigger size="sm" aria-label={t('search.perPageLabel')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PER_PAGE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t('search.perPage', { count: n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
    </div>
  )
}

/** JSON editor for raw Typesense search parameters, applied with the button or ⌘/Ctrl+Enter. */
function JsonSearchInput({ value, onApply }: { value: Record<string, unknown>; onApply: (json: Record<string, unknown>) => void }) {
  const { t } = useTranslation()
  const formatted = JSON.stringify(value, null, 2)
  const [text, setText] = useState(formatted)
  const [synced, setSynced] = useState(formatted)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Follows the URL when it changes from outside (switching modes, back button). A change that is the
  // search just submitted here keeps the user's own text and formatting.
  if (formatted !== synced) {
    setSynced(formatted)
    if (formatted !== submitted) setText(formatted)
  }

  const apply = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      return setError(t('search.invalidJson', { message: e instanceof Error ? e.message : String(e) }))
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return setError(t('search.jsonObject'))
    setError(null)
    setSubmitted(JSON.stringify(parsed, null, 2))
    onApply(parsed as Record<string, unknown>)
  }

  return (
    <div className="flex flex-col gap-2">
      <Suspense fallback={<Skeleton className="h-40" />}>
        <JsonEditor
          value={text}
          onChange={(next) => {
            setText(next)
            setError(null)
          }}
          onSubmit={apply}
          aria-label={t('search.jsonLabel')}
        />
      </Suspense>
      <div className="flex flex-wrap items-start justify-between gap-2">
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="max-w-xl text-xs text-muted-foreground">{t('search.jsonHint')}</p>
        )}
        <Button size="sm" onClick={apply}>
          <SearchIcon />
          {t('search.run')}
        </Button>
      </div>
    </div>
  )
}

/** Fallback for the JSON editor without highlighting or inline errors. */
function JsonTextarea({ value, onChange, onSubmit, ...props }: JsonEditorProps) {
  return (
    <Textarea
      {...props}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          onSubmit?.()
        }
      }}
      spellCheck={false}
      className="min-h-40 font-mono text-xs md:text-xs"
    />
  )
}

/** Search input that updates the URL after a short pause, or right away on Enter. */
function SearchBox({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (q: string, replace: boolean) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)
  const [committed, setCommitted] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Follows the URL when it changes from outside (back button, cleared search).
  if (value !== committed) {
    setCommitted(value)
    setText(value)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const commit = (next: string, replace: boolean) => {
    clearTimeout(timer.current)
    setCommitted(next)
    if (next !== value) onChange(next, replace)
  }

  return (
    <div className="relative min-w-48 flex-1">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        className="pl-8"
        aria-label={t('search.query')}
        placeholder={disabled ? t('search.noTextFields') : t('search.placeholder')}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          clearTimeout(timer.current)
          // Typing replaces the history entry instead of adding one per pause.
          timer.current = setTimeout(() => commit(next, true), DEBOUNCE_MS)
        }}
        onKeyDown={(e) => e.key === 'Enter' && commit(text, false)}
      />
    </div>
  )
}
