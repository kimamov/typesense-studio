import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createErrors, parseCreateJson, sortingFieldCandidates, toCreateBody } from './collection-create.ts'

describe('sortingFieldCandidates', () => {
  test('keeps named, required, sortable scalars', () => {
    const fields = [
      { name: 'rating', type: 'float' },
      { name: 'count', type: 'int64' },
      { name: 'active', type: 'bool' },
      { name: 'title', type: 'string', sort: true },
      { name: 'author', type: 'string' },
      { name: 'pages', type: 'int32', optional: true },
      { name: 'tags', type: 'int32[]' },
      { name: 'sorted_off', type: 'int32', sort: false },
      { name: '', type: 'int32' },
      { name: 'location', type: 'geopoint' },
    ]
    assert.deepEqual(sortingFieldCandidates(fields), ['rating', 'count', 'active', 'title'])
  })
})

describe('createErrors', () => {
  test('a valid draft has none', () => {
    assert.deepEqual(createErrors({ name: 'books', fields: [{ name: 'title', type: 'string' }] }, ['movies']), [])
  })

  test('finds empty and existing names, missing fields and duplicates', () => {
    assert.deepEqual(createErrors({ name: ' ', fields: [] }, []), [{ kind: 'emptyCollectionName' }, { kind: 'noFields' }])
    assert.deepEqual(
      createErrors(
        {
          name: 'books ',
          fields: [
            { name: 'a', type: 'string' },
            { name: 'a', type: 'string' },
          ],
        },
        ['books'],
      ),
      [{ kind: 'collectionExists', name: 'books' }, { kind: 'duplicateName', name: 'a' }],
    )
  })

  test('rejects a sorting field the server would not accept', () => {
    const draft = { name: 'b', fields: [{ name: 'pages', type: 'int32', optional: true }], default_sorting_field: 'pages' }
    assert.deepEqual(createErrors(draft, []), [{ kind: 'invalidSortingField', name: 'pages' }])
  })
})

describe('toCreateBody', () => {
  test('trims the name and drops an empty sorting field', () => {
    assert.deepEqual(toCreateBody({ name: ' books ', fields: [{ name: 'a', type: 'string' }], default_sorting_field: '' }), {
      name: 'books',
      fields: [{ name: 'a', type: 'string' }],
    })
  })

  test('enables nested fields for object fields unless set explicitly', () => {
    const fields = [{ name: 'o', type: 'object' }]
    assert.equal(toCreateBody({ name: 'b', fields }).enable_nested_fields, true)
    assert.equal(toCreateBody({ name: 'b', fields, enable_nested_fields: false }).enable_nested_fields, false)
    assert.equal(toCreateBody({ name: 'b', fields: [{ name: 's', type: 'string' }] }).enable_nested_fields, undefined)
  })

  test('keeps keys the form does not show', () => {
    assert.deepEqual(toCreateBody({ name: 'b', fields: [], token_separators: ['-'] }).token_separators, ['-'])
  })
})

describe('parseCreateJson', () => {
  test('reads a body and defaults a missing name', () => {
    assert.deepEqual(parseCreateJson('{"fields":[{"name":"a","type":"string"}],"symbols_to_index":["+"]}'), {
      draft: { name: '', fields: [{ name: 'a', type: 'string' }], symbols_to_index: ['+'] },
    })
  })

  test('reports what is wrong', () => {
    const syntax = parseCreateJson('{')
    assert.equal('error' in syntax && syntax.error.kind, 'syntax')
    assert.deepEqual(parseCreateJson('[]'), { error: { kind: 'notObject' } })
    assert.deepEqual(parseCreateJson('{"name":"b"}'), { error: { kind: 'fieldsNotArray' } })
    assert.deepEqual(parseCreateJson('{"fields":[{"name":"a"}]}'), { error: { kind: 'fieldInvalid', index: 0 } })
  })
})
