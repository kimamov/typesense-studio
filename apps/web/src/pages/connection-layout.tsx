import { Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router'
import {
  ActivityIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  DatabaseIcon,
  LibraryIcon,
  SettingsIcon,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PreferencesMenu } from '@/components/preferences-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { createClient, nodeUrl } from '@/lib/typesense/client'
import type { Connection } from '@/lib/typesense/types'
import { useConnection, useConnections } from '@/stores/connections'

interface NavItem {
  to: '/c/$connectionId' | '/c/$connectionId/collections'
  label: string
  icon: LucideIcon
}

export function ConnectionLayout({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation()
  const matchRoute = useMatchRoute()
  const connection = useConnection(connectionId)
  const active = useMemo(() => (connection ? { connection, client: createClient(connection) } : null), [connection])

  if (!active) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-muted-foreground">{t('connections.notFound')}</p>
        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowLeftIcon />
            {t('connections.back')}
          </Link>
        </Button>
      </div>
    )
  }

  const groups: { label: string; items: NavItem[] }[] = [
    { label: t('nav.server'), items: [{ to: '/c/$connectionId', label: t('nav.status'), icon: ActivityIcon }] },
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
                        asChild
                        // The status page is the index route, so only it needs an exact match.
                        isActive={!!matchRoute({ to: item.to, params: { connectionId }, fuzzy: item.to !== '/c/$connectionId' })}
                      >
                        <Link to={item.to} params={{ connectionId }}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/">
                  <SettingsIcon />
                  {t('nav.manageConnections')}
                </Link>
              </Button>
              <PreferencesMenu />
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <span className="truncate text-sm font-medium">{active.connection.name}</span>
            {active.connection.tag && <Badge variant="secondary">{active.connection.tag}</Badge>}
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
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <DatabaseIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{current.name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{nodeUrl(current)}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
            <DropdownMenuLabel>{t('nav.switchConnection')}</DropdownMenuLabel>
            {connections.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => void navigate({ to: '/c/$connectionId', params: { connectionId: c.id } })}>
                <span className="truncate">{c.name}</span>
                {c.tag && <Badge variant="outline">{c.tag}</Badge>}
                {c.id === current.id && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void navigate({ to: '/' })}>
              <SettingsIcon />
              {t('nav.manageConnections')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
