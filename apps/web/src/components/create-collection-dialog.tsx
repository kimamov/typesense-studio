import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { LazyJsonEditor } from '@/components/lazy-json-editor'
import { SchemaFieldsEditor } from '@/components/schema/schema-fields-editor'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { useErrorMessage } from '@/hooks/use-typesense'
import { api } from '@/lib/typesense/api'
import {
  createErrors,
  emptyCreateDraft,
  hasObjectFields,
  parseCreateJson,
  sortingFieldCandidates,
  toCreateBody,
  type CreateDraft,
  type CreateError,
  type CreateParseError,
} from '@/lib/typesense/collection-create'

type View = 'form' | 'json'

const format = (draft: CreateDraft) => JSON.stringify(toCreateBody(draft), null, 2)
const NO_BASE = { fields: [] }

/** Dialog that creates a collection. Closing it with edits asks first, so a click outside does not lose a schema. */
export function CreateCollectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  // The form unmounts with the dialog; it reports here whether closing would lose edits.
  const dirty = useRef(false)

  const close = () => {
    if (dirty.current && !window.confirm(t('collections.unsaved'))) return
    dirty.current = false
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      {/* The body scrolls between the fixed header and buttons, so a long schema stays usable. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('collections.create')}</DialogTitle>
          <DialogDescription>{t('collections.createDescription')}</DialogDescription>
        </DialogHeader>
        <CreateCollectionForm
          onDirtyChange={(value) => {
            dirty.current = value
          }}
          onCancel={close}
          onCreated={() => {
            dirty.current = false
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

interface FormProps {
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
  onCreated: () => void
}

function CreateCollectionForm({ onDirtyChange, onCancel, onCreated }: FormProps) {
  const { t } = useTranslation()
  const id = useId()
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { connection, client } = useActiveConnection()
  const [initial] = useState(emptyCreateDraft)
  const [draft, setDraft] = useState(initial)
  const [view, setView] = useState<View>('form')
  const [jsonText, setJsonText] = useState('')
  const [parseError, setParseError] = useState<CreateParseError | null>(null)
  // Collection-level mistakes are shown once a submit was tried; the field cards show theirs right away.
  const [showErrors, setShowErrors] = useState(false)

  // Shares the cache of the collections page, to catch a name that is taken before the server does.
  const collections = useQuery({
    queryKey: [connection.id, 'collections'],
    queryFn: ({ signal }) => api.collections(client, signal),
  })
  const errors = createErrors(draft, collections.data?.map((c) => c.name) ?? [])
  const errorOf = (kind: CreateError['kind']) => (showErrors ? errors.find((error) => error.kind === kind) : undefined)
  const nameError = errorOf('emptyCollectionName') ?? errorOf('collectionExists')
  const sortingError = errorOf('invalidSortingField')

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || (view === 'json' && jsonText !== format(draft))
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const candidates = sortingFieldCandidates(draft.fields)
  const sorting = draft.default_sorting_field ?? ''
  // A chosen field that is no longer valid stays listed, so the select shows it next to its error.
  const sortingItems: Record<string, string> = {
    '': t('collections.sortingFieldNone'),
    ...Object.fromEntries([...candidates, ...(sorting && !candidates.includes(sorting) ? [sorting] : [])].map((name) => [name, name])),
  }

  const create = useMutation({
    mutationFn: (body: CreateDraft) => api.createCollection(client, body),
    onSuccess: async (collection) => {
      await queryClient.invalidateQueries({ queryKey: [connection.id, 'collections'] })
      toast.success(t('collections.created', { name: collection.name }))
      onCreated()
    },
  })

  /** Reads the JSON tab into the draft; null when the text is not a valid body. */
  const readJson = (): CreateDraft | null => {
    if (view !== 'json') return draft
    const result = parseCreateJson(jsonText)
    if ('error' in result) {
      setParseError(result.error)
      return null
    }
    setDraft(result.draft)
    return result.draft
  }

  const changeView = (next: View) => {
    if (next === view || !readJson()) return
    if (next === 'json') setJsonText(format(draft))
    setView(next)
  }

  const submit = (event?: SubmitEvent) => {
    event?.preventDefault()
    const current = readJson()
    if (!current) return
    setShowErrors(true)
    if (createErrors(current, collections.data?.map((c) => c.name) ?? []).length > 0) return
    create.mutate(toCreateBody(current))
  }

  const errorText = (error: CreateError) =>
    error.kind === 'emptyName' || error.kind === 'duplicateName'
      ? t(`schema.errors.${error.kind}`, error)
      : t(`collections.errors.${error.kind}`, error)

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
      <Tabs value={view} onValueChange={(next: View) => changeView(next)} className="min-h-0">
        <TabsList activateOnFocus>
          <TabsTrigger value="form">{t('schema.formTab', { count: draft.fields.length })}</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="-mx-4 flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor={`${id}-name`}>{t('collections.collectionName')}</Label>
              <Input
                id={`${id}-name`}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="books"
                autoFocus
                autoComplete="off"
                aria-invalid={!!nameError || undefined}
                aria-describedby={nameError ? `${id}-name-error` : undefined}
                className="font-mono"
              />
              {nameError && (
                <p id={`${id}-name-error`} className="text-xs text-destructive">
                  {errorText(nameError)}
                </p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor={`${id}-sorting`}>{t('collections.sortingField')}</Label>
              <Select
                value={sorting}
                onValueChange={(value) => setDraft({ ...draft, default_sorting_field: (value as string) || undefined })}
                items={sortingItems}
              >
                <SelectTrigger
                  id={`${id}-sorting`}
                  className="w-full font-mono"
                  aria-invalid={!!sortingError || undefined}
                  aria-describedby={`${id}-sorting-hint`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(sortingItems).map(([value, label]) => (
                    <SelectItem key={value} value={value} className={value ? 'font-mono' : undefined}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id={`${id}-sorting-hint`} className={sortingError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                {sortingError ? errorText(sortingError) : t('collections.sortingFieldHint')}
              </p>
            </div>
          </div>

          <SchemaFieldsEditor
            base={NO_BASE}
            draft={draft}
            changes={[]}
            onChange={(next) => setDraft({ ...draft, fields: next.fields })}
            create
            showErrors={showErrors}
          />
          {errorOf('noFields') && <p className="text-xs text-destructive">{errorText(errorOf('noFields')!)}</p>}
          {hasObjectFields(draft) && draft.enable_nested_fields === undefined && (
            <p className="text-xs text-muted-foreground">{t('collections.nestedHint')}</p>
          )}
        </TabsContent>

        <TabsContent value="json" className="-mx-4 flex min-h-0 flex-col gap-2 overflow-y-auto px-4 pt-2 pb-1">
          <LazyJsonEditor
            value={jsonText}
            onChange={(text) => {
              setJsonText(text)
              setParseError(null)
            }}
            onSubmit={() => submit()}
            aria-label={t('collections.jsonLabel')}
          />
          {parseError ? (
            <p className="text-xs text-destructive" role="alert">
              {t(`schema.parse.${parseError.kind}`, parseError)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('collections.jsonHint')}</p>
          )}
          {/* The form shows these at their inputs; here they explain why nothing was sent. */}
          {showErrors &&
            errors.map((error, i) => (
              <p key={i} className="text-xs text-destructive" role="alert">
                {errorText(error)}
              </p>
            ))}
        </TabsContent>
      </Tabs>

      {create.error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{errorMessage(create.error)}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? t('collections.creating') : t('collections.create')}
        </Button>
      </DialogFooter>
    </form>
  )
}
