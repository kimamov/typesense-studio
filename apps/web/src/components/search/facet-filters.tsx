import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query'
import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isEscapeClear } from '@/lib/combobox'
import { formatNumber } from '@/lib/format'
import { FACET_LIST_LIMIT, isActive, type FacetCount, type FacetField, type FilterValue, type Filters } from '@/lib/typesense/search'

type Counts = FacetCount['counts']

/** Facets shown as buttons in the bar; the others sit behind "More filters" until they are used. */
const VISIBLE_FACETS = 4

export interface FacetBarProps {
  facets: FacetField[]
  counts: Record<string, FacetCount | undefined>
  filters: Filters
  onChange: (field: string, value: FilterValue | undefined) => void
  onClearAll: () => void
  /** Searches the values of a facet (Typesense facet search), for facets with many values. */
  searchValues: (field: string, query: string, signal: AbortSignal) => Promise<Counts>
  /** Identifies the current search, so cached facet value results are not reused for other filters. */
  queryKey: QueryKey
}

type WidgetProps = Omit<FacetBarProps, 'facets' | 'filters' | 'onClearAll'> & { facet: FacetField; value?: FilterValue }

/** One button per facet that opens its filter in a popover; the button shows the active filter. */
export function FacetBar({ facets, filters, onClearAll, ...widgetProps }: FacetBarProps) {
  const { t } = useTranslation()
  // Active filters always keep their button, so they stay visible and removable.
  const visible = facets.filter((f, i) => i < VISIBLE_FACETS || isActive(filters[f.name]))
  const more = facets.filter((f) => !visible.includes(f))
  const anyActive = facets.some((f) => isActive(filters[f.name]))

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('search.filters')}>
      {visible.map((facet) => (
        <FacetButton key={facet.name} facet={facet} value={filters[facet.name]} {...widgetProps} />
      ))}
      {more.length > 0 && (
        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
            <PlusIcon />
            {t('search.moreFilters', { count: more.length })}
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-[70vh] w-72 overflow-y-auto">
            {more.map((facet) => (
              <section key={facet.name} className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0">
                <h3 className="font-mono text-sm font-medium">{facet.name}</h3>
                <FacetWidget facet={facet} value={filters[facet.name]} {...widgetProps} />
              </section>
            ))}
          </PopoverContent>
        </Popover>
      )}
      {anyActive && (
        <Button variant="link" size="sm" onClick={onClearAll}>
          {t('search.clearFilters')}
        </Button>
      )}
    </div>
  )
}

