import { createContext, useContext } from 'react'
import type { TypesenseClient } from '@/lib/typesense/client'
import type { Connection } from '@/lib/typesense/types'

export interface ActiveConnection {
  connection: Connection
  client: TypesenseClient
  /** Discards the current API key so the layout asks for it again. */
  requestApiKey: () => void
}

export const ActiveConnectionContext = createContext<ActiveConnection | null>(null)

/** The connection selected in the URL; only available below the connection layout. */
export function useActiveConnection(): ActiveConnection {
  const value = useContext(ActiveConnectionContext)
  if (!value) throw new Error('useActiveConnection must be used inside the connection layout')
  return value
}
