import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CreateApiKeyDialog } from '@/components/create-api-key-dialog'
import { QueryError } from '@/components/query-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { useErrorMessage } from '@/hooks/use-typesense'
import { formatDate } from '@/lib/format'
import { api } from '@/lib/typesense/api'
import type { ApiKey } from '@/lib/typesense/types'
import { useApiKey } from '@/stores/connections'

/** Typesense stores keys created without `expires_at` with this timestamp (year 3021). */
const NEVER_EXPIRES = 64723363199

export function ApiKeysPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { connection, client } = useActiveConnection()
  const apiKey = useApiKey(connection.id)
  const [createOpen, setCreateOpen] = useState(false)
  const queryKey = [connection.id, 'keys']

  const keys = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.keys(client, signal),
    // Typesense only reveals a key's first characters, so the key of this connection is matched by its prefix.
    // It is hidden to keep it from being deleted by accident. The bootstrap key is never listed by Typesense.
    select: (data) =>
      data.filter((key) => !(key.value_prefix && apiKey?.startsWith(key.value_prefix))).sort((a, b) => b.id - a.id),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteKey(client, id),
    onSuccess: () => {
      toast.success(t('apiKeys.deleted'))
      return queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const confirmRemove = (key: ApiKey) => {
    if (window.confirm(t('apiKeys.confirmDelete', { name: key.description || `#${key.id}` }))) remove.mutate(key.id)
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('apiKeys.title')}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t('apiKeys.description')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          {t('apiKeys.create')}
        </Button>
      </div>

      {keys.error ? (
        <QueryError error={keys.error} onRetry={() => void keys.refetch()} />
      ) : !keys.data ? (
        <Skeleton className="h-40" />
      ) : keys.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <KeyRoundIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('apiKeys.empty')}</p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('apiKeys.descriptionField')}</TableHead>
                <TableHead>{t('apiKeys.key')}</TableHead>
                <TableHead>{t('apiKeys.actions')}</TableHead>
                <TableHead>{t('apiKeys.collections')}</TableHead>
                <TableHead>{t('apiKeys.expires')}</TableHead>
                <TableHead>
                  <span className="sr-only">{t('apiKeys.rowActions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.data.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium whitespace-normal">{key.description || '–'}</TableCell>
                  <TableCell className="font-mono text-xs">{key.value_prefix}…</TableCell>
                  <TableCell>
                    <BadgeList items={key.actions} />
                  </TableCell>
                  <TableCell>
                    <BadgeList items={key.collections} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Expiry expiresAt={key.expires_at} fetchedAt={keys.dataUpdatedAt} lng={lng} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('common.delete')}
                      disabled={remove.isPending && remove.variables === key.id}
                      onClick={() => confirmRemove(key)}
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

      <CreateApiKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

function BadgeList({ items }: { items: string[] }) {
  return (
    <div className="flex max-w-xs flex-wrap gap-1">
      {items.map((item) => (
        <Badge key={item} variant="secondary" className="font-mono">
          {item}
        </Badge>
      ))}
    </div>
  )
}

function Expiry({ expiresAt, fetchedAt, lng }: { expiresAt: number; fetchedAt: number; lng?: string }) {
  const { t } = useTranslation()
  if (expiresAt >= NEVER_EXPIRES) return t('apiKeys.never')
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {formatDate(expiresAt, lng)}
      {expiresAt * 1000 < fetchedAt && <Badge variant="destructive">{t('apiKeys.expired')}</Badge>}
    </span>
  )
}