function FacetButton(props: WidgetProps) {
  const { t } = useTranslation()
  const { facet, value, onChange } = props
  const active = isActive(value)
  return (
    <Popover>
      <PopoverTrigger render={<Button variant={active ? 'secondary' : 'outline'} size="sm" />}>
        <span className="font-mono">
          {facet.name}
          {active && ':'}
        </span>
        {active && value !== undefined && <span className="max-w-48 truncate font-normal">{describeFilter(value, t)}</span>}
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <FacetWidget {...props} />
        {active && (
          <Button variant="link" size="sm" className="h-auto self-start px-0" onClick={() => onChange(facet.name, undefined)}>
            {t('search.resetFilter')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Short label of an active filter for its button, e.g. "Travel +1" or "1990 – 2010". */
function describeFilter(value: FilterValue, t: ReturnType<typeof useTranslation>['t']): string {
  if (typeof value === 'boolean') return value ? t('search.yes') : t('search.no')
  if (Array.isArray(value)) return value.length > 1 ? `${value[0]} +${value.length - 1}` : value[0]
  if (value.min !== undefined && value.max !== undefined) return `${value.min} – ${value.max}`
  return value.min !== undefined ? `≥ ${value.min}` : `≤ ${value.max}`
}

function FacetWidget({ facet, value, counts, onChange, searchValues, queryKey }: WidgetProps) {
  const facetCounts = counts[facet.name]
  const set = (next: FilterValue | undefined) => onChange(facet.name, next && isActive(next) ? next : undefined)
  if (facet.kind === 'bool') {
    return <BoolFacet value={typeof value === 'boolean' ? value : undefined} counts={facetCounts?.counts ?? []} onChange={set} />
  }
  if (facet.kind === 'range') {
    return (
      <RangeFacet
        name={facet.name}
        value={value && typeof value === 'object' && !Array.isArray(value) ? value : {}}
        stats={facetCounts?.stats}
        onChange={set}
      />
    )
  }
  if ((facetCounts?.counts.length ?? 0) <= FACET_LIST_LIMIT) {
    return <ValueFacetList selected={Array.isArray(value) ? value : []} counts={facetCounts?.counts ?? []} onChange={set} />
  }
  return (
    <ValueFacetCombobox
      field={facet.name}
      selected={Array.isArray(value) ? value : []}
      counts={facetCounts?.counts.slice(0, FACET_LIST_LIMIT) ?? []}
      onChange={set}
      searchValues={searchValues}
      queryKey={queryKey}
    />
  )
}

function CountLabel({ count }: { count: number }) {
  const { i18n } = useTranslation()
  return <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatNumber(count, i18n.resolvedLanguage, 0)}</span>
}

function ValueFacetList({ selected, counts, onChange }: { selected: string[]; counts: Counts; onChange: (value: string[]) => void }) {
  const id = useId()
  // Selected values stay visible even when the other filters leave no documents for them.
  const values = [...counts, ...selected.filter((s) => !counts.some((c) => c.value === s)).map((value) => ({ value, count: 0 }))]
  const toggle = (value: string, checked: boolean) =>
    onChange(checked ? [...selected, value] : selected.filter((s) => s !== value))
  return (
    <ul className="flex flex-col gap-1.5">
      {values.map(({ value, count }, i) => (
        <li key={value} className="flex items-center gap-2 text-sm">
          <Checkbox id={`${id}-${i}`} checked={selected.includes(value)} onCheckedChange={(checked) => toggle(value, checked)} />
          <Label htmlFor={`${id}-${i}`} className="min-w-0 truncate font-normal">
            {value}
          </Label>
          <CountLabel count={count} />
        </li>
      ))}
    </ul>
  )
}

function ValueFacetCombobox({
  field,
  selected,
  counts,
  onChange,
  searchValues,
  queryKey,
}: {
  field: string
  selected: string[]
  counts: Counts
  onChange: (value: string[]) => void
  searchValues: FacetBarProps['searchValues']
  queryKey: QueryKey
}) {
  const { t } = useTranslation()
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState('')
  const typed = query.trim()
  const found = useQuery({
    queryKey: [...queryKey, 'facet', field, typed],
    queryFn: ({ signal }) => searchValues(field, typed, signal),
    enabled: typed !== '',
    placeholderData: keepPreviousData,
  })
  // Without a query the top values of the current search are shown; typing searches all values.
  const options = typed ? (found.data ?? []) : counts
  const countOf = new Map(options.map((o) => [o.value, o.count]))

  return (
    <Combobox
      multiple
      autoHighlight
      items={options.map((o) => o.value)}
      filter={null}
      value={selected}
      onValueChange={(next: string[], details) => {
        if (isEscapeClear(details)) return
        onChange(next)
        setQuery('')
      }}
      inputValue={query}
      onInputValueChange={setQuery}
    >
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(values: string[]) => (
            <>
              {values.map((value) => (
                <ComboboxChip key={value}>{value}</ComboboxChip>
              ))}
              <ComboboxChipsInput aria-label={field} placeholder={values.length ? undefined : t('search.findValue')} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{found.isFetching ? t('common.loading') : t('search.noValues')}</ComboboxEmpty>
        <ComboboxList>
          {(value: string) => (
            <ComboboxItem key={value} value={value}>
              <span className="truncate">{value}</span>
              {countOf.has(value) && <CountLabel count={countOf.get(value) ?? 0} />}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function RangeFacet({
  name,
  value,
  stats,
  onChange,
}: {
  name: string
  value: { min?: number; max?: number }
  stats?: FacetCount['stats']
  onChange: (value: { min?: number; max?: number }) => void
}) {
  const { t } = useTranslation()
  const [min, setMin] = useState(value.min?.toString() ?? '')
  const [max, setMax] = useState(value.max?.toString() ?? '')
  const [applied, setApplied] = useState(value)
  // Follows changes from outside (chips, clear all, back button) without re-mounting, which would
  // drop the focus of the input being edited.
  if (value.min !== applied.min || value.max !== applied.max) {
    setApplied(value)
    setMin(value.min?.toString() ?? '')
    setMax(value.max?.toString() ?? '')
  }
  const parse = (text: string) => (text.trim() === '' || Number.isNaN(Number(text)) ? undefined : Number(text))
  // Applied when leaving a field or pressing Enter, not on every keystroke.
  const apply = () => {
    const next = { min: parse(min), max: parse(max) }
    if (next.min !== value.min || next.max !== value.max) onChange(next)
  }
  const inputProps = {
    type: 'number',
    step: 'any',
    className: 'h-8',
    onBlur: apply,
    onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && apply(),
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        {...inputProps}
        aria-label={t('search.rangeMin', { field: name })}
        placeholder={stats?.min?.toString() ?? t('search.min')}
        value={min}
        onChange={(e) => setMin(e.target.value)}
      />
      <span className="text-muted-foreground" aria-hidden>
        –
      </span>
      <Input
        {...inputProps}
        aria-label={t('search.rangeMax', { field: name })}
        placeholder={stats?.max?.toString() ?? t('search.max')}
        value={max}
        onChange={(e) => setMax(e.target.value)}
      />
    </div>
  )
}

function BoolFacet({ value, counts, onChange }: { value?: boolean; counts: Counts; onChange: (value?: boolean) => void }) {
  const { t } = useTranslation()
  const options = [
    { label: t('search.any'), value: undefined },
    { label: t('search.yes'), value: true, count: counts.find((c) => c.value === 'true')?.count },
    { label: t('search.no'), value: false, count: counts.find((c) => c.value === 'false')?.count },
  ]
  return (
    <div className="flex flex-wrap gap-1" role="group">
      {options.map((option) => (
        <Button
          key={option.label}
          variant={value === option.value ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && (
            <Badge variant="outline" className="tabular-nums">
              {option.count}
            </Badge>
          )}
        </Button>
      ))}
    </div>
  )
}
