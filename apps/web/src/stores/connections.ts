import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Connection, ConnectionInput } from '@/lib/typesense/types'

interface ConnectionsState {
  connections: Connection[]
  add: (input: ConnectionInput) => Connection
  update: (id: string, input: ConnectionInput) => void
  remove: (id: string) => void
}

export const useConnections = create<ConnectionsState>()(
  persist(
    (set) => ({
      connections: [],
      add: (input) => {
        const connection = { ...input, id: crypto.randomUUID() }
        set((state) => ({ connections: [...state.connections, connection] }))
        return connection
      },
      update: (id, input) =>
        set((state) => ({
          connections: state.connections.map((c) => (c.id === id ? { ...input, id } : c)),
        })),
      remove: (id) => set((state) => ({ connections: state.connections.filter((c) => c.id !== id) })),
    }),
    { name: 'typesense-studio:connections', version: 1 },
  ),
)

export function useConnection(id: string): Connection | undefined {
  return useConnections((state) => state.connections.find((c) => c.id === id))
}
