import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CopyIcon, TriangleAlertIcon } from 'lucide-react'
import { useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { MultiValueCombobox } from '@/components/multi-value-combobox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { useErrorMessage } from '@/hooks/use-typesense'
import { copyText } from '@/lib/clipboard'
import { KNOWN_ACTIONS } from '@/lib/typesense/actions'
import { api } from '@/lib/typesense/api'
import type { ApiKey, ApiKeyInput } from '@/lib/typesense/types'

type KeyType = 'admin' | 'search' | 'custom'

const EXAMPLES: Record<Exclude<KeyType, 'custom'>, ApiKeyInput> = {
  admin: { description: 'Admin key', actions: ['*'], collections: ['*'] },
  search: { description: 'Search-only key', actions: ['documents:search'], collections: ['products'] },
}

interface FormValues {
  description: string
  actions: string[]
  collections: string[]
  /** `yyyy-mm-dd` from the date input; empty means the key never expires. */
  expires: string
}

function toInput(values: FormValues): ApiKeyInput {
  return {
    description: values.description.trim(),
    actions: values.actions,
    collections: values.collections,
    // The key stays valid until the end of the chosen day.
    ...(values.expires && { expires_at: Math.floor(new Date(`${values.expires}T23:59:59`).getTime() / 1000) }),
  }
}

function keyTypeOf({ actions, collections }: Pick<ApiKeyInput, 'actions' | 'collections'>): KeyType {
  if (actions.join() === '*' && collections.join() === '*') return 'admin'
  if (actions.join() === 'documents:search') return 'search'
  return 'custom'
}

export function CreateApiKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const [created, setCreated] = useState<ApiKey | null>(null)

  const changeOpen = (next: boolean) => {
    onOpenChange(next)
    if (!next) setCreated(null)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <CreatedKey apiKey={created} onDone={() => changeOpen(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('apiKeys.create')}</DialogTitle>
              <DialogDescription>{t('apiKeys.createDescription')}</DialogDescription>
            </DialogHeader>
            <CreateApiKeyForm onCancel={() => changeOpen(false)} onCreated={setCreated} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateApiKeyForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (key: ApiKey) => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { connection, client } = useActiveConnection()
  const [tab, setTab] = useState<'form' | 'json'>('form')
  // Explicit state, not derived from the fields: otherwise typing "*" into a custom key would switch
  // the type to admin and hide the field being edited.
  const [keyType, setKeyType] = useState<KeyType>('search')
  const [values, setValues] = useState<FormValues>({
    description: '',
    actions: EXAMPLES.search.actions,
    collections: ['*'],
    expires: '',
  })
  const [showMissing, setShowMissing] = useState(false)
  // Shares the cache of the collections page; without it the field still accepts typed names.
  const collections = useQuery({
    queryKey: [connection.id, 'collections'],
    queryFn: ({ signal }) => api.collections(client, signal),
  })
  const collectionSuggestions = ['*', ...(collections.data ?? []).map((c) => c.name).sort((a, b) => a.localeCompare(b))]
  const [json, setJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  const input = toInput(values)

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }))

  // Presets fill in the fields they fix and hide them; switching to custom keeps the values to start from.
  const changeKeyType = (type: KeyType) => {
    setKeyType(type)
    if (type === 'admin') setValues((v) => ({ ...v, actions: ['*'], collections: ['*'] }))
    if (type === 'search')
      setValues((v) => ({ ...v, actions: ['documents:search'], collections: v.collections.length ? v.collections : ['*'] }))
  }

  const changeTab = (next: 'form' | 'json') => {
    // Carry the form over, so the JSON tab starts from what was already entered.
    if (next === 'json') setJson(JSON.stringify(input, null, 2))
    setJsonError(null)
    setTab(next)
  }

  const create = useMutation({
    mutationFn: (body: ApiKeyInput) => api.createKey(client, body),
    onSuccess: (key) => {
      onCreated(key)
      return queryClient.invalidateQueries({ queryKey: [connection.id, 'keys'] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    if (tab === 'form') {
      // The chips inputs cannot use native `required`.
      if (input.actions.length === 0 || input.collections.length === 0) return setShowMissing(true)
      return create.mutate(input)
    }
    try {
      create.mutate(JSON.parse(json) as ApiKeyInput)
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList activateOnFocus>
          <TabsTrigger value="form">{t('apiKeys.formTab')}</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="grid gap-4 pt-2">
          <div className="grid gap-2">
            <Label>{t('apiKeys.type')}</Label>
            <Select
              value={keyType}
              onValueChange={(v) => changeKeyType(v as KeyType)}
              items={{ admin: t('apiKeys.types.admin'), search: t('apiKeys.types.search'), custom: t('apiKeys.types.custom') }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t('apiKeys.types.admin')}</SelectItem>
                <SelectItem value="search">{t('apiKeys.types.search')}</SelectItem>
                <SelectItem value="custom">{t('apiKeys.types.custom')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`apiKeys.typeHints.${keyType}`)}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="key-description">{t('apiKeys.descriptionField')}</Label>
            <Input
              id="key-description"
              required
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          {keyType === 'custom' && (
            <div className="grid gap-2">
              <Label htmlFor="key-actions">{t('apiKeys.actions')}</Label>
              <MultiValueCombobox
                id="key-actions"
                values={values.actions}
                onChange={(next) => set('actions', next)}
                suggestions={KNOWN_ACTIONS}
                invalid={showMissing && values.actions.length === 0}
              />
              <FieldHint missing={showMissing && values.actions.length === 0} hint={t('apiKeys.actionsHint')} />
            </div>
          )}
          {keyType !== 'admin' && (
            <div className="grid gap-2">
              <Label htmlFor="key-collections">{t('apiKeys.collections')}</Label>
              <MultiValueCombobox
                id="key-collections"
                values={values.collections}
                onChange={(next) => set('collections', next)}
                suggestions={collectionSuggestions}
                invalid={showMissing && values.collections.length === 0}
              />
              <FieldHint missing={showMissing && values.collections.length === 0} hint={t('apiKeys.collectionsHint')} />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="key-expires">{t('apiKeys.expires')}</Label>
            <Input
              id="key-expires"
              type="date"
              className="w-fit"
              value={values.expires}
              onChange={(e) => set('expires', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('apiKeys.expiresHint')}</p>
          </div>
        </TabsContent>

        <TabsContent value="json" className="grid gap-2 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('apiKeys.insertExample')}</span>
            <Button type="button" variant="outline" size="xs" onClick={() => setJson(JSON.stringify(EXAMPLES.admin, null, 2))}>
              {t('apiKeys.types.admin')}
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={() => setJson(JSON.stringify(EXAMPLES.search, null, 2))}>
              {t('apiKeys.types.search')}
            </Button>
          </div>
          <Textarea
            aria-label="JSON"
            className="min-h-48 font-mono text-xs"
            spellCheck={false}
            aria-invalid={!!jsonError || undefined}
            value={json}
            onChange={(e) => {
              setJson(e.target.value)
              setJsonError(null)
            }}
          />
          {jsonError ? (
            <p className="text-xs text-destructive">{t('apiKeys.invalidJson', { message: jsonError })}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('apiKeys.jsonHint')}</p>
          )}
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? t('common.loading') : t('apiKeys.create')}
        </Button>
      </DialogFooter>
    </form>
  )
}

function FieldHint({ missing, hint }: { missing: boolean; hint: string }) {
  const { t } = useTranslation()
  return missing ? (
    <p className="text-xs text-destructive">{t('apiKeys.valueRequired')}</p>
  ) : (
    <p className="text-xs text-muted-foreground">{hint}</p>
  )
}

/** Typesense returns the full key only in the create response, so this is the one chance to copy it. */
function CreatedKey({ apiKey, onDone }: { apiKey: ApiKey; onDone: () => void }) {
  const { t } = useTranslation()

  const copy = async () => {
    if (await copyText(apiKey.value ?? '')) toast.success(t('apiKeys.copied'))
    else toast.error(t('collection.copyFailed'))
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('apiKeys.createdTitle')}</DialogTitle>
        <DialogDescription>{apiKey.description}</DialogDescription>
      </DialogHeader>
      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>{t('apiKeys.copyNowTitle')}</AlertTitle>
        <AlertDescription>{t('apiKeys.copyNow')}</AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Input readOnly aria-label={t('apiKeys.key')} className="font-mono" value={apiKey.value ?? ''} onFocus={(e) => e.target.select()} />
        <Button type="button" variant="outline" onClick={() => void copy()}>
          <CopyIcon />
          {t('collection.copy')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {keyTypeOf(apiKey) === 'admin' ? t('apiKeys.createdAdminHint') : t('apiKeys.createdOtherHint')}
      </p>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          {t('apiKeys.done')}
        </Button>
      </DialogFooter>
    </>
  )
}
