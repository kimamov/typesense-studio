import { ChevronDownIcon, CopyIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/clipboard'
import { HIGHLIGHT_START, splitHighlight, type SearchHit } from '@/lib/typesense/search'

/** Fields shown on the card; the rest is in the JSON view. */
const VISIBLE_FIELDS = 8

/** One search result. Kept separate from the page so a table view can render hits differently later. */
export function HitCard({ hit }: { hit: SearchHit }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const { id, ...fields } = hit.document
  const entries = Object.entries(fields)
  const json = JSON.stringify(hit.document, null, 2)

  const copy = async () => {
    if (await copyText(json)) toast.success(t('search.copied'))
    else toast.error(t('collection.copyFailed'))
  }

  return (
    <article className="rounded-xl border p-4 text-sm">
      <div className="mb-3 flex items-center gap-2">
        <Badge variant="outline" className="font-mono">
          {String(id)}
        </Badge>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
            <ChevronDownIcon className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
            JSON
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t('collection.copy')} onClick={() => void copy()}>
            <CopyIcon />
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-1">
        {entries.slice(0, VISIBLE_FIELDS).map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="truncate font-mono text-xs leading-5 text-muted-foreground">{name}</dt>
            <dd className="min-w-0 leading-5 break-words">{renderValue(value, hit.highlight?.[name])}</dd>
          </div>
        ))}
      </dl>
      {entries.length > VISIBLE_FIELDS && !expanded && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('search.moreFields', { count: entries.length - VISIBLE_FIELDS })}
        </p>
      )}
      {expanded && (
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-xs">{json}</pre>
      )}
    </article>
  )
}

function snippetOf(highlight: unknown): string | undefined {
  if (highlight && typeof highlight === 'object' && 'snippet' in highlight && typeof highlight.snippet === 'string') {
    return highlight.snippet
  }
  return undefined
}

function renderValue(value: unknown, highlight: unknown): ReactNode {
  // String fields come with a snippet, string arrays with one highlight per element.
  const snippet = snippetOf(highlight)
  if (snippet) return <Highlighted snippet={snippet} />
  if (Array.isArray(highlight) && Array.isArray(value) && highlight.some((h) => snippetOf(h)?.includes(HIGHLIGHT_START))) {
    return highlight.map((h, i) => (
      <span key={i}>
        {i > 0 && ', '}
        <Highlighted snippet={snippetOf(h) ?? String(value[i])} />
      </span>
    ))
  }
  if (value === null || value === undefined) return <span className="text-muted-foreground">–</span>
  if (typeof value === 'object') {
    const primitives = Array.isArray(value) && value.every((v) => typeof v !== 'object')
    return primitives ? value.join(', ') : <span className="line-clamp-2 font-mono text-xs">{JSON.stringify(value)}</span>
  }
  return <span className="line-clamp-3">{String(value)}</span>
}

function Highlighted({ snippet }: { snippet: string }) {
  return (
    <span className="line-clamp-3">
      {splitHighlight(snippet).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/30">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </span>
  )
}
