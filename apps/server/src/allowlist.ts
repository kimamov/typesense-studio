/**
 * Allowlist for proxy targets, configured as a comma-separated list of origin patterns:
 *
 *   https://search.example.com          exact origin (default port)
 *   https://*.example.com               any subdomain of example.com
 *   http://localhost:*                  any port on localhost
 *   *                                   anything (only for trusted, private deployments)
 */
export interface OriginPattern {
  protocol: 'http:' | 'https:'
  host: string
  wildcardSubdomain: boolean
  port: string | '*'
}

export type Allowlist = { kind: 'all' } | { kind: 'patterns'; patterns: OriginPattern[] }

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' }

export function parseAllowlist(value: string | undefined): Allowlist {
  const entries = (value ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  if (entries.includes('*')) return { kind: 'all' }
  return { kind: 'patterns', patterns: entries.map(parsePattern) }
}

function parsePattern(entry: string): OriginPattern {
  const match = /^(https?):\/\/(\*\.)?([^/:]+)(?::(\d+|\*))?\/?$/i.exec(entry)
  if (!match) throw new Error(`Invalid PROXY_ALLOWED_TARGETS entry: "${entry}"`)
  const [, scheme, wildcard, host, port] = match
  const protocol = `${scheme.toLowerCase()}:` as OriginPattern['protocol']
  return {
    protocol,
    host: host.toLowerCase(),
    wildcardSubdomain: !!wildcard,
    port: port ?? DEFAULT_PORTS[protocol],
  }
}

export function isAllowed(allowlist: Allowlist, target: URL): boolean {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return false
  if (allowlist.kind === 'all') return true
  const host = target.hostname.toLowerCase()
  const port = target.port || DEFAULT_PORTS[target.protocol]
  return allowlist.patterns.some(
    (p) =>
      p.protocol === target.protocol &&
      (p.port === '*' || p.port === port) &&
      (p.wildcardSubdomain ? host.endsWith(`.${p.host}`) : host === p.host),
  )
}
