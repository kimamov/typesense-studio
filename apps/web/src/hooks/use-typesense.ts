import { useTranslation } from 'react-i18next'
import { TypesenseError } from '@/lib/typesense/client'

/** Turns transport and API errors into a message a user can act on. */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation()
  return (error) => {
    if (error instanceof TypesenseError) {
      if (error.status === 0) return t('errors.network')
      if (error.status === 401) return t('errors.unauthorized')
      return `${error.status}: ${error.message}`
    }
    return error instanceof Error ? error.message : String(error)
  }
}
