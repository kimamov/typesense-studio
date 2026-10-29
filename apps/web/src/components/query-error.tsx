import { CircleAlertIcon } from 'lucide-react'
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ActiveConnectionContext } from '@/hooks/use-active-connection'
import { useErrorMessage } from '@/hooks/use-typesense'
import { TypesenseError } from '@/lib/typesense/client'

export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const active = useContext(ActiveConnectionContext)
  const keyRejected = active && error instanceof TypesenseError && error.status === 401

  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>{t('errors.title')}</AlertTitle>
      <AlertDescription>{errorMessage(error)}</AlertDescription>
      {(keyRejected || onRetry) && (
        <AlertAction>
          {keyRejected ? (
            <Button size="sm" variant="outline" onClick={active.requestApiKey}>
              {t('errors.reenterApiKey')}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          )}
        </AlertAction>
      )}
    </Alert>
  )
}
