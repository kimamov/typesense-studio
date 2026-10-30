// Fills the demo Typesense from docker-compose.yml with a `demo_books` collection for manual testing.
// Deterministic, so every run produces the same documents. Only `demo_books` is replaced.
//
//   node scripts/seed-demo.ts            (TYPESENSE_URL / TYPESENSE_API_KEY override the defaults)

const url = process.env.TYPESENSE_URL ?? 'http://localhost:8108'
const apiKey = process.env.TYPESENSE_API_KEY ?? 'demo-key'
const COLLECTION = 'demo_books'
const COUNT = 3000

const schema = {
  name: COLLECTION,
  default_sorting_field: 'rating',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'author', type: 'string', facet: true },
    { name: 'genres', type: 'string[]', facet: true },
    { name: 'year', type: 'int32', facet: true },
    { name: 'rating', type: 'float', facet: true },
    { name: 'pages', type: 'int32' },
    { name: 'in_stock', type: 'bool', facet: true },
  ],
}

const FIRST = ['Ada', 'Bruno', 'Clara', 'Daniel', 'Elif', 'Felix', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Kira', 'Lars', 'Mira', 'Noah', 'Olga', 'Paul', 'Rosa', 'Sami', 'Tara', 'Uwe']
const LAST = ['Adler', 'Berger', 'Conrad', 'Dietz', 'Ebert', 'Fuchs', 'Graf', 'Hahn', 'Jung', 'Keller', 'Lang', 'Moser', 'Nowak', 'Otto', 'Peters']
const GENRES = ['Fantasy', 'Science Fiction', 'Mystery', 'Romance', 'History', 'Biography', 'Poetry', 'Travel']
const WORDS = ['silent', 'river', 'empire', 'glass', 'winter', 'garden', 'shadow', 'harbor', 'clock', 'forest', 'letter', 'storm', 'mirror', 'island', 'journey', 'secret', 'light', 'stone', 'city', 'dream']

// Small seeded PRNG (mulberry32), so the data is the same on every run.
let seed = 42
function random(): number {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]
const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1)

// 20 × 15 = 300 possible authors: a facet with too many values for a checkbox list.
const documents = Array.from({ length: COUNT }, (_, i) => ({
  id: String(i + 1),
  title: `The ${capitalize(pick(WORDS))} of the ${capitalize(pick(WORDS))}`,
  description: `A story about ${pick(WORDS)}, ${pick(WORDS)} and a ${pick(WORDS)} ${pick(WORDS)}.`,
  author: `${pick(FIRST)} ${pick(LAST)}`,
  genres: [...new Set([pick(GENRES), pick(GENRES)])].slice(0, 1 + Math.floor(random() * 2)),
  year: 1950 + Math.floor(random() * 76),
  rating: Math.round((1 + random() * 4) * 10) / 10,
  pages: 80 + Math.floor(random() * 800),
  in_stock: random() > 0.3,
}))

async function request(method: string, path: string, body?: string, contentType = 'application/json') {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { 'X-TYPESENSE-API-KEY': apiKey, 'Content-Type': contentType },
    body,
  })
  const text = await response.text()
  if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${text}`)
  }
  return text
}

await request('DELETE', `/collections/${COLLECTION}`)
await request('POST', '/collections', JSON.stringify(schema))
const result = await request(
  'POST',
  `/collections/${COLLECTION}/documents/import?action=create`,
  documents.map((doc) => JSON.stringify(doc)).join('\n'),
  'text/plain',
)
const failed = result.split('\n').filter((line) => !line.includes('"success":true'))
if (failed.length > 0) throw new Error(`${failed.length} documents failed to import, e.g. ${failed[0]}`)
console.log(`Seeded ${COUNT} documents into ${COLLECTION} at ${url}`)
