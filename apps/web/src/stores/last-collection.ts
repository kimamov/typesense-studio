import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * The collection last opened per connection, so the sidebar keeps it while other pages are open.
 * Kept in sessionStorage: it survives reloads, but a new session does not start on an old collection.
 */
const useLastCollections = create<{ names: Record<string, string> }>()(
  persist(() => ({ names: {} }), {
    name: 'typesense-studio:last-collections',
    storage: createJSONStorage(() => sessionStorage),
  }),
)

export function useLastCollection(connectionId: string): string | undefined {
  return useLastCollections((s) => s.names[connectionId])
}

export function setLastCollection(connectionId: string, name: string | undefined) {
  useLastCollections.setState((s) => ({
    names: name
      ? { ...s.names, [connectionId]: name }
      : Object.fromEntries(Object.entries(s.names).filter(([id]) => id !== connectionId)),
  }))
}
