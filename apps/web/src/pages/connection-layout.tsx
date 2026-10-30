import { Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router'
import {
  ActivityIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  DatabaseIcon,
  KeyRoundIcon,
  LibraryIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiKeyDialog, ConnectionSettingsDialog } from '@/components/api-key-dialogs'
import { CollectionNav } from '@/components/collection-nav'
import { PreferencesMenu } from '@/components/preferences-menu'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { ActiveConnectionContext } from '@/hooks/use-active-connection'
import { api } from '@/lib/typesense/api'
import { createClient, isKeyRejected, nodeUrl } from '@/lib/typesense/client'
import type { Connection } from '@/lib/typesense/types'
import { useApiKey, useConnection, useConnections } from '@/stores/connections'

interface NavItem {
  to: '/c/$connectionId' | '/c/$connectionId/keys' | '/c/$connectionId/collections'
  label: string
  icon: LucideIcon
}

export function ConnectionLayout({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation()
  const matchRoute = useMatchRoute()
  const connection = useConnection(connectionId)
  const apiKey = useApiKey(connectionId)
  const forgetApiKey = useConnections((s) => s.forgetApiKey)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const active = useMemo(
    () =>
      connection && apiKey
        ? { connection, client: createClient(connection, apiKey), requestApiKey: () => forgetApiKey(connection.id) }
        : null,
    [connection, apiKey, forgetApiKey],
  )
  // Studio needs an admin key; a stored key may be a search-only key or may have lost its rights.
  const keys = useQuery({
    queryKey: [connectionId, 'keys'],
    queryFn: ({ signal }) => api.keys(active!.client, signal),
    enabled: !!active,
  })

  if (connection && !active) return <ApiKeyDialog connection={connection} />
  if (connection && isKeyRejected(keys.error)) return <ApiKeyDialog key="rejected" connection={connection} rejected />

  if (!active) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-muted-foreground">{t('connections.notFound')}</p>
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          <ArrowLeftIcon />
          {t('connections.back')}
        </Link>
      </div>
    )
  }

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: t('nav.server'),
      items: [
        { to: '/c/$connectionId', label: t('nav.status'), icon: ActivityIcon },
        { to: '/c/$connectionId/keys', label: t('nav.apiKeys'), icon: KeyRoundIcon },
      ],
    },
    { label: t('nav.data'), items: [{ to: '/c/$connectionId/collections', label: t('nav.collections'), icon: LibraryIcon }] },
  ]

  return (
    <ActiveConnectionContext.Provider value={active}>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <ConnectionSwitcher current={active.connection} />
          </SidebarHeader>
          <SidebarContent>
            {groups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        // Exact matches only, for the highlight and for `aria-current`: a collection's pages are
                        // highlighted in the collection group, and `/c/:id` is a prefix of every page.
                        render={<Link to={item.to} params={{ connectionId }} activeOptions={{ exact: true, includeSearch: false }} />}
                        isActive={!!matchRoute({ to: item.to, params: { connectionId } })}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
            <CollectionNav />
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center justify-between flex-wrap">
              <PreferencesMenu />
              <Link to="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                <SettingsIcon />
                {t('nav.manageConnections')}
              </Link>
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <span className="truncate text-sm font-medium">{active.connection.name}</span>
            {active.connection.tag && <Badge variant="secondary">{active.connection.tag}</Badge>}
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label={t('connectionSettings.title')}
              onClick={() => setSettingsOpen(true)}
            >
              <SlidersHorizontalIcon />
            </Button>
            <ConnectionSettingsDialog connection={active.connection} open={settingsOpen} onOpenChange={setSettingsOpen} />
          </header>
          <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ActiveConnectionContext.Provider>
  )
}

function ConnectionSwitcher({ current }: { current: Connection }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const connections = useConnections((s) => s.connections)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <DatabaseIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{current.name}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">{nodeUrl(current)}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('nav.switchConnection')}</DropdownMenuLabel>
              {connections.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => void navigate({ to: '/c/$connectionId', params: { connectionId: c.id } })}>
                  <span className="truncate">{c.name}</span>
                  {c.tag && <Badge variant="outline">{c.tag}</Badge>}
                  {c.id === current.id && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void navigate({ to: '/' })}>
              <SettingsIcon />
              {t('nav.manageConnections')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
