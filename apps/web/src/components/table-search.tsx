import { SearchIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { TableCell, TableRow } from '@/components/ui/table'
import type { TableSearchState } from '@/hooks/use-table-search'
import { cn } from '@/lib/utils'

/** Search field above a table. */
export function TableSearch({ search, className }: { search: TableSearchState; className?: string }) {
  const { t } = useTranslation()
  return (
    <InputGroup className={cn('w-full sm:w-64', className)}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        placeholder={t('common.search')}
        aria-label={t('common.search')}
      />
    </InputGroup>
  )
}

/** Table row shown when the search leaves no rows. */
export function TableNoMatch({ colSpan }: { colSpan: number }) {
  const { t } = useTranslation()
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
        {t('common.noMatch')}
      </TableCell>
    </TableRow>
  )
}
