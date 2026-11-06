import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { useErrorMessage } from '@/hooks/use-typesense'
import { formatNumber } from '@/lib/format'
import { api } from '@/lib/typesense/api'

/** "Delete collection" button with a confirmation; on success it returns to the collections list. */
export function DeleteCollectionButton({ name, documents }: { name: string; documents: number }) {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { connection, client } = useActiveConnection()
  const [open, setOpen] = useState(false)

  const remove = useMutation({
    mutationFn: () => api.deleteCollection(client, name),
    onSuccess: async () => {
      // Removed first, so the page being left does not refetch a collection that is gone.
      queryClient.removeQueries({ queryKey: [connection.id, 'collections', name] })
      await queryClient.invalidateQueries({ queryKey: [connection.id, 'collections'] })
      toast.success(t('collection.deleted', { name }))
      // Unsaved schema edits belong to the deleted collection, so the blocker must not ask about them.
      void navigate({ to: '/c/$connectionId/collections', params: { connectionId: connection.id }, ignoreBlocker: true })
    },
  })

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2Icon />
        {t('collection.delete')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) remove.reset()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('collection.deleteTitle', { name })}</DialogTitle>
            <DialogDescription>
              {t('collection.deleteDescription', { count: documents, formatted: formatNumber(documents, i18n.resolvedLanguage, 0) })}
            </DialogDescription>
          </DialogHeader>
          {remove.error && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertDescription>{errorMessage(remove.error)}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? t('collection.deleting') : t('collection.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
