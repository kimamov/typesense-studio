import { useBlocker } from '@tanstack/react-router'
import { CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { LazyJsonEditor } from '@/components/lazy-json-editor'
import { SchemaChangesDialog } from '@/components/schema/schema-changes-dialog'
import { SchemaFieldsEditor } from '@/components/schema/schema-fields-editor'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { copyText } from '@/lib/clipboard'
import { diffSchema, parseDraftJson, toDraft, type DraftParseError, type SchemaDraft } from '@/lib/typesense/schema-diff'
import type { CollectionSchema } from '@/lib/typesense/types'

type View = 'form' | 'json'

const format = (draft: SchemaDraft) => JSON.stringify(draft, null, 2)

/**
 * The schema of a collection, always editable. The form and the JSON editor share one draft; the JSON text
 * is read into the draft when its tab is left or the changes are reviewed. `onReset` asks the parent to mount
 * a fresh editor from the current schema, after a save or a discard.
 */
export function SchemaEditor({ schema, onReset }: { schema: CollectionSchema; onReset: () => void }) {
  const { t } = useTranslation()
  // Copied once: background refetches must not move the base the changes are computed against.
  const [base] = useState(() => toDraft(schema))
  const [draft, setDraft] = useState(base)
  const [view, setView] = useState<View>('form')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<DraftParseError | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const diff = diffSchema(base, draft)
  const jsonDirty = view === 'json' && jsonText !== format(draft)
  const changeCount = diff.changes.length + (diff.body.metadata !== undefined ? 1 : 0) + (diff.body.synonym_sets !== undefined ? 1 : 0)
  const dirty = changeCount > 0 || diff.errors.length > 0 || jsonDirty

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

  const discard = () => {
    if (window.confirm(t('schema.unsaved'))) onReset()
  }

  const copySchema = async () => {
    if (await copyText(JSON.stringify(schema, null, 2))) toast.success(t('collection.copied'))
    else toast.error(t('collection.copyFailed'))
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={view} onValueChange={(next: View) => changeView(next)}>
        <TabsList activateOnFocus>
          <TabsTrigger value="form">{t('schema.formTab', { count: draft.fields.length })}</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            {jsonError ? (
              <p className="text-xs text-destructive" role="alert">
                {t(`schema.parse.${jsonError.kind}`, jsonError)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('schema.jsonHint')}</p>
            )}
            <Button variant="outline" size="sm" onClick={() => void copySchema()}>
              <CopyIcon />
              {t('collection.copy')}
            </Button>
          </div>
          {/* The form shows these next to the field; here they explain why the review is disabled. */}
          {diff.errors.map((error, i) => (
            <p key={i} className="text-xs text-destructive" role="alert">
              {t(`schema.errors.${error.kind}`, error)}
            </p>
          ))}
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <p className="mr-auto text-sm text-muted-foreground" aria-live="polite">
          {changeCount > 0 ? t('schema.changeCount', { count: changeCount }) : dirty ? t('schema.unsavedEdits') : t('schema.noEdits')}
        </p>
        <Button variant="outline" onClick={discard} disabled={!dirty}>
          {t('schema.discard')}
        </Button>
        <Button onClick={() => readJson() && setReviewing(true)} disabled={!dirty || diff.errors.length > 0}>
          {t('schema.review')}
        </Button>
      </div>

      <SchemaChangesDialog
        name={schema.name}
        base={base}
        diff={diff}
        open={reviewing}
        onOpenChange={setReviewing}
        onSaved={onReset}
        onDiscard={onReset}
      />
    </div>
  )
}
