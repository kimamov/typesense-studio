import { Link } from '@tanstack/react-router'
import { DatabaseIcon, PencilIcon, PlusIcon, ServerIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConnectionFormDialog } from '@/components/connection-form-dialog'
import { PreferencesMenu } from '@/components/preferences-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { effectiveTransport, nodeUrl } from '@/lib/typesense/client'
import type { Connection } from '@/lib/typesense/types'
import { useConnections } from '@/stores/connections'

export function ConnectionsPage() {
  const { t } = useTranslation()
  const { connections, add, update, remove } = useConnections()
  const [dialog, setDialog] = useState<{ open: boolean; connection?: Connection }>({ open: false })

  const confirmRemove = (connection: Connection) => {
    if (window.confirm(t('connections.confirmDelete', { name: connection.name }))) remove(connection.id)
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <DatabaseIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">{t('app.name')}</h1>
            <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
          </div>
        </div>
        <PreferencesMenu />
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{t('connections.title')}</h2>
            <p className="max-w-prose text-sm text-muted-foreground">{t('connections.description')}</p>
          </div>
          <Button onClick={() => setDialog({ open: true })}>
            <PlusIcon />
            {t('connections.add')}
          </Button>
        </div>

        {connections.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
            <ServerIcon className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">{t('connections.empty')}</p>
              <p className="text-sm text-muted-foreground">{t('connections.emptyHint')}</p>
            </div>
            <Button variant="outline" onClick={() => setDialog({ open: true })}>
              <PlusIcon />
              {t('connections.add')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {connections.map((connection) => (
              <Card key={connection.id}>
                <CardHeader>
                  <CardTitle className="truncate">{connection.name}</CardTitle>
                  <CardDescription className="truncate font-mono text-xs">{nodeUrl(connection)}</CardDescription>
                  <CardAction className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('common.edit')}
                      onClick={() => setDialog({ open: true, connection })}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('common.delete')}
                      onClick={() => confirmRemove(connection)}
                    >
                      <Trash2Icon />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardFooter className="mt-auto justify-between gap-2">
                  <div className="flex min-w-0 gap-1">
                    {connection.tag && <Badge variant="secondary">{connection.tag}</Badge>}
                    <Badge variant="outline">{t(`connections.transport.${effectiveTransport(connection)}`)}</Badge>
                  </div>
                  <Button size="sm" asChild>
                    <Link to="/c/$connectionId" params={{ connectionId: connection.id }}>
                      {t('connections.open')}
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ConnectionFormDialog
        open={dialog.open}
        connection={dialog.connection}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSave={(input) => {
          if (dialog.connection) update(dialog.connection.id, input)
          else add(input)
          setDialog({ open: false })
        }}
      />
    </div>
  )
}
