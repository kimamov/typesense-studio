import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRightLeftIcon, Link2Icon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AliasDialog } from '@/components/alias-dialog'
import { QueryError } from '@/components/query-error'
import { TableNoMatch, TableSearch } from '@/components/table-search'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { useTableSearch } from '@/hooks/use-table-search'
import { useErrorMessage } from '@/hooks/use-typesense'
import { api } from '@/lib/typesense/api'
import type { Alias } from '@/lib/typesense/types'

export function AliasesPage() {
  const { t } = useTranslation()
  const search = useTableSearch()
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { connection, client } = useActiveConnection()
  // Without `alias` the dialog creates one. The alias is kept on close, so the title does not change while it fades out.
  const [dialog, setDialog] = useState<{ open: boolean; alias?: Alias }>({ open: false })
  const queryKey = [connection.id, 'aliases']

  const aliases = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.aliases(client, signal),
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  })
  // Typesense keeps an alias when its collection is deleted, and accepts one for a collection that does not exist.
  const collections = useQuery({
    queryKey: [connection.id, 'collections'],
    queryFn: ({ signal }) => api.collections(client, signal),
  })
  const exists = (name: string) => !collections.data || collections.data.some((c) => c.name === name)

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteAlias(client, name),
    onSuccess: () => {
      toast.success(t('aliases.deleted'))
      return queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const visible = search.filter(aliases.data ?? [], (alias) => [alias.name, alias.collection_name])

  const confirmRemove = (alias: Alias) => {
    if (window.confirm(t('aliases.confirmDelete', { name: alias.name }))) remove.mutate(alias.name)
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('aliases.title')}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t('aliases.description')}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {!!aliases.data?.length && <TableSearch search={search} className="sm:w-56" />}
          <Button onClick={() => setDialog({ open: true })}>
            <PlusIcon />
            {t('aliases.create')}
          </Button>
        </div>
      </div>

      {aliases.error ? (
        <QueryError error={aliases.error} onRetry={() => void aliases.refetch()} />
      ) : !aliases.data ? (
        <Skeleton className="h-40" />
      ) : aliases.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <Link2Icon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('aliases.empty')}</p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('aliases.name')}</TableHead>
                <TableHead>{t('aliases.collection')}</TableHead>
                <TableHead>
                  <span className="sr-only">{t('aliases.rowActions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && <TableNoMatch colSpan={3} />}
              {visible.map((alias) => (
                <TableRow key={alias.name}>
                  <TableCell className="font-mono font-medium">{alias.name}</TableCell>
                  <TableCell className="font-mono">
                    {exists(alias.collection_name) ? (
                      <Link
                        to="/c/$connectionId/collections/$name"
                        params={{ connectionId: connection.id, name: alias.collection_name }}
                        className="underline-offset-4 hover:underline"
                      >
                        {alias.collection_name}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {alias.collection_name}
                        <Badge variant="destructive" title={t('aliases.missingHint')} className="font-sans">
                          {t('aliases.missing')}
                        </Badge>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={t('aliases.switch')} onClick={() => setDialog({ open: true, alias })}>
                      <ArrowRightLeftIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('common.delete')}
                      disabled={remove.isPending && remove.variables === alias.name}
                      onClick={() => confirmRemove(alias)}
                    >
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AliasDialog open={dialog.open} alias={dialog.alias} onOpenChange={(open) => setDialog({ ...dialog, open })} />
    </>
  )
}
