import { PlusIcon, Trash2Icon, Undo2Icon } from 'lucide-react'
import { useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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

interface SchemaFieldsEditorProps {
  base: SchemaDraft
  draft: SchemaDraft
  changes: SchemaChange[]
  onChange: (draft: SchemaDraft) => void
}

/** The fields of a schema draft as an editable table: type and flags per field, add and delete. */
export function SchemaFieldsEditor({ base, draft, changes, onChange }: SchemaFieldsEditorProps) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<string>('string')

  const stateOf = new Map(changes.map((change) => [change.name, change.kind]))
  const baseNames = new Set(base.fields.map((field) => field.name))
  const deleted = base.fields.filter((field) => stateOf.get(field.name) === 'drop')
  const nameTaken = draft.fields.some((field) => field.name === newName.trim())

  const setFields = (fields: CollectionField[]) => onChange({ ...draft, fields })
  const replace = (index: number, field: CollectionField) => setFields(draft.fields.map((f, i) => (i === index ? field : f)))

  const add = (event: SubmitEvent) => {
    event.preventDefault()
    const name = newName.trim()
    if (!name || nameTaken) return
    // Most new fields target collections that already have documents, which the server only allows for optional fields.
    setFields([...draft.fields, { name, type: newType, optional: true }])
    setNewName('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('collection.field')}</TableHead>
              <TableHead>{t('collection.type')}</TableHead>
              {EDITABLE_FLAGS.map((flag) => (
                <TableHead key={flag} className="text-center">
                  {flag}
                </TableHead>
              ))}
              <TableHead>
                <span className="sr-only">{t('schema.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.fields.map((field, index) => {
              const reason = readOnlyReason(field)
              const normalized = normalizeField(field)
              const state = stateOf.get(field.name)
              return (
                // Index keys keep the row (and focus) while a new field's name is typed.
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {baseNames.has(field.name) ? (
                        <Tooltip>
                          <TooltipTrigger render={<span className="font-mono text-sm font-medium" />}>{field.name}</TooltipTrigger>
                          <TooltipContent>{t('schema.renameHint')}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Input
                          value={field.name}
                          onChange={(e) => replace(index, { ...field, name: e.target.value })}
                          aria-label={t('schema.newFieldName')}
                          className="h-7 w-40 font-mono"
                        />
                      )}
                      {state && state !== 'drop' && <Badge variant="secondary">{t(`schema.state.${state}`)}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {reason ? (
                      <Tooltip>
                        <TooltipTrigger render={<span />}>
                          <Badge variant="outline" className="font-mono">
                            {field.type}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{t(`schema.readOnly.${reason}`)}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Select value={field.type} onValueChange={(type) => type && replace(index, { ...field, type })} items={TYPE_ITEMS}>
                        <SelectTrigger size="sm" className="font-mono" aria-label={t('collection.type')}>
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
                    )}
                  </TableCell>
                  {EDITABLE_FLAGS.map((flag) => (
                    <TableCell key={flag} className="text-center">
                      <Checkbox
                        checked={normalized[flag] === true}
                        disabled={!!reason}
                        onCheckedChange={(checked) => replace(index, { ...field, [flag]: checked })}
                        aria-label={`${field.name}: ${flag}`}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('schema.deleteField', { name: field.name })}
                      onClick={() => setFields(draft.fields.filter((_, i) => i !== index))}
                    >
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {deleted.map((field) => (
              <TableRow key={`deleted-${field.name}`} className="text-muted-foreground">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm line-through">{field.name}</span>
                    <Badge variant="outline">{t('schema.state.drop')}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs line-through">{field.type}</span>
                </TableCell>
                <TableCell colSpan={EDITABLE_FLAGS.length} />
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setFields([...draft.fields, field])}>
                    <Undo2Icon />
                    {t('schema.undo')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('schema.newFieldName')}
          aria-label={t('schema.newFieldName')}
          aria-invalid={nameTaken || undefined}
          className="w-56 font-mono"
        />
        <Select value={newType} onValueChange={(type) => type && setNewType(type)} items={TYPE_ITEMS}>
          <SelectTrigger className="font-mono" aria-label={t('schema.newFieldType')}>
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
        <Button type="submit" variant="outline" disabled={!newName.trim() || nameTaken}>
          <PlusIcon />
          {t('schema.addField')}
        </Button>
      </form>
    </div>
  )
}
