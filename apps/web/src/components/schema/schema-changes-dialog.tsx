import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { useErrorMessage } from '@/hooks/use-typesense'
import { formatNumber } from '@/lib/format'
import { api } from '@/lib/typesense/api'
import { TypesenseError } from '@/lib/typesense/client'
import { diffSchema, toDraft, type SchemaDiff, type SchemaDraft } from '@/lib/typesense/schema-diff'

interface SchemaChangesDialogProps {
  name: string
  /** The schema editing started from. */
  base: SchemaDraft
  diff: SchemaDiff
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  onDiscard: () => void
}

/** Shows what a save will do and sends it, after checking that nobody changed the schema meanwhile. */
export function SchemaChangesDialog(props: SchemaChangesDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">{props.open && <ChangesPreview {...props} />}</DialogContent>
    </Dialog>
  )
}

function ChangesPreview({ name, base, diff, onSaved, onDiscard }: SchemaChangesDialogProps) {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { connection, client } = useActiveConnection()

  // Always loaded fresh when the dialog opens: the edit started from `base`, which may be outdated.
  const current = useQuery({
    queryKey: [connection.id, 'collections', name],
    queryFn: ({ signal }) => api.collection(client, name, signal),
    refetchOnMount: 'always',
  })
  const checked = current.isFetchedAfterMount && !current.isFetching

  const save = useMutation({
    mutationFn: () => api.updateCollection(client, name, diff.body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [connection.id, 'collections'] })
      toast.success(t('schema.saved'))
      onSaved()
    },
    // Without an answer the change may still run on the server, so the schema is loaded again.
    onError: (error) => {
      if (error instanceof TypesenseError && error.status === 0) void current.refetch()
    },
  })
  const noAnswer = save.error instanceof TypesenseError && save.error.status === 0
  // After a save (or one without answer) the server schema differs from `base` on purpose.
  const conflict =
    checked && !!current.data && !save.isSuccess && !noAnswer && hasChanges(diffSchema(base, toDraft(current.data)))

  const documents = current.data?.num_documents
  const keysLabel = (keys: string[]) => keys.join(', ')
  // Typesense clears the default sorting field when its field is dropped or changed, and it cannot be set again.
  const sortingField = current.data?.default_sorting_field
  const losesSortingField = !!sortingField && diff.changes.some((c) => c.name === sortingField && c.kind !== 'add')

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('schema.previewTitle')}</DialogTitle>
        <DialogDescription>{t('schema.previewDescription')}</DialogDescription>
      </DialogHeader>

      {!checked ? (
        <p className="text-sm text-muted-foreground">{t('schema.checking')}</p>
      ) : current.error ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{errorMessage(current.error)}</AlertDescription>
        </Alert>
      ) : conflict ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{t('schema.conflict')}</AlertDescription>
        </Alert>
      ) : !hasChanges(diff) ? (
        <p className="text-sm text-muted-foreground">{t('schema.noChanges')}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {diff.changes.map((change) => (
              <li key={`${change.kind}-${change.name}`}>
                {change.kind === 'change'
                  ? t('schema.change.change', { name: change.name, keys: keysLabel(change.keys) })
                  : t(`schema.change.${change.kind}`, { name: change.name })}
                {change.kind !== 'drop' && documents !== undefined && (
                  <span className="text-muted-foreground">
                    {' '}
                    ({t('schema.documents', { count: documents, formatted: formatNumber(documents, i18n.resolvedLanguage, 0) })})
                  </span>
                )}
              </li>
            ))}
            {(diff.body.metadata !== undefined || diff.body.synonym_sets !== undefined) && (
              <li className="font-mono text-xs">
                {[diff.body.metadata !== undefined && 'metadata', diff.body.synonym_sets !== undefined && 'synonym_sets']
                  .filter(Boolean)
                  .join(', ')}
              </li>
            )}
          </ul>
          {losesSortingField && (
            <Alert>
              <TriangleAlertIcon />
              <AlertDescription>{t('schema.losesSortingField', { name: sortingField })}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">{t('schema.body')}</p>
            <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
              {JSON.stringify(diff.body, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {save.error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{noAnswer ? t('schema.noAnswer') : errorMessage(save.error)}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        {conflict ? (
          <Button variant="destructive" onClick={onDiscard}>
            {t('schema.discard')}
          </Button>
        ) : (
          <Button onClick={() => save.mutate()} disabled={!checked || !!current.error || !hasChanges(diff) || save.isPending || noAnswer}>
            {save.isPending ? t('schema.saving') : t('schema.save')}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function hasChanges(diff: SchemaDiff): boolean {
  return Object.keys(diff.body).length > 0
}
