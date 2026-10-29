import { CircleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useErrorMessage } from '@/hooks/use-typesense'

export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>{t('errors.title')}</AlertTitle>
      <AlertDescription>{errorMessage(error)}</AlertDescription>
      {onRetry && (
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
