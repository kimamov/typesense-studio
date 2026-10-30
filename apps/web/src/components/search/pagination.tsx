import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/** Page numbers around the current page, with the first and last page and gaps (`null`) in between. */
function pageWindow(page: number, pages: number): (number | null)[] {
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return shown.flatMap((p, i) => (i > 0 && p - shown[i - 1] > 1 ? [null, p] : [p]))
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  const { t } = useTranslation()
  if (pages <= 1) return null
  return (
    <nav aria-label={t('search.pagination')} className="flex flex-wrap items-center justify-center gap-1">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeftIcon />
        {t('search.previous')}
      </Button>
      {pageWindow(page, pages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'outline' : 'ghost'}
            size="icon-sm"
            className="w-auto min-w-7 px-1.5 tabular-nums"
            aria-current={p === page ? 'page' : undefined}
            aria-label={t('search.page', { page: p })}
            onClick={() => onChange(p)}
          >
            {p}
          </Button>
        ),
      )}
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        {t('search.next')}
        <ChevronRightIcon />
      </Button>
    </nav>
  )
}
