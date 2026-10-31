import { useBlocker } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LazyJsonEditor } from '@/components/lazy-json-editor'
import { SchemaChangesDialog } from '@/components/schema/schema-changes-dialog'
import { SchemaFieldsEditor } from '@/components/schema/schema-fields-editor'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { diffSchema, parseDraftJson, toDraft, type DraftParseError, type SchemaDraft } from '@/lib/typesense/schema-diff'
import type { CollectionSchema } from '@/lib/typesense/types'

type View = 'table' | 'json'

const format = (draft: SchemaDraft) => JSON.stringify(draft, null, 2)

/**
 * Edit mode of the schema page. The table and the JSON editor share one draft; the JSON text is read into
 * the draft when its tab is left or the changes are reviewed.
 */
export function SchemaEditor({ schema, onDone }: { schema: CollectionSchema; onDone: () => void }) {
  const { t } = useTranslation()
  // Copied once: background refetches must not move the base the changes are computed against.
  const [base] = useState(() => toDraft(schema))
  const [draft, setDraft] = useState(base)
  const [view, setView] = useState<View>('table')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<DraftParseError | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const diff = diffSchema(base, draft)
  const dirty = Object.keys(diff.body).length > 0 || diff.errors.length > 0 || (view === 'json' && jsonText !== format(draft))

  useBlocker({ shouldBlockFn: () => dirty && !window.confirm(t('schema.unsaved')), enableBeforeUnload: dirty })

  /** Reads the JSON tab into the draft; false when the text is not a valid draft. */
  const readJson = () => {
    if (view !== 'json') return true
    const result = parseDraftJson(jsonText)
    if ('error' in result) {
      setJsonError(result.error)
      return false
    }
    setDraft(result.draft)
    return true
  }

  const changeView = (next: View) => {
    if (next === view || !readJson()) return
    if (next === 'json') setJsonText(format(draft))
    setView(next)
  }

  const cancel = () => {
    if (dirty && !window.confirm(t('schema.unsaved'))) return
    onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={view} onValueChange={(next: View) => changeView(next)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList activateOnFocus>
            <TabsTrigger value="table">{t('collection.fieldsTab', { count: draft.fields.length })}</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" onClick={cancel}>
              {t('schema.cancel')}
            </Button>
            <Button onClick={() => readJson() && setReviewing(true)} disabled={diff.errors.length > 0}>
              {t('schema.review')}
            </Button>
          </div>
        </div>

        <TabsContent value="table">
          <SchemaFieldsEditor base={base} draft={draft} changes={diff.changes} onChange={setDraft} />
        </TabsContent>
        <TabsContent value="json" className="flex flex-col gap-2">
          <LazyJsonEditor
            value={jsonText}
            onChange={(text) => {
              setJsonText(text)
              setJsonError(null)
            }}
            onSubmit={() => readJson() && setReviewing(true)}
            aria-label={t('schema.jsonLabel')}
          />
          {jsonError ? (
            <p className="text-xs text-destructive" role="alert">
              {t(`schema.parse.${jsonError.kind}`, jsonError)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('schema.jsonHint')}</p>
          )}
        </TabsContent>
      </Tabs>

      {diff.errors.map((error, i) => (
        <p key={i} className="text-xs text-destructive" role="alert">
          {t(`schema.errors.${error.kind}`, error)}
        </p>
      ))}

      <SchemaChangesDialog
        name={schema.name}
        base={base}
        diff={diff}
        open={reviewing}
        onOpenChange={setReviewing}
        onSaved={onDone}
        onDiscard={onDone}
      />
    </div>
  )
}
