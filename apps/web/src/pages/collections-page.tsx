import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  BracesIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  LibraryIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { QueryError } from '@/components/query-error'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { useErrorMessage } from '@/hooks/use-typesense'
import { formatDate, formatNumber } from '@/lib/format'
import { api } from '@/lib/typesense/api'

export function CollectionsPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage
  const { connection, client } = useActiveConnection()
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const [filter, setFilter] = useState('')
  const queryKey = [connection.id, 'collections']
  const collections = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.collections(client, signal),
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  })
  const visible = collections.data?.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()))

  const onError = (error: Error) => toast.error(errorMessage(error))
  const remove = useMutation({
    mutationFn: (name: string) => api.deleteCollection(client, name),
    onSuccess: (_, name) => {
      toast.success(t('collections.deleted', { name }))
      return queryClient.invalidateQueries({ queryKey })
    },
    onError,
  })
  const clone = useMutation({
    mutationFn: ({ source, name }: { source: string; name: string }) => api.cloneCollection(client, source, name),
    onSuccess: (_, { name }) => {
      toast.success(t('collections.cloned', { name }))
      return queryClient.invalidateQueries({ queryKey })
    },
    onError,
  })
  const exportDocuments = useMutation({
    mutationFn: (name: string) => api.exportDocuments(client, name),
    onSuccess: (jsonl, name) => {
      // shortcut: the whole export is held in memory; stream to a file if huge collections must be exported.
      const url = URL.createObjectURL(new Blob([jsonl], { type: 'application/jsonl' }))
      const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.jsonl` })
      a.click()
      URL.revokeObjectURL(url)
    },
    onError,
  })

  const confirmRemove = (name: string) => {
    if (window.confirm(t('collections.confirmDelete', { name }))) remove.mutate(name)
  }
  const promptClone = (source: string) => {
    const name = window.prompt(t('collections.clonePrompt', { name: source }), `${source}_copy`)?.trim()
    if (name) clone.mutate({ source, name })
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('collections.title')}</h1>
          {collections.data && (
            <p className="text-sm text-muted-foreground">{t('collections.count', { count: collections.data.length })}</p>
          )}
        </div>
        {!!collections.data?.length && (
          <InputGroup className="w-full sm:w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('collections.filter')}
              aria-label={t('collections.filter')}
            />
          </InputGroup>
        )}
      </div>
      {collections.error ? (
        <QueryError error={collections.error} onRetry={() => void collections.refetch()} />
      ) : !visible ? (
        <Skeleton className="h-40" />
      ) : collections.data?.length === 0 ? (
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
                <TableHead className="text-right">{t('collections.fields')}</TableHead>
                <TableHead className="text-right">{t('collections.createdAt')}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{t('collections.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {t('collections.noMatch')}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((c) => {
                const params = { connectionId: connection.id, name: c.name }
                return (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">
                      <Link to="/c/$connectionId/collections/$name/search" params={params} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link to="/c/$connectionId/collections/$name/search" params={params} className="hover:underline">
                        {formatNumber(c.num_documents, lng, 0)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link to="/c/$connectionId/collections/$name" params={params} className="hover:underline">
                        {formatNumber(c.fields?.length ?? 0, lng, 0)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDate(c.created_at, lng)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label={t('collections.actionsFor', { name: c.name })} />
                          }
                        >
                          <EllipsisVerticalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link to="/c/$connectionId/collections/$name/document" params={params} />}>
                            <UploadIcon />
                            {t('collections.import')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportDocuments.mutate(c.name)}>
                            <DownloadIcon />
                            {t('collections.export')}
                          </DropdownMenuItem>
                          <DropdownMenuItem render={<Link to="/c/$connectionId/collections/$name" params={params} />}>
                            <BracesIcon />
                            {t('collections.editSchema')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => promptClone(c.name)}>
                            <CopyIcon />
                            {t('collections.cloneSchema')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => confirmRemove(c.name)}>
                            <Trash2Icon />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
