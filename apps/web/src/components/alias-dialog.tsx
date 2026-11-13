import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { useErrorMessage } from '@/hooks/use-typesense'
import { isEscapeClear } from '@/lib/combobox'
import { api } from '@/lib/typesense/api'
import type { Alias } from '@/lib/typesense/types'

/** Creates an alias, or switches `alias` to another collection. */
export function AliasDialog({ open, alias, onOpenChange }: { open: boolean; alias?: Alias; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{alias ? t('aliases.switch') : t('aliases.create')}</DialogTitle>
          <DialogDescription>
            {alias ? t('aliases.switchDescription', { name: alias.name }) : t('aliases.createDescription')}
          </DialogDescription>
        </DialogHeader>
        {/* The form unmounts with the dialog, so it starts from `alias` each time. */}
        <AliasForm alias={alias} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function AliasForm({ alias, onDone }: { alias?: Alias; onDone: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { connection, client } = useActiveConnection()
  const [name, setName] = useState(alias?.name ?? '')
  const [collection, setCollection] = useState<string | null>(alias?.collection_name ?? null)

  const collections = useQuery({
    queryKey: [connection.id, 'collections'],
    queryFn: ({ signal }) => api.collections(client, signal),
  })
  const aliases = useQuery({ queryKey: [connection.id, 'aliases'], queryFn: ({ signal }) => api.aliases(client, signal) })
  const names = collections.data?.map((c) => c.name).sort((a, b) => a.localeCompare(b)) ?? []

  const save = useMutation({
    mutationFn: (target: string) => api.upsertAlias(client, name.trim(), target),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: [connection.id, 'aliases'] })
      toast.success(t('aliases.saved', { name: saved.name, collection: saved.collection_name }))
      onDone()
    },
  })

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    if (!collection) return
    // PUT replaces an alias of the same name without asking, so a typed name that exists is a switch too.
    const existing = aliases.data?.find((a) => a.name === name.trim())
    if (
      existing &&
      existing.collection_name !== collection &&
      !window.confirm(t('aliases.confirmSwitch', { name: existing.name, from: existing.collection_name, to: collection }))
    )
      return
    save.mutate(collection)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>{t('aliases.name')}</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!alias}
          required
          autoFocus={!alias}
          autoComplete="off"
          placeholder="books"
          className="font-mono"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-collection`}>{t('aliases.collection')}</Label>
        <Combobox
          items={names}
          value={collection}
          onValueChange={(value: string | null, details) => !isEscapeClear(details) && setCollection(value)}
          autoHighlight
        >
          <ComboboxInput
            id={`${id}-collection`}
            className="w-full"
            placeholder={t('aliases.selectCollection')}
            autoFocus={!!alias}
          />
          <ComboboxContent>
            <ComboboxEmpty>{collections.isPending ? t('common.loading') : t('nav.noCollections')}</ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item} className="font-mono">
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      {save.error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{errorMessage(save.error)}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending || !name.trim() || !collection}>
          {save.isPending ? t('aliases.saving') : t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}
