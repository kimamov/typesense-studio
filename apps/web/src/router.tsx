import { createHashHistory, createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { ApiKeysPage } from '@/pages/api-keys-page'
import { CollectionPage } from '@/pages/collection-page'
import { CollectionsPage } from '@/pages/collections-page'
import { ConnectionLayout } from '@/pages/connection-layout'
import { ConnectionsPage } from '@/pages/connections-page'
import { ServerStatusPage } from '@/pages/server-status-page'

const rootRoute = createRootRoute({ component: Outlet })

const connectionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ConnectionsPage })

const connectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$connectionId',
  component: function ConnectionRoute() {
    const { connectionId } = connectionRoute.useParams()
    return <ConnectionLayout connectionId={connectionId} />
  },
})

const statusRoute = createRoute({ getParentRoute: () => connectionRoute, path: '/', component: ServerStatusPage })

const collectionsRoute = createRoute({
  getParentRoute: () => connectionRoute,
  path: '/collections',
  component: CollectionsPage,
})

const collectionRoute = createRoute({
  getParentRoute: () => connectionRoute,
  path: '/collections/$name',
  component: function CollectionRoute() {
    const { name } = collectionRoute.useParams()
    return <CollectionPage name={name} />
  },
})

const apiKeysRoute = createRoute({ getParentRoute: () => connectionRoute, path: '/keys', component: ApiKeysPage })

const routeTree = rootRoute.addChildren([
  connectionsRoute,
  connectionRoute.addChildren([statusRoute, apiKeysRoute, collectionsRoute, collectionRoute]),
])

// Hash history works unchanged on static hosting, under a sub-path and inside the desktop shell.
export const router = createRouter({ routeTree, history: createHashHistory() })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
