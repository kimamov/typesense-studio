// The tests type-check this module with Node's module rules, which need the `.ts` extension.
import type { CollectionSchema } from './types.ts'

export type TypesenseDocument = Record<string, unknown>

export const DOCUMENT_ACTIONS = ['create', 'upsert', 'update'] as const
export type DocumentAction = (typeof DOCUMENT_ACTIONS)[number]

/** One line of the answer of `POST /documents/import` with `return_id=true`. */
export interface ImportResult {
  success: boolean
  id?: string
  code?: number
  error?: string
}

export type ReadOnlyReason = 'id' | 'embed' | 'type' | 'nested' | 'notInSchema' | 'unsafeInteger'

export type FormRow =
  | { name: string; type: string; required: boolean; kind: 'text' | 'number' | 'bool' }
  | { name: string; type: string; required: boolean; kind: 'list'; numeric: boolean }
  | { name: string; type: string; required: boolean; kind: 'readonly'; reason: ReadOnlyReason }

const INPUTS: Record<string, { kind: 'text' | 'number' | 'bool' } | { kind: 'list'; numeric: boolean }> = {
  string: { kind: 'text' },
  int32: { kind: 'number' },
  int64: { kind: 'number' },
  float: { kind: 'number' },
  bool: { kind: 'bool' },
  'string[]': { kind: 'list', numeric: false },
  'int32[]': { kind: 'list', numeric: true },
  'int64[]': { kind: 'list', numeric: true },
  'float[]': { kind: 'list', numeric: true },
}

const isWildcard = (name: string) => /[*^$\\]/.test(name)

/**
 * The rows of the form: `id`, the schema's fields in schema order, then the document's keys outside the
 * schema. Wildcard schema fields have no value of their own; the keys they match show up as keys outside
 * the schema. Rows the form cannot edit are read-only, and stay editable in JSON.
 */
export function formFields(schema: CollectionSchema, document: TypesenseDocument, editing: boolean): FormRow[] {
  const rows: FormRow[] = [
    editing
      ? { name: 'id', type: 'string', required: true, kind: 'readonly', reason: 'id' }
      : { name: 'id', type: 'string', required: false, kind: 'text' },
  ]
  for (const field of schema.fields) {
    if (field.name === 'id' || isWildcard(field.name)) continue
    const base = { name: field.name, type: field.type, required: !field.optional }
    const value = document[field.name]
    const input = INPUTS[field.type]
    if (field.name.includes('.')) rows.push({ ...base, kind: 'readonly', reason: 'nested' })
    else if (field.embed) rows.push({ ...base, kind: 'readonly', reason: 'embed' })
    else if (!input) rows.push({ ...base, kind: 'readonly', reason: 'type' })
    // JSON.parse already rounded such a value; the form must not offer to save the rounded one.
    else if (field.type === 'int64' && typeof value === 'number' && !Number.isSafeInteger(value))
      rows.push({ ...base, kind: 'readonly', reason: 'unsafeInteger' })
    else rows.push({ ...base, ...input })
  }
  const named = new Set(rows.map((row) => row.name))
  for (const [name, value] of Object.entries(document)) {
    if (!named.has(name)) rows.push({ name, type: typeof value, required: false, kind: 'readonly', reason: 'notInSchema' })
  }
  return rows
}

/** A new document: required booleans start as false, since a switch cannot show "not set". */
export function emptyDocument(schema: CollectionSchema): TypesenseDocument {
  return Object.fromEntries(
    schema.fields.filter((f) => f.type === 'bool' && !f.optional && !isWildcard(f.name)).map((f) => [f.name, false]),
  )
}

/** The `update` for the changes from `base` to `draft`: changed keys, removed keys as `null`, and `id`. */
export function documentChanges(base: TypesenseDocument, draft: TypesenseDocument): TypesenseDocument | null {
  const changes: TypesenseDocument = {}
  for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
    if (key === 'id') continue
    if (!(key in draft)) changes[key] = null
    else if (JSON.stringify(draft[key]) !== JSON.stringify(base[key])) changes[key] = draft[key]
  }
  return Object.keys(changes).length > 0 ? { id: base.id, ...changes } : null
}

export type DocumentsParseError = { kind: 'syntax'; message: string } | { kind: 'shape' }

/** The JSON view's text: one document or an array of documents. Ids are checked by the server. */
export function parseDocumentsJson(text: string): { documents: TypesenseDocument[]; single: boolean } | { error: DocumentsParseError } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { error: { kind: 'syntax', message: e instanceof Error ? e.message : String(e) } }
  }
  const isDocument = (value: unknown): value is TypesenseDocument => !!value && typeof value === 'object' && !Array.isArray(value)
  if (isDocument(parsed)) return { documents: [parsed], single: true }
  if (Array.isArray(parsed) && parsed.every(isDocument)) return { documents: parsed, single: false }
  return { error: { kind: 'shape' } }
}
