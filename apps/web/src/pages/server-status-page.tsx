import { useQuery } from '@tanstack/react-query'
import { CpuIcon, HardDriveIcon, MemoryStickIcon, NetworkIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { QueryError } from '@/components/query-error'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { formatBytes, formatNumber, percent } from '@/lib/format'
import { api } from '@/lib/typesense/api'

const REFRESH_SECONDS = 5

export function ServerStatusPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage
  const { connection, client } = useActiveConnection()
  const refetchInterval = REFRESH_SECONDS * 1000

  const debug = useQuery({ queryKey: [connection.id, 'debug'], queryFn: ({ signal }) => api.debug(client, signal) })
  const health = useQuery({
    queryKey: [connection.id, 'health'],
    queryFn: ({ signal }) => api.health(client, signal),
    refetchInterval,
  })
  const metrics = useQuery({
    queryKey: [connection.id, 'metrics'],
    queryFn: ({ signal }) => api.metrics(client, signal),
    refetchInterval,
  })
  const stats = useQuery({
    queryKey: [connection.id, 'stats'],
    queryFn: ({ signal }) => api.stats(client, signal),
    refetchInterval,
  })

  const firstError = debug.error ?? metrics.error ?? stats.error
  if (firstError) {
    return (
      <QueryError
        error={firstError}
        onRetry={() => {
          void debug.refetch()
          void metrics.refetch()
          void stats.refetch()
        }}
      />
    )
  }

  const m = metrics.data
  const cores = m
    ? Object.keys(m)
        .map((key) => /^system_cpu(\d+)_active_percentage$/.exec(key)?.[1])
        .filter((n): n is string => !!n)
        .map(Number)
        .sort((a, b) => a - b)
    : []

  const s = stats.data
  const endpoints = Object.keys({ ...s?.requests_per_second, ...s?.latency_ms }).sort()

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('status.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('status.autoRefresh', { seconds: REFRESH_SECONDS })}</p>
        </div>
        <div className="flex items-center gap-2">
          {debug.data && <Badge variant="outline">{`${t('status.version')} ${debug.data.version}`}</Badge>}
          {health.data &&
            (health.data.ok ? (
              <Badge className="bg-emerald-600 text-white dark:bg-emerald-500">{t('status.healthy')}</Badge>
            ) : (
              <Badge variant="destructive">{health.data.resource_error ?? t('status.unhealthy')}</Badge>
            ))}
          {health.isError && <Badge variant="destructive">{t('status.unhealthy')}</Badge>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<CpuIcon />} title={t('status.cpu')} loading={!m}>
          {m && (
            <>
              <BigValue value={`${formatNumber(m.system_cpu_active_percentage, lng)} %`} />
              <Progress value={Number(m.system_cpu_active_percentage)} />
            </>
          )}
        </MetricCard>
        <MetricCard icon={<MemoryStickIcon />} title={t('status.memory')} loading={!m}>
          {m && (
            <UsageBar used={m.system_memory_used_bytes} total={m.system_memory_total_bytes} lng={lng} />
          )}
        </MetricCard>
        <MetricCard icon={<HardDriveIcon />} title={t('status.disk')} loading={!m}>
          {m && <UsageBar used={m.system_disk_used_bytes} total={m.system_disk_total_bytes} lng={lng} />}
        </MetricCard>
        <MetricCard icon={<NetworkIcon />} title={t('status.network')} loading={!m}>
          {m && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">{t('status.received')}</dt>
              <dd className="text-right font-medium tabular-nums">{formatBytes(m.system_network_received_bytes, lng)}</dd>
              <dt className="text-muted-foreground">{t('status.sent')}</dt>
              <dd className="text-right font-medium tabular-nums">{formatBytes(m.system_network_sent_bytes, lng)}</dd>
            </dl>
          )}
        </MetricCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('status.typesenseMemory')}</CardTitle>
          </CardHeader>
          <CardContent>
            {m ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {(
                  [
                    ['allocated', m.typesense_memory_allocated_bytes],
                    ['active', m.typesense_memory_active_bytes],
                    ['resident', m.typesense_memory_resident_bytes],
                  ] as const
                ).map(([label, value]) => (
                  <Row key={label} label={t(`status.${label}`)} value={formatBytes(value, lng)} />
                ))}
                <Row
                  label={t('status.fragmentation')}
                  value={`${formatNumber(Number(m.typesense_memory_fragmentation_ratio) * 100, lng)} %`}
                />
              </dl>
            ) : (
              <Skeleton className="h-24" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('status.cpu')}</CardTitle>
            <CardDescription>{cores.length > 0 && t('status.cores', { count: cores.length })}</CardDescription>
          </CardHeader>
          <CardContent>
            {m ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                {cores.map((n) => {
                  const value = Number(m[`system_cpu${n}_active_percentage`])
                  return (
                    <div key={n} className="grid gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t('status.core', { n })}</span>
                        <span className="tabular-nums">{formatNumber(value, lng)} %</span>
                      </div>
                      <Progress value={value} className="h-1.5" />
                    </div>
                  )
                })}
              </div>
            ) : (
              <Skeleton className="h-24" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('status.requests')}</CardTitle>
          <CardDescription>{t('status.requestsPerSecond')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {s ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {(
                  [
                    ['totalRps', s.total_requests_per_second],
                    ['searchRps', s.search_requests_per_second],
                    ['writeRps', s.write_requests_per_second],
                    ['importRps', s.import_requests_per_second],
                    ['deleteRps', s.delete_requests_per_second],
                    ['pendingWrites', s.pending_write_batches],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">{t(`status.${label}`)}</div>
                    <div className="text-xl font-semibold tabular-nums">{formatNumber(value, lng)}</div>
                  </div>
                ))}
              </div>
              {endpoints.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('status.noRequests')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('status.endpoint')}</TableHead>
                      <TableHead className="text-right">{t('status.requestsPerSecond')}</TableHead>
                      <TableHead className="text-right">{t('status.latency')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endpoints.map((endpoint) => (
                      <TableRow key={endpoint}>
                        <TableCell className="font-mono text-xs">{endpoint}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(s.requests_per_second?.[endpoint], lng)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {`${formatNumber(s.latency_ms?.[endpoint], lng)} ms`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          ) : (
            <Skeleton className="h-24" />
          )}
        </CardContent>
      </Card>
    </>
  )
}

function MetricCard({ icon, title, loading, children }: { icon: ReactNode; title: string; loading: boolean; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 text-muted-foreground [&_svg]:size-4">
        {icon}
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">{loading ? <Skeleton className="h-12" /> : children}</CardContent>
    </Card>
  )
}

function BigValue({ value, hint }: { value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground tabular-nums">{hint}</span>}
    </div>
  )
}

function UsageBar({ used, total, lng }: { used?: string; total?: string; lng?: string }) {
  const ratio = percent(used, total)
  return (
    <>
      <BigValue value={`${formatNumber(ratio, lng)} %`} hint={`${formatBytes(used, lng)} / ${formatBytes(total, lng)}`} />
      <Progress value={ratio} />
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </>
  )
}
