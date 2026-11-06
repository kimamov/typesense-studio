// The tests type-check this module with Node's module rules, which need the `.ts` extension.
import { fieldNameErrors, invalidFieldIndex, normalizeField, type SchemaDiffError } from './schema-diff.ts'
import type { CollectionField } from './types.ts'

/** The body of `POST /collections` as the dialog edits it. Keys the form does not show are kept as they are. */
export interface CreateDraft {
  name: string
  fields: CollectionField[]
  default_sorting_field?: string
  enable_nested_fields?: boolean
  [key: string]: unknown
}

export type CreateError =
  | SchemaDiffError
  | { kind: 'emptyCollectionName' }
  | { kind: 'collectionExists'; name: string }
  | { kind: 'noFields' }
  | { kind: 'invalidSortingField'; name: string }

export type CreateParseError =
  | { kind: 'syntax'; message: string }
  | { kind: 'notObject' }
  | { kind: 'fieldsNotArray' }
  | { kind: 'fieldInvalid'; index: number }

export const emptyCreateDraft = (): CreateDraft => ({ name: '', fields: [{ name: '', type: 'string' }] })

const SORTABLE_TYPES = /^(int32|int64|float|bool|string)$/

/** Fields Typesense accepts as `default_sorting_field`: named, required, sortable scalars. */
export function sortingFieldCandidates(fields: CollectionField[]): string[] {
  return fields
    .filter((field) => field.name.trim() && !field.optional && SORTABLE_TYPES.test(field.type) && normalizeField(field).sort === true)
    .map((field) => field.name)
}

/** Mistakes the server would reject, found before the request is sent. */
export function createErrors(draft: CreateDraft, existingNames: string[]): CreateError[] {
  const errors: CreateError[] = []
  const name = draft.name.trim()
  if (!name) errors.push({ kind: 'emptyCollectionName' })
  else if (existingNames.includes(name)) errors.push({ kind: 'collectionExists', name })
  if (draft.fields.length === 0) errors.push({ kind: 'noFields' })
  errors.push(...fieldNameErrors(draft.fields))
  const sorting = draft.default_sorting_field
  if (sorting && !sortingFieldCandidates(draft.fields).includes(sorting)) errors.push({ kind: 'invalidSortingField', name: sorting })
  return errors
}

export const hasObjectFields = (draft: CreateDraft) => draft.fields.some((field) => field.type.startsWith('object'))

/** The request body: the name trimmed, an empty sorting field left out, nested fields enabled when an object field needs them. */
export function toCreateBody(draft: CreateDraft): CreateDraft {
  const { default_sorting_field, ...rest } = draft
  return {
    ...rest,
    name: draft.name.trim(),
    ...(default_sorting_field && { default_sorting_field }),
    // Typesense rejects object fields without it; an explicit value from the JSON view is kept.
    ...(draft.enable_nested_fields === undefined && hasObjectFields(draft) && { enable_nested_fields: true }),
  }
}

/** Reads the JSON view's text. Anything beyond the shape the form needs is left for the server to judge. */
export function parseCreateJson(text: string): { draft: CreateDraft } | { error: CreateParseError } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    return { error: { kind: 'syntax', message: e instanceof Error ? e.message : String(e) } }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: { kind: 'notObject' } }
  const object = value as Record<string, unknown>
  if (!Array.isArray(object.fields)) return { error: { kind: 'fieldsNotArray' } }
  const invalid = invalidFieldIndex(object.fields)
  if (invalid !== -1) return { error: { kind: 'fieldInvalid', index: invalid } }
  return { draft: { ...object, name: typeof object.name === 'string' ? object.name : '', fields: object.fields as CollectionField[] } }
}
