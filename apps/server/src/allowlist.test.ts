import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAllowed, parseAllowlist } from './allowlist.ts'

const allowed = (list: string, url: string) => isAllowed(parseAllowlist(list), new URL(url))

test('empty allowlist rejects everything', () => {
  assert.equal(allowed('', 'http://localhost:8108'), false)
})

test('exact origin uses default ports', () => {
  assert.equal(allowed('https://search.example.com', 'https://search.example.com/health'), true)
  assert.equal(allowed('https://search.example.com', 'https://search.example.com:443/'), true)
  assert.equal(allowed('https://search.example.com', 'https://search.example.com:8108/'), false)
  assert.equal(allowed('https://search.example.com', 'http://search.example.com/'), false)
})

test('port wildcard', () => {
  assert.equal(allowed('http://localhost:*', 'http://localhost:8108'), true)
  assert.equal(allowed('http://localhost:*', 'http://localhost.evil.com:8108'), false)
})

test('subdomain wildcard does not match the apex or lookalikes', () => {
  assert.equal(allowed('https://*.example.com', 'https://a.b.example.com'), true)
  assert.equal(allowed('https://*.example.com', 'https://example.com'), false)
  assert.equal(allowed('https://*.example.com', 'https://evilexample.com'), false)
})

test('star allows any http(s) target but no other schemes', () => {
  assert.equal(allowed('*', 'http://10.0.0.1:8108'), true)
  assert.equal(allowed('*', 'file:///etc/passwd'), false)
})

test('invalid entries fail loudly', () => {
  assert.throws(() => parseAllowlist('localhost:8108'))
})
