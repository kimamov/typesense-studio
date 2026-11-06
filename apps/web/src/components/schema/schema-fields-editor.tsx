import { PlusIcon, Trash2Icon, Undo2Icon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from 'cn'
import {
  EDITABLE_FLAGS,
  FIELD_TYPES,
  normalizeField,
  readOnlyReason,
  type SchemaChange,
  type SchemaDraft,
} from '@/lib/typesense/schema-diff'
import type { CollectionField } from '@/lib/typesense/types'

const TYPE_ITEMS = Object.fromEntries(FIELD_TYPES.map((type) => [type, type]))

/** Left edge of a field card by its change; the badge carries the same information as text. */
const STATE_EDGE = {
  add: 'border-l-emerald-500',
  change: 'border-l-amber-500',
}

interface SchemaFieldsEditorProps {
  base: SchemaDraft
  draft: SchemaDraft
  changes: SchemaChange[]
  onChange: (draft: SchemaDraft) => void
}

/** The fields of a schema draft as a form: one fieldset per field with its type, locale and flags. */
export function SchemaFieldsEditor({ base, draft, changes, onChange }: SchemaFieldsEditorProps) {
  const { t } = useTranslation()
  // Index of the field added last, whose name input takes the focus when it mounts; cleared once it loses focus,
  // so switching back from the JSON tab does not move the focus there again.
  const [added, setAdded] = useState<number | null>(null)
  // Fields added in the form, tracked by object so a new field keeps its name input while its name matches an existing one.
  const [addedFields] = useState(() => new WeakSet<CollectionField>())

  const stateOf = new Map(changes.map((change) => [change.name, change.kind]))
  const baseNames = new Set(base.fields.map((field) => field.name))
  const deleted = base.fields.filter((field) => stateOf.get(field.name) === 'drop')
  const nameCount = new Map<string, number>()
  for (const { name } of draft.fields) nameCount.set(name, (nameCount.get(name) ?? 0) + 1)

  const setFields = (fields: CollectionField[]) => onChange({ ...draft, fields })
  const replace = (index: number, field: CollectionField) => {
    if (addedFields.has(draft.fields[index])) addedFields.add(field)
    setFields(draft.fields.map((f, i) => (i === index ? field : f)))
  }

  const add = () => {
    // Most new fields target collections that already have documents, which the server only allows for optional fields.
    const field = { name: '', type: 'string', optional: true }
    addedFields.add(field)
    setFields([...draft.fields, field])
    setAdded(draft.fields.length)
  }

  return (
    <div className="flex flex-col gap-3">
      {draft.fields.map((field, index) => {
        const isNew = addedFields.has(field) || !baseNames.has(field.name)
        const state = isNew ? 'add' : stateOf.get(field.name) === 'change' ? 'change' : undefined
        const error = !field.name.trim() ? 'emptyName' : (nameCount.get(field.name) ?? 0) > 1 ? 'duplicateName' : undefined
        return (
          <FieldCard
            // Index keys keep the card (and focus) while a new field's name is typed.
            key={index}
            field={field}
            isNew={isNew}
            state={state}
            error={error}
            autoFocus={index === added}
            onNameBlur={() => setAdded(null)}
            onChange={(next) => replace(index, next)}
            onRemove={() => setFields(draft.fields.filter((_, i) => i !== index))}
          />
        )
      })}

      {deleted.map((field) => (
        <div
          key={`deleted-${field.name}`}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-4 py-2 text-sm text-muted-foreground"
        >
          <span className="font-mono line-through">{field.name}</span>
          <span className="font-mono text-xs line-through">{field.type}</span>
          <Badge variant="outline">{t('schema.state.drop')}</Badge>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setFields([...draft.fields, field])}>
            <Undo2Icon />
            {t('schema.undo')}
          </Button>
        </div>
      ))}

      <Button variant="outline" className="w-fit" onClick={add}>
        <PlusIcon />
        {t('schema.addField')}
      </Button>
    </div>
  )
}

