import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Connection, ConnectionInput } from '@/lib/typesense/types'

type Keys = Record<string, string>

/** API keys for the current tab only: sessionStorage survives reloads but not a new tab or closing the browser. */
const useSessionKeys = create<{ keys: Keys }>()(
  persist(() => ({ keys: {} }), {
    name: 'typesense-studio:session-keys',
    storage: createJSONStorage(() => sessionStorage),
  }),
)

interface ConnectionsState {
  connections: Connection[]
  /** API keys of connections with `rememberApiKey`, kept in localStorage. */
  rememberedKeys: Keys
  add: (input: ConnectionInput) => Connection
  /** An empty `apiKey` keeps the current key. */
  update: (id: string, input: ConnectionInput) => void
  remove: (id: string) => void
  setApiKey: (id: string, apiKey: string, remember: boolean) => void
  setRememberApiKey: (id: string, remember: boolean) => void
  /** Drops the key everywhere, e.g. after the server rejected it. */
  forgetApiKey: (id: string) => void
}

export const useConnections = create<ConnectionsState>()(
  persist(
    (set, get) => {
      const without = (keys: Keys, id: string): Keys => Object.fromEntries(Object.entries(keys).filter(([k]) => k !== id))

      const storeKey = (id: string, apiKey: string, remember: boolean) => {
        useSessionKeys.setState((s) => ({ keys: { ...s.keys, [id]: apiKey } }))
        set((s) => ({ rememberedKeys: remember ? { ...s.rememberedKeys, [id]: apiKey } : without(s.rememberedKeys, id) }))
      }

      const patch = (id: string, changes: Partial<Connection>) =>
        set((s) => ({ connections: s.connections.map((c) => (c.id === id ? { ...c, ...changes } : c)) }))

      return {
        connections: [],
        rememberedKeys: {},
        add: ({ apiKey, ...input }) => {
          const connection = { ...input, id: crypto.randomUUID() }
          set((s) => ({ connections: [...s.connections, connection] }))
          storeKey(connection.id, apiKey, connection.rememberApiKey)
          return connection
        },
        update: (id, { apiKey, ...input }) => {
          patch(id, input)
          const key = apiKey || getApiKey(id)
          if (key) storeKey(id, key, input.rememberApiKey)
          else if (!input.rememberApiKey) set((s) => ({ rememberedKeys: without(s.rememberedKeys, id) }))
        },
        remove: (id) => {
          set((s) => ({ connections: s.connections.filter((c) => c.id !== id), rememberedKeys: without(s.rememberedKeys, id) }))
          useSessionKeys.setState((s) => ({ keys: without(s.keys, id) }))
        },
        setApiKey: (id, apiKey, remember) => {
          patch(id, { rememberApiKey: remember })
          storeKey(id, apiKey, remember)
        },
        setRememberApiKey: (id, remember) => {
          patch(id, { rememberApiKey: remember })
          const key = getApiKey(id)
          if (key) storeKey(id, key, remember)
        },
        forgetApiKey: (id) => {
          set((s) => ({ rememberedKeys: without(s.rememberedKeys, id) }))
          useSessionKeys.setState((s) => ({ keys: without(s.keys, id) }))
        },
      }

      function getApiKey(id: string): string | undefined {
        return useSessionKeys.getState().keys[id] ?? get().rememberedKeys[id]
      }
    },
    {
      name: 'typesense-studio:connections',
      version: 2,
      partialize: ({ connections, rememberedKeys }) => ({ connections, rememberedKeys }),
      migrate: (persisted, version) => {
        if (version < 2) {
          // Version 1 stored every API key in localStorage; drop them so none linger on the device.
          const old = persisted as { connections?: (Omit<Connection, 'rememberApiKey'> & { apiKey?: string })[] }
          return {
            connections: (old.connections ?? []).map(({ apiKey: _, ...c }) => ({ ...c, rememberApiKey: false })),
            rememberedKeys: {},
          }
        }
        return persisted
      },
    },
  ),
)

// Without this, another open tab would write its stale state back, e.g. restoring a key that was just forgotten.
window.addEventListener('storage', (event) => {
  if (event.key === useConnections.persist.getOptions().name) void useConnections.persist.rehydrate()
})

export function useConnection(id: string): Connection | undefined {
  return useConnections((state) => state.connections.find((c) => c.id === id))
}

/** The key for a connection from this tab's session or, if remembered, from localStorage. */
export function useApiKey(id: string): string | undefined {
  const sessionKey = useSessionKeys((s) => s.keys[id])
  const rememberedKey = useConnections((s) => s.rememberedKeys[id])
  return sessionKey ?? rememberedKey
}
