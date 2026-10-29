import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LibraryIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { formatDate, formatNumber } from '@/lib/format'
import { api } from '@/lib/typesense/api'

export function CollectionsPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage
  const { connection, client } = useActiveConnection()
  const collections = useQuery({
    queryKey: [connection.id, 'collections'],
    queryFn: ({ signal }) => api.collections(client, signal),
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  })

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{t('collections.title')}</h1>
        {collections.data && (
          <p className="text-sm text-muted-foreground">{t('collections.count', { count: collections.data.length })}</p>
        )}
      </div>
      {collections.error ? (
        <QueryError error={collections.error} onRetry={() => void collections.refetch()} />
      ) : !collections.data ? (
        <Skeleton className="h-40" />
      ) : collections.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <LibraryIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('collections.empty')}</p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('collections.name')}</TableHead>
                <TableHead className="text-right">{t('collections.documents')}</TableHead>
                <TableHead className="text-right">{t('collections.createdAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.data.map((c) => (
                <TableRow key={c.name} className="relative cursor-pointer">
                  <TableCell className="font-medium">
                    {/* The stretched link makes the whole row clickable while staying a real, focusable link. */}
                    <Link
                      to="/c/$connectionId/collections/$name"
                      params={{ connectionId: connection.id, name: c.name }}
                      className="after:absolute after:inset-0 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(c.num_documents, lng, 0)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDate(c.created_at, lng)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
