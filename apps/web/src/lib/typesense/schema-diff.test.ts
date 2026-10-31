import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { diffSchema, parseDraftJson, readOnlyReason, toDraft, type SchemaDraft } from './schema-diff.ts'
import type { CollectionField, CollectionSchema } from './types.ts'

const SERVER_DEFAULTS = {
  facet: false,
  index: true,
  infix: false,
  locale: '',
  optional: false,
  stem: false,
  stem_dictionary: '',
  store: true,
  truncate_len: 100,
}

/** `demo_books` as `GET /collections/demo_books` returns it from Typesense 30. */
const DEMO_BOOKS: CollectionSchema = {
  name: 'demo_books',
  num_documents: 3000,
  created_at: 1793350366,
  default_sorting_field: 'rating',
  enable_nested_fields: false,
  token_separators: [],
  synonym_sets: [],
  curation_sets: [],
  fields: [
    { ...SERVER_DEFAULTS, name: 'title', type: 'string', sort: false },
    { ...SERVER_DEFAULTS, name: 'description', type: 'string', sort: false },
    { ...SERVER_DEFAULTS, name: 'author', type: 'string', sort: false, facet: true },
    { ...SERVER_DEFAULTS, name: 'genres', type: 'string[]', sort: false, facet: true },
    { ...SERVER_DEFAULTS, name: 'year', type: 'int32', sort: true, facet: true },
    { ...SERVER_DEFAULTS, name: 'rating', type: 'float', sort: true, facet: true },
    { ...SERVER_DEFAULTS, name: 'pages', type: 'int32', sort: true },
    { ...SERVER_DEFAULTS, name: 'in_stock', type: 'bool', sort: true, facet: true },
  ],
}

const base = toDraft(DEMO_BOOKS)
const withFields = (fields: CollectionField[]): SchemaDraft => ({ ...base, fields })
const field = (name: string) => base.fields.find((f) => f.name === name)!

describe('diffSchema', () => {
  test('an unchanged server schema has no changes', () => {
    assert.deepEqual(diffSchema(base, toDraft(structuredClone(DEMO_BOOKS))), { body: {}, changes: [], errors: [] })
  })

  test('short definitions, reordered keys and reordered fields count as unchanged', () => {
    const written = base.fields
      .map(({ name, type, facet }) => (facet ? { facet, type, name } : { name, type }))
      .reverse()
    assert.deepEqual(diffSchema(base, withFields(written)).changes, [])
  })

  test('a new field is added as written', () => {
    const publisher = { name: 'publisher', type: 'string', optional: true }
    const diff = diffSchema(base, withFields([...base.fields, publisher]))
    assert.deepEqual(diff.changes, [{ kind: 'add', name: 'publisher' }])
    assert.deepEqual(diff.body, { fields: [publisher] })
  })

  test('a missing field is dropped', () => {
    const diff = diffSchema(base, withFields(base.fields.filter((f) => f.name !== 'rating')))
    assert.deepEqual(diff.changes, [{ kind: 'drop', name: 'rating' }])
    assert.deepEqual(diff.body, { fields: [{ name: 'rating', drop: true }] })
  })

  test('a changed flag drops the field and adds it back with its other settings', () => {
    const german = withFields(base.fields.map((f) => (f.name === 'title' ? { ...f, locale: 'de' } : f)))
    const sorted = { ...field('title'), locale: 'de', sort: true }
    const diff = diffSchema(german, withFields(german.fields.map((f) => (f.name === 'title' ? sorted : f))))
    assert.deepEqual(diff.changes, [{ kind: 'change', name: 'title', keys: ['sort'] }])
    assert.deepEqual(diff.body, { fields: [{ name: 'title', drop: true }, sorted] })
  })

  test('a type change names the type', () => {
    const diff = diffSchema(base, withFields(base.fields.map((f) => (f.name === 'year' ? { ...f, type: 'string', sort: false } : f))))
    assert.deepEqual(diff.changes, [{ kind: 'change', name: 'year', keys: ['sort', 'type'] }])
  })

  test('changed metadata is sent without field entries', () => {
    assert.deepEqual(diffSchema(base, { ...base, metadata: { owner: 'search' } }).body, { metadata: { owner: 'search' } })
  })

  test('leaving out synonym_sets keeps them', () => {
    assert.deepEqual(diffSchema(base, { fields: base.fields }).body, {})
  })

  test('duplicate and empty names are errors', () => {
    const diff = diffSchema(base, withFields([...base.fields, { name: 'title', type: 'string' }, { name: ' ', type: 'string' }]))
    assert.deepEqual(diff.errors, [{ kind: 'duplicateName', name: 'title' }, { kind: 'emptyName' }])
  })
})

describe('parseDraftJson', () => {
  test('reads a valid draft', () => {
    assert.deepEqual(parseDraftJson(JSON.stringify(base)), { draft: base })
  })

  test('rejects invalid input', () => {
    assert.equal((parseDraftJson('{') as { error: { kind: string } }).error.kind, 'syntax')
    assert.deepEqual(parseDraftJson('[]'), { error: { kind: 'notObject' } })
    assert.deepEqual(parseDraftJson('{}'), { error: { kind: 'fieldsNotArray' } })
    assert.deepEqual(parseDraftJson('{"fields": [], "name": "x"}'), { error: { kind: 'fixedKey', key: 'name' } })
    assert.deepEqual(parseDraftJson('{"fields": [{"name": "a", "type": "string"}, {"name": 1}]}'), {
      error: { kind: 'fieldInvalid', index: 1 },
    })
  })
})

describe('readOnlyReason', () => {
  test('flags fields the table cannot edit', () => {
    assert.equal(readOnlyReason({ name: 'title', type: 'string' }), null)
    assert.equal(readOnlyReason({ name: '.*', type: 'auto' }), 'wildcard')
    assert.equal(readOnlyReason({ name: 'vec', type: 'float[]', embed: { from: ['title'] } }), 'embed')
    assert.equal(readOnlyReason({ name: 'author_id', type: 'string', reference: 'authors.id' }), 'reference')
    assert.equal(readOnlyReason({ name: 'shape', type: 'geopolygon' }), 'unknownType')
  })
})