interface FieldCardProps {
  field: CollectionField
  isNew: boolean
  state?: 'add' | 'change'
  error?: 'emptyName' | 'duplicateName'
  autoFocus: boolean
  onNameBlur: () => void
  onChange: (field: CollectionField) => void
  onRemove: () => void
}

function FieldCard({ field, isNew, state, error, autoFocus, onNameBlur, onChange, onRemove }: FieldCardProps) {
  const { t } = useTranslation()
  const id = useId()
  const reason = readOnlyReason(field)
  const normalized = normalizeField(field)
  const depth = isNew ? 0 : field.name.split('.').length - 1

  return (
    <fieldset
      className={cn('min-w-0 rounded-xl border border-l-4 p-4', state ? STATE_EDGE[state] : 'border-l-border')}
      // Nested fields ("specs.dimensions.width") are indented by depth.
      style={depth ? { marginLeft: `${depth * 1.25}rem` } : undefined}
    >
      {/* Floated so the legend sits inside the card instead of on its border. */}
      <legend className="float-left mb-4 flex w-full flex-wrap items-center gap-2">
        {isNew ? <span className="text-sm font-medium">{t('schema.newField')}</span> : <FieldName name={field.name} />}
        {state && <Badge variant="secondary">{t(`schema.state.${state}`)}</Badge>}
      </legend>

      <div className="clear-both grid gap-4 sm:grid-cols-3">
        {isNew && (
          <div className="grid content-start gap-2">
            <Label htmlFor={`${id}-name`}>{t('schema.fieldName')}</Label>
            <Input
              id={`${id}-name`}
              value={field.name}
              onChange={(e) => onChange({ ...field, name: e.target.value })}
              // Focus moves to a field the admin just added.
              autoFocus={autoFocus}
              onBlur={onNameBlur}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="font-mono"
            />
            {error && (
              <p id={`${id}-error`} className="text-xs text-destructive">
                {t(`schema.errors.${error}`, { name: field.name })}
              </p>
            )}
          </div>
        )}

        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-type`}>{t('collection.type')}</Label>
          <Select value={field.type} onValueChange={(type) => type && onChange({ ...field, type })} items={TYPE_ITEMS} disabled={!!reason}>
            <SelectTrigger id={`${id}-type`} className="w-full font-mono" aria-describedby={reason ? `${id}-reason` : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="font-mono">
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {field.type.startsWith('string') && (
          <div className="grid content-start gap-2">
            <Label htmlFor={`${id}-locale`}>{t('collection.locale')}</Label>
            <Input
              id={`${id}-locale`}
              value={field.locale ?? ''}
              onChange={(e) => onChange({ ...field, locale: e.target.value })}
              disabled={!!reason}
              className="font-mono"
            />
          </div>
        )}
      </div>

      {reason && (
        <p id={`${id}-reason`} className="mt-3 text-xs text-muted-foreground">
          {t(`schema.readOnly.${reason}`)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-4">
        {EDITABLE_FLAGS.map((flag) => (
          <div key={flag} className="flex items-center gap-2">
            {/* The id lands on Base UI's hidden input, so the visible checkbox is named by the label's id. */}
            <Checkbox
              id={`${id}-${flag}`}
              aria-labelledby={`${id}-${flag}-label`}
              checked={normalized[flag] === true}
              disabled={!!reason}
              onCheckedChange={(checked) => onChange({ ...field, [flag]: checked })}
            />
            <Label id={`${id}-${flag}-label`} htmlFor={`${id}-${flag}`} className="font-normal">
              {flag}
            </Label>
          </div>
        ))}
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2Icon />
          {t('schema.removeField')}
        </Button>
      </div>
    </fieldset>
  )
}

/** Nested fields show their parent path muted. */
function FieldName({ name }: { name: string }) {
  const parts = name.split('.')
  const leaf = parts.pop()
  return (
    <span className="font-mono text-sm break-all">
      {parts.length > 0 && <span className="text-muted-foreground">{parts.join('.')}.</span>}
      <span className="font-medium">{leaf}</span>
    </span>
  )
}
