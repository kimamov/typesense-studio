import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useBlocker } from '@tanstack/react-router'
import { CircleAlertIcon, PlusIcon } from 'lucide-react'
import { useRef, useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { LazyJsonEditor } from '@/components/lazy-json-editor'
import { MultiValueCombobox } from '@/components/multi-value-combobox'
import { QueryError } from '@/components/query-error'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { useErrorMessage } from '@/hooks/use-typesense'
import { api } from '@/lib/typesense/api'
import { TypesenseError } from '@/lib/typesense/client'
import {
  DOCUMENT_ACTIONS,
  documentChanges,
  emptyDocument,
  formFields,
  parseDocumentsJson,
  type DocumentAction,
  type FormRow,
  type ImportResult,
  type TypesenseDocument,
} from '@/lib/typesense/document-form'
import type { CollectionSchema } from '@/lib/typesense/types'

const route = getRouteApi('/c/$connectionId/collections/$name/document')

type View = 'form' | 'json'

const format = (value: unknown) => JSON.stringify(value, null, 2)

/** Creates a document, or edits the one named by `?id`. */
export function DocumentPage() {
  const { t } = useTranslation()
  const navigate = route.useNavigate()
  const { connectionId, name } = route.useParams()
  const { id } = route.useSearch()
  const { connection, client } = useActiveConnection()
  // Changes after each save, so the editor starts again from the saved document.
  const [version, setVersion] = useState(0)
  // A missing document can be created under its id.
  const [createMissing, setCreateMissing] = useState<string | null>(null)
  const [openId, setOpenId] = useState('')

  const schema = useQuery({
    queryKey: [connection.id, 'collections', name],
    queryFn: ({ signal }) => api.collection(client, name, signal),
  })
  const document = useQuery({
    queryKey: [connection.id, 'collections', name, 'document', id],
    queryFn: ({ signal }) => api.document(client, name, id!, signal),
    enabled: id !== undefined,
  })
  const missing = document.error instanceof TypesenseError && document.error.status === 404

  const open = (event: SubmitEvent) => {
    event.preventDefault()
    if (openId.trim()) void navigate({ search: { id: openId.trim() } })
    setOpenId('')
  }

  const saved = (savedId: string) => {
    setCreateMissing(null)
    if (savedId === id) setVersion((v) => v + 1)
    else void navigate({ search: { id: savedId } })
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm break-all text-muted-foreground">{name}</p>
          <h1 className="text-2xl font-semibold break-all">{id === undefined || missing ? t('document.newTitle') : t('document.editTitle', { id })}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <form onSubmit={open} className="flex gap-2">
            <Input
              value={openId}
              onChange={(e) => setOpenId(e.target.value)}
              placeholder={t('document.openPlaceholder')}
              aria-label={t('document.open')}
              className="w-40 font-mono"
            />
            <Button type="submit" variant="outline" disabled={!openId.trim()}>
              {t('document.openButton')}
            </Button>
          </form>
          {id !== undefined && (
            <Link to="/c/$connectionId/collections/$name/document" params={{ connectionId, name }} className={buttonVariants()}>
              <PlusIcon />
              {t('document.new')}
            </Link>
          )}
        </div>
      </div>

      {schema.error ? (
        <QueryError error={schema.error} onRetry={() => void schema.refetch()} />
      ) : id !== undefined && missing && createMissing !== id ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{t('document.notFound', { id })}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => setCreateMissing(id)}>
              {t('document.createWithId')}
            </Button>
          </AlertAction>
        </Alert>
      ) : id !== undefined && document.error && !missing ? (
        <QueryError error={document.error} onRetry={() => void document.refetch()} />
      ) : !schema.data || (id !== undefined && !missing && !document.data) ? (
        <Skeleton className="h-64" />
      ) : (
        <DocumentEditor
          key={`${id ?? ''}:${version}`}
          schema={schema.data}
          base={id !== undefined && !missing ? document.data : undefined}
          initial={createMissing !== null ? { id: createMissing } : undefined}
          onSaved={saved}
        />
      )}
    </>
  )
}

