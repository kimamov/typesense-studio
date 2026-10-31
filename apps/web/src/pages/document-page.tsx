import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

const route = getRouteApi('/c/$connectionId/collections/$name/document')

// shortcut: placeholder only, the editor (load, edit as JSON, save or create) follows in its own iteration.
export function DocumentPage() {
  const { t } = useTranslation()
  const { name } = route.useParams()
  const { id } = route.useSearch()
  return (
    <div>
      <p className="font-mono text-sm text-muted-foreground break-all">{name}</p>
      <h1 className="text-2xl font-semibold break-all">{id === undefined ? t('document.newTitle') : t('document.editTitle', { id })}</h1>
    </div>
  )
}
