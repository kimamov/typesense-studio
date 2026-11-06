import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HIGHLIGHT_END, HIGHLIGHT_START, hitsToJsonl, responseToJson, type SearchResponse } from './search.ts'

const response: SearchResponse = {
  found: 2,
  out_of: 10,
  page: 1,
  search_time_ms: 1,
  hits: [
    { document: { id: '1', title: 'Dune' }, highlight: { title: { snippet: `${HIGHLIGHT_START}Dune${HIGHLIGHT_END}` } } },
    { document: { id: '2', title: 'a\nb' } },
  ],
}

test('hitsToJsonl writes one document per line', () => {
  assert.equal(hitsToJsonl(response), '{"id":"1","title":"Dune"}\n{"id":"2","title":"a\\nb"}\n')
  assert.equal(hitsToJsonl({ ...response, hits: undefined }), '')
})

test('responseToJson replaces the highlight markers with mark tags', () => {
  const json = responseToJson(response)
  assert.equal(JSON.parse(json).hits[0].highlight.title.snippet, '<mark>Dune</mark>')
  assert.ok(!json.includes('\\u0001'))
})
