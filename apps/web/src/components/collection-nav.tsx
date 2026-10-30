import { useQuery } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate, useParams } from '@tanstack/react-router'
import { BracesIcon, SearchIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useActiveConnection } from '@/hooks/use-active-connection'
import { isEscapeClear } from '@/lib/combobox'
import { api } from '@/lib/typesense/api'
import { setLastCollection, useLastCollection } from '@/stores/last-collection'

/** Pages that belong to one collection; switching collections keeps the current one. */
const COLLECTION_PAGES = [
  { to: '/c/$connectionId/collections/$name/search', label: 'nav.search', icon: SearchIcon },
  { to: '/c/$connectionId/collections/$name', label: 'nav.schema', icon: BracesIcon },
] as const

/** Sidebar group with a collection switcher and the pages of the selected collection. */
export function CollectionNav() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const { connection, client } = useActiveConnection()
  const { name: urlName } = useParams({ strict: false })
  const remembered = useLastCollection(connection.id)

  const collections = useQuery({
    queryKey: [connection.id, 'collections'],
    queryFn: ({ signal }) => api.collections(client, signal),
  })
  const names = collections.data?.map((c) => c.name).sort((a, b) => a.localeCompare(b))

  // Until the list has loaded, the URL and the remembered name are trusted; then only existing collections count.
  const exists = (name?: string): name is string => !!name && (!names || names.includes(name))
  const selected = exists(urlName) ? urlName : exists(remembered) ? remembered : null

  useEffect(() => {
    if (!collections.data) return
    const known = (name: string) => collections.data.some((c) => c.name === name)
    if (urlName && known(urlName)) setLastCollection(connection.id, urlName)
    else if (remembered && !known(remembered)) setLastCollection(connection.id, undefined)
  }, [collections.data, connection.id, remembered, urlName])

  const open = (name: string) => {
    const page = COLLECTION_PAGES.find((p) => matchRoute({ to: p.to })) ?? COLLECTION_PAGES[0]
    setLastCollection(connection.id, name)
    void navigate({ to: page.to, params: { connectionId: connection.id, name } })
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('nav.collection')}</SidebarGroupLabel>
      <Combobox
        items={names ?? []}
        value={selected}
        onValueChange={(name: string | null, details) => !isEscapeClear(details) && name && open(name)}
        autoHighlight
      >
        <ComboboxInput className="mb-1 w-full" placeholder={t('nav.selectCollection')} aria-label={t('nav.collection')} />
        <ComboboxContent>
          <ComboboxEmpty>{collections.isPending ? t('common.loading') : t('nav.noCollections')}</ComboboxEmpty>
          <ComboboxList>
            {(name: string) => (
              <ComboboxItem key={name} value={name}>
                {name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <SidebarMenu>
        {COLLECTION_PAGES.map((page) => (
          <SidebarMenuItem key={page.to}>
            <SidebarMenuButton
              // Without a selected collection the pages have no target, so they are shown disabled.
              disabled={!selected}
              render={selected ? <Link to={page.to} params={{ connectionId: connection.id, name: selected }} /> : undefined}
              isActive={!!selected && !!matchRoute({ to: page.to, params: { connectionId: connection.id, name: selected } })}
            >
              <page.icon />
              <span>{t(page.label)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
