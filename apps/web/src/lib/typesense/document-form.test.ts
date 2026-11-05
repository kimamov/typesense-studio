import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { documentChanges, emptyDocument, formFields, parseDocumentsJson } from './document-form.ts'
import type { CollectionSchema } from './types.ts'

const SCHEMA: CollectionSchema = {
  name: 'books',
  num_documents: 1,
  created_at: 0,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'pages', type: 'int32', optional: true },
    { name: 'views', type: 'int64', optional: true },
    { name: 'in_stock', type: 'bool' },
    { name: 'genres', type: 'string[]' },
    { name: 'scores', type: 'float[]', optional: true },
    { name: 'location', type: 'geopoint', optional: true },
    { name: 'author.name', type: 'string', optional: true },
    { name: 'embedding', type: 'float[]', embed: { from: ['title'] }, optional: true },
    { name: 'tag_.*', type: 'string', optional: true },
  ],
}

const kinds = (rows: ReturnType<typeof formFields>) =>
  Object.fromEntries(rows.map((row) => [row.name, row.kind === 'readonly' ? `readonly:${row.reason}` : row.kind]))

describe('formFields', () => {
  test('maps types to inputs and makes the rest read-only', () => {
    assert.deepEqual(kinds(formFields(SCHEMA, { tag_x: 'a', publisher: 'p' }, false)), {
      id: 'text',
      title: 'text',
      pages: 'number',
      views: 'number',
      in_stock: 'bool',
      genres: 'list',
      scores: 'list',
      location: 'readonly:type',
      'author.name': 'readonly:nested',
      embedding: 'readonly:embed',
      // Keys matched by a wildcard field or not in the schema at all.
      tag_x: 'readonly:notInSchema',
      publisher: 'readonly:notInSchema',
    })
  })

  test('locks the id of a saved document and int64 values beyond safe integers', () => {
    const rows = formFields(SCHEMA, { id: '1', views: 2 ** 60 }, true)
    assert.equal(kinds(rows).id, 'readonly:id')
    assert.equal(kinds(rows).views, 'readonly:unsafeInteger')
  })

  test('marks required fields and numeric lists', () => {
    const rows = formFields(SCHEMA, {}, false)
    assert.equal(rows.find((r) => r.name === 'title')?.required, true)
    assert.equal(rows.find((r) => r.name === 'pages')?.required, false)
    assert.deepEqual(rows.find((r) => r.name === 'scores'), { name: 'scores', type: 'float[]', required: false, kind: 'list', numeric: true })
  })
})

test('emptyDocument presets required booleans only', () => {
  assert.deepEqual(emptyDocument(SCHEMA), { in_stock: false })
})

describe('documentChanges', () => {
  const base = { id: '1', title: 'A', genres: ['x'], publisher: 'p' }

  test('sends changed keys, removed keys as null, and the id', () => {
    assert.deepEqual(documentChanges(base, { id: '1', title: 'B', genres: ['x', 'y'], pages: 3 }), {
      id: '1',
      title: 'B',
      genres: ['x', 'y'],
      publisher: null,
      pages: 3,
    })
  })

  test('is null without changes', () => {
    assert.equal(documentChanges(base, { ...base, genres: ['x'] }), null)
  })
})

describe('parseDocumentsJson', () => {
  test('accepts one document or an array of documents', () => {
    assert.deepEqual(parseDocumentsJson('{"id": "1"}'), { documents: [{ id: '1' }], single: true })
    assert.deepEqual(parseDocumentsJson('[{"id": "1"}, {"a": 2}]'), { documents: [{ id: '1' }, { a: 2 }], single: false })
  })

  test('rejects other shapes and invalid JSON', () => {
    assert.deepEqual(parseDocumentsJson('[1]'), { error: { kind: 'shape' } })
    assert.deepEqual(parseDocumentsJson('"x"'), { error: { kind: 'shape' } })
    const invalid = parseDocumentsJson('{')
    assert.equal('error' in invalid && invalid.error.kind, 'syntax')
  })
})
