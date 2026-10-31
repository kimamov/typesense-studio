// The tests type-check this module with Node's module rules, which need the `.ts` extension.
import type { CollectionField, CollectionSchema, SchemaUpdate } from './types.ts'

/** Field types the schema table offers. Other types are shown read-only. */
export const FIELD_TYPES = [
  'string',
  'string[]',
  'int32',
  'int32[]',
  'int64',
  'int64[]',
  'float',
  'float[]',
  'bool',
  'bool[]',
  'geopoint',
  'geopoint[]',
  'object',
  'object[]',
  'auto',
  'string*',
] as const

export const EDITABLE_FLAGS = ['optional', 'facet', 'index', 'sort', 'infix', 'stem'] as const
export type EditableFlag = (typeof EDITABLE_FLAGS)[number]

/** The part of a schema that `PATCH /collections/:name` can change. */
export interface SchemaDraft {
  fields: CollectionField[]
  metadata?: Record<string, unknown>
  synonym_sets?: string[]
}

export type SchemaChange =
  | { kind: 'add' | 'drop'; name: string }
  | { kind: 'change'; name: string; keys: string[] }

export type SchemaDiffError = { kind: 'emptyName' } | { kind: 'duplicateName'; name: string }

export interface SchemaDiff {
  body: SchemaUpdate
  changes: SchemaChange[]
  errors: SchemaDiffError[]
}

export type DraftParseError =
  | { kind: 'syntax'; message: string }
  | { kind: 'notObject' }
  | { kind: 'fixedKey'; key: string }
  | { kind: 'fieldsNotArray' }
  | { kind: 'fieldInvalid'; index: number }

export type ReadOnlyReason = 'wildcard' | 'embed' | 'reference' | 'unknownType'

const PATCHABLE_KEYS = ['fields', 'metadata', 'synonym_sets']

export function toDraft(schema: CollectionSchema): SchemaDraft {
  return {
    fields: schema.fields,
    ...(schema.metadata && { metadata: schema.metadata }),
    ...(schema.synonym_sets && { synonym_sets: schema.synonym_sets }),
  }
}

/** Scalar numbers, booleans and geopoints are sortable unless turned off. */
const SORTED_BY_DEFAULT = /^(int32|int64|float|bool|geopoint)$/

/**
 * Fills in the values Typesense 30 returns for keys a field definition leaves out, so a field written
 * by hand compares equal to the same field as the server returns it. Taken from GET responses of the
 * local Typesense 30.
 */
export function normalizeField(field: CollectionField): CollectionField {
  return {
    facet: false,
    index: true,
    infix: false,
    locale: '',
    optional: field.type === 'auto',
    sort: SORTED_BY_DEFAULT.test(field.type),
    stem: false,
    stem_dictionary: '',
    store: true,
    truncate_len: 100,
    ...field,
  }
}

/** JSON with object keys sorted, so key order does not count as a difference. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

function changedKeys(base: CollectionField, draft: CollectionField): string[] {
  const a = normalizeField(base)
  const b = normalizeField(draft)
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => canonical(a[key]) !== canonical(b[key]))
}

/**
 * The smallest PATCH body that turns `base` into `draft`: new fields are added, missing fields dropped,
 * and changed fields dropped and added again in the same request. A changed field is sent as the draft
 * has it, so keys the table does not show (locale, stem_dictionary, …) keep their values.
 */
export function diffSchema(base: SchemaDraft, draft: SchemaDraft): SchemaDiff {
  const errors: SchemaDiffError[] = []
  const seen = new Set<string>()
  for (const { name } of draft.fields) {
    if (!name.trim()) errors.push({ kind: 'emptyName' })
    else if (seen.has(name)) errors.push({ kind: 'duplicateName', name })
    seen.add(name)
  }

  const baseByName = new Map(base.fields.map((field) => [field.name, field]))
  const draftNames = new Set(draft.fields.map((field) => field.name))
  const changes: SchemaChange[] = []
  const fields: NonNullable<SchemaUpdate['fields']> = []

  for (const field of base.fields) {
    if (draftNames.has(field.name)) continue
    changes.push({ kind: 'drop', name: field.name })
    fields.push({ name: field.name, drop: true })
  }
  for (const field of draft.fields) {
    const old = baseByName.get(field.name)
    if (!old) {
      changes.push({ kind: 'add', name: field.name })
      fields.push(field)
      continue
    }
    const keys = changedKeys(old, field)
    if (keys.length === 0) continue
    changes.push({ kind: 'change', name: field.name, keys })
    fields.push({ name: field.name, drop: true }, field)
  }

  const body: SchemaUpdate = { ...(fields.length > 0 && { fields }) }
  // A key left out of the draft counts as unchanged; only a different value is sent.
  if (draft.metadata !== undefined && canonical(draft.metadata) !== canonical(base.metadata)) body.metadata = draft.metadata
  if (draft.synonym_sets !== undefined && canonical(draft.synonym_sets) !== canonical(base.synonym_sets)) {
    body.synonym_sets = draft.synonym_sets
  }
  return { body, changes, errors }
}

/** Reads the JSON editor's text. Keys the server cannot change are rejected here, by name. */
export function parseDraftJson(text: string): { draft: SchemaDraft } | { error: DraftParseError } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    return { error: { kind: 'syntax', message: e instanceof Error ? e.message : String(e) } }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: { kind: 'notObject' } }
  const fixed = Object.keys(value).find((key) => !PATCHABLE_KEYS.includes(key))
  if (fixed) return { error: { kind: 'fixedKey', key: fixed } }
  const { fields } = value as Record<string, unknown>
  if (!Array.isArray(fields)) return { error: { kind: 'fieldsNotArray' } }
  const invalid = fields.findIndex(
    (field) => !field || typeof field !== 'object' || Array.isArray(field) || typeof field.name !== 'string' || typeof field.type !== 'string',
  )
  if (invalid !== -1) return { error: { kind: 'fieldInvalid', index: invalid } }
  return { draft: value as SchemaDraft }
}

/** Why the table cannot edit a field safely, or `null` when it can. */
export function readOnlyReason(field: CollectionField): ReadOnlyReason | null {
  if (/[*^$\\]/.test(field.name)) return 'wildcard'
  if (field.embed) return 'embed'
  if (field.reference) return 'reference'
  if (!(FIELD_TYPES as readonly string[]).includes(field.type)) return 'unknownType'
  return null
}
