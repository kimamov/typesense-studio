import { useState } from 'react'

export type TableSearchState = ReturnType<typeof useTableSearch>

/** Search state for a table: rows match when any of their texts contains the query, ignoring case. */
export function useTableSearch() {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const filter = <T>(rows: T[], texts: (row: T) => (string | undefined)[]) =>
    needle ? rows.filter((row) => texts(row).some((text) => text?.toLowerCase().includes(needle))) : rows
  return { query, setQuery, filter }
}