interface DocumentEditorProps {
  schema: CollectionSchema
  /** The saved document being edited; without it, a new document is created. */
  base?: TypesenseDocument
  /** Values a new document starts with. */
  initial?: TypesenseDocument
  onSaved: (id: string) => void
}

/** The form and the JSON view share one draft; the JSON text is read into it when its tab is left. */
function DocumentEditor({ schema, base, initial, onSaved }: DocumentEditorProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const { connection, client } = useActiveConnection()
  const [start] = useState(() => base ?? { ...emptyDocument(schema), ...initial })
  const [draft, setDraft] = useState(start)
  const [view, setView] = useState<View>('form')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [action, setAction] = useState<DocumentAction>(base ? 'update' : 'create')
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const leaving = useRef(false)

  const changes = base ? documentChanges(base, draft) : null
  const dirty = format(draft) !== format(start) || (view === 'json' && jsonText !== format(draft))

  useBlocker({
    shouldBlockFn: () => dirty && !leaving.current && !window.confirm(t('document.unsaved')),
    enableBeforeUnload: () => dirty && !leaving.current,
  })

  const write = useMutation({
    mutationFn: ({ documents, action }: { documents: TypesenseDocument[]; action: DocumentAction }) =>
      api.importDocuments(client, schema.name, documents, action),
    onMutate: () => setResults(null),
    onSuccess: async (results) => {
      setResults(results)
      const ok = results.filter((r) => r.success)
      if (ok.length === 0) return
      // Refreshes the search, the document count and the loaded document before the editor starts again.
      await queryClient.invalidateQueries({ queryKey: [connection.id, 'collections', schema.name] })
      if (ok.length < results.length) return
      toast.success(t('document.saved', { count: results.length }))
      if (results.length === 1 && results[0].id) {
        leaving.current = true
        onSaved(results[0].id)
      }
    },
  })

  /** Reads the JSON tab; null when the text is not valid. */
  const readJson = () => {
    const result = parseDocumentsJson(jsonText)
    if ('error' in result) {
      setJsonError(t(`document.parse.${result.error.kind}`, result.error))
      return null
    }
    setJsonError(null)
    return result
  }

  const changeView = (next: View) => {
    if (next === view) return
    if (next === 'json') {
      setJsonText(format(draft))
      setJsonError(null)
      return setView(next)
    }
    const result = readJson()
    if (!result) return
    if (!result.single) return setJsonError(t('document.parse.array'))
    const [document] = result.documents
    if (base && document.id !== base.id) return setJsonError(t('document.parse.idChanged', { id: base.id }))
    setDraft(document)
    setView(next)
  }

  const run = () => {
    const result = readJson()
    if (result) write.mutate({ documents: result.documents, action })
  }

  const setValue = (name: string, value: unknown) =>
    setDraft((current) => {
      const next = { ...current, [name]: value }
      if (value === undefined) delete next[name]
      return next
    })

  const failed = results?.filter((r) => !r.success) ?? []

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={view} onValueChange={(next: View) => changeView(next)}>
        <TabsList activateOnFocus>
          <TabsTrigger value="form">{t('document.formTab')}</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="flex flex-col gap-4">
          <div className="grid gap-x-4 gap-y-3 rounded-xl border p-4 sm:grid-cols-[minmax(0,12rem)_1fr]">
            {formFields(schema, draft, !!base).map((row) => (
              <FieldRow key={row.name} row={row} value={draft[row.name]} onChange={(value) => setValue(row.name, value)} />
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {base ? (
              <Button onClick={() => changes && write.mutate({ documents: [changes], action: 'update' })} disabled={!changes || write.isPending}>
                {t('document.save')}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => write.mutate({ documents: [draft], action: 'upsert' })} disabled={write.isPending}>
                  {t('document.upsert')}
                </Button>
                <Button onClick={() => write.mutate({ documents: [draft], action: 'create' })} disabled={write.isPending}>
                  {t('document.create')}
                </Button>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="json" className="flex flex-col gap-2">
          <LazyJsonEditor
            value={jsonText}
            onChange={(text) => {
              setJsonText(text)
              setJsonError(null)
            }}
            onSubmit={run}
            aria-label={t('document.jsonLabel')}
          />
          {jsonError ? (
            <p className="text-xs text-destructive" role="alert">
              {jsonError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('document.jsonHint')}</p>
          )}
          <div className="flex flex-wrap items-start justify-end gap-2">
            <div className="flex flex-col gap-1">
              <Select
                value={action}
                onValueChange={(next) => next && setAction(next as DocumentAction)}
                items={Object.fromEntries(DOCUMENT_ACTIONS.map((a) => [a, a]))}
              >
                <SelectTrigger className="w-32 font-mono" aria-label={t('document.action')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_ACTIONS.map((a) => (
                    <SelectItem key={a} value={a} className="font-mono">
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={run} disabled={write.isPending}>
              {t('document.run')}
            </Button>
          </div>
          <p className="text-right text-xs text-muted-foreground">{t(`document.actions.${action}`)}</p>
        </TabsContent>
      </Tabs>

      {write.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{errorMessage(write.error)}</AlertDescription>
        </Alert>
      )}
      {failed.length > 0 && results && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription className="flex flex-col gap-2">
            {results.length > 1 && <p>{t('document.results', { ok: results.length - failed.length, count: results.length })}</p>}
            <ul className="flex flex-col gap-1">
              {results.map((result, i) => (
                <li key={i} className="break-words">
                  {results.length > 1 &&
                    (result.success && result.id ? (
                      <Link
                        to="/c/$connectionId/collections/$name/document"
                        params={{ connectionId: connection.id, name: schema.name }}
                        search={{ id: result.id }}
                        className="font-mono underline"
                      >
                        {result.id}
                      </Link>
                    ) : (
                      <span className="font-mono">{result.id ?? `#${i + 1}`}</span>
                    ))}
                  {results.length > 1 && ': '}
                  {result.success ? '✓' : result.error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function FieldRow({ row, value, onChange }: { row: FormRow; value: unknown; onChange: (value: unknown) => void }) {
  const { t } = useTranslation()
  const id = `document-field-${row.name}`
  // An empty optional field is left out of the document.
  const empty = row.required ? '' : undefined

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 sm:pt-1.5">
        <Label htmlFor={id} className="font-mono break-all">
          {row.name}
        </Label>
        <Badge variant="outline" className="font-mono">
          {row.type}
        </Badge>
        {row.required && <span className="text-xs text-muted-foreground">{t('document.required')}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {row.kind === 'readonly' ? (
          <>
            <Input id={id} readOnly value={value === undefined ? '' : JSON.stringify(value)} className="font-mono text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t(`document.readOnly.${row.reason}`)}</p>
          </>
        ) : row.kind === 'bool' ? (
          <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
        ) : row.kind === 'list' ? (
          <MultiValueCombobox
            id={id}
            values={Array.isArray(value) ? value.map(String) : []}
            onChange={(values) => onChange(row.numeric ? values.map(Number).filter((n) => !Number.isNaN(n)) : values)}
            suggestions={[]}
          />
        ) : (
          <>
            <Input
              id={id}
              type={row.kind === 'number' ? 'number' : 'text'}
              value={value === undefined || value === null ? '' : String(value)}
              onChange={(e) => {
                const text = e.target.value
                onChange(text === '' ? empty : row.kind === 'number' ? Number(text) : text)
              }}
              className={row.name === 'id' ? 'font-mono' : undefined}
            />
            {row.name === 'id' && <p className="text-xs text-muted-foreground">{t('document.idHint')}</p>}
          </>
        )}
      </div>
    </>
  )
}
