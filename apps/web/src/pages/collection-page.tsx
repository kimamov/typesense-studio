import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, SearchXIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteCollectionButton } from '@/components/delete-collection-dialog'
import { QueryError } from '@/components/query-error'
import { SchemaEditor } from '@/components/schema/schema-editor'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { formatDate, formatNumber } from '@/lib/format'
import { api } from '@/lib/typesense/api'
import { TypesenseError } from '@/lib/typesense/client'

export function CollectionPage({ name }: { name: string }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage
  const { connection, client } = useActiveConnection()
  const [version, setVersion] = useState(0)
  const collection = useQuery({
    queryKey: [connection.id, 'collections', name],
    queryFn: ({ signal }) => api.collection(client, name, signal),
  })

  const backLink = (
    <Link
      to="/c/$connectionId/collections"
      params={{ connectionId: connection.id }}
      // A link back to the parent page is not the current page.
      activeOptions={{ exact: true }}
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

  return (
    <>
      <div className="flex flex-col gap-2">
        {backLink}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-mono text-2xl font-semibold break-all">{name}</h1>
          {schema && <DeleteCollectionButton name={name} documents={schema.num_documents} />}
        </div>
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

          {/* Remounted after a save or discard, so the next edit starts from the current schema. */}
          <SchemaEditor key={version} schema={schema} onReset={() => setVersion((v) => v + 1)} />
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
