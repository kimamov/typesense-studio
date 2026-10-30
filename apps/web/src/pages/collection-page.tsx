import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, CopyIcon, SearchXIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { QueryError } from '@/components/query-error'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { copyText } from '@/lib/clipboard'
import { formatDate, formatNumber } from '@/lib/format'
import { api } from '@/lib/typesense/api'
import { TypesenseError } from '@/lib/typesense/client'
import type { CollectionField } from '@/lib/typesense/types'

/** Flags worth calling out; `index` is shown only when it is off, since indexing is the default. */
const FLAGS = ['facet', 'optional', 'sort', 'infix'] as const

export function CollectionPage({ name }: { name: string }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage
  const { connection, client } = useActiveConnection()
  const collection = useQuery({
    queryKey: [connection.id, 'collections', name],
    queryFn: ({ signal }) => api.collection(client, name, signal),
  })

  const backLink = (
    <Link
      to="/c/$connectionId/collections"
      params={{ connectionId: connection.id }}
      className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 w-fit' })}
    >
      <ArrowLeftIcon />
      {t('nav.collections')}
    </Link>
  )

  if (collection.error instanceof TypesenseError && collection.error.status === 404) {
    return (
      <>
        {backLink}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <SearchXIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('collection.notFound', { name })}</p>
        </div>
      </>
    )
  }

  if (collection.error) {
    return (
      <>
        {backLink}
        <QueryError error={collection.error} onRetry={() => void collection.refetch()} />
      </>
    )
  }

  const schema = collection.data

  const copySchema = async () => {
    if (await copyText(JSON.stringify(schema, null, 2))) toast.success(t('collection.copied'))
    else toast.error(t('collection.copyFailed'))
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {backLink}
        <h1 className="font-mono text-2xl font-semibold break-all">{name}</h1>
      </div>

      {!schema ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 rounded-xl border p-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
            <Fact label={t('collections.documents')}>{formatNumber(schema.num_documents, lng, 0)}</Fact>
            <Fact label={t('collections.createdAt')}>{formatDate(schema.created_at, lng)}</Fact>
            <Fact label={t('collection.defaultSortingField')}>
              {schema.default_sorting_field ? <code>{schema.default_sorting_field}</code> : <None />}
            </Fact>
            <Fact label={t('collection.synonymSets')}>
              <SetList sets={schema.synonym_sets} />
            </Fact>
            <Fact label={t('collection.curationSets')}>
              <SetList sets={schema.curation_sets} />
            </Fact>
          </dl>

          <Tabs defaultValue="fields">
            <TabsList activateOnFocus>
              <TabsTrigger value="fields">{t('collection.fieldsTab', { count: schema.fields.length })}</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="fields" className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('collection.field')}</TableHead>
                    <TableHead>{t('collection.type')}</TableHead>
                    <TableHead>{t('collection.flags')}</TableHead>
                    <TableHead>{t('collection.locale')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schema.fields.map((field) => (
                    <TableRow key={field.name}>
                      <TableCell>
                        <FieldName name={field.name} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {field.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <FieldFlags field={field} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{field.locale || <None />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="json" className="relative">
              <Button variant="outline" size="sm" className="absolute top-2 right-2" onClick={() => void copySchema()}>
                <CopyIcon />
                {t('collection.copy')}
              </Button>
              <pre className="max-h-[60vh] overflow-auto rounded-xl border bg-muted/40 p-4 font-mono text-xs">
                {JSON.stringify(schema, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        </>
      )}
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

function None() {
  return <span className="text-muted-foreground">–</span>
}

function SetList({ sets }: { sets?: string[] }) {
  if (!sets?.length) return <None />
  return (
    <div className="flex flex-wrap gap-1">
      {sets.map((set) => (
        <Badge key={set} variant="secondary" className="font-mono">
          {set}
        </Badge>
      ))}
    </div>
  )
}

/** Nested fields ("specs.dimensions.width") are indented by depth, with the parent path muted. */
function FieldName({ name }: { name: string }) {
  const parts = name.split('.')
  const leaf = parts.pop()
  return (
    <span className="font-mono text-sm" style={{ paddingLeft: `${parts.length * 1.25}rem` }}>
      {parts.length > 0 && <span className="text-muted-foreground">{parts.join('.')}.</span>}
      <span className="font-medium">{leaf}</span>
    </span>
  )
}

function FieldFlags({ field }: { field: CollectionField }) {
  const { t } = useTranslation()
  const flags = FLAGS.filter((flag) => field[flag])
  if (flags.length === 0 && field.index !== false) return <None />
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge key={flag} variant="secondary">
          {flag}
        </Badge>
      ))}
      {field.index === false && <Badge variant="outline">{t('collection.notIndexed')}</Badge>}
    </div>
  )
}
