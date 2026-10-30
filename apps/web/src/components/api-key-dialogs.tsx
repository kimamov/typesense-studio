import { useNavigate } from '@tanstack/react-router'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { nodeUrl } from '@/lib/typesense/client'
import type { Connection } from '@/lib/typesense/types'
import { useConnections } from '@/stores/connections'

export function RememberApiKeyField({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value)} className="mt-0.5" />
      <div className="grid gap-1">
        <Label htmlFor={id}>{t('connections.fields.rememberApiKey')}</Label>
        <p className="text-xs text-muted-foreground">{t('connections.fields.rememberApiKeyHint')}</p>
      </div>
    </div>
  )
}

/** Asks for the key of a connection whose key is neither in this tab's session nor remembered. */
export function ApiKeyDialog({ connection }: { connection: Connection }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setApiKey = useConnections((s) => s.setApiKey)
  const [apiKey, setValue] = useState('')
  const [remember, setRemember] = useState(connection.rememberApiKey)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setApiKey(connection.id, apiKey, remember)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && void navigate({ to: '/' })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('apiKeyDialog.title', { name: connection.name })}</DialogTitle>
          <DialogDescription>
            {t('apiKeyDialog.description')} <span className="font-mono">{nodeUrl(connection)}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="api-key-dialog-key">{t('connections.fields.apiKey')}</Label>
            <Input
              id="api-key-dialog-key"
              type="password"
              required
              autoFocus
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <RememberApiKeyField checked={remember} onChange={setRemember} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => void navigate({ to: '/' })}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('apiKeyDialog.submit')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ConnectionSettingsDialog({
  connection,
  open,
  onOpenChange,
}: {
  connection: Connection
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const setRememberApiKey = useConnections((s) => s.setRememberApiKey)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('connectionSettings.title')}</DialogTitle>
          <DialogDescription>{connection.name}</DialogDescription>
        </DialogHeader>
        <RememberApiKeyField
          checked={connection.rememberApiKey}
          onChange={(checked) => setRememberApiKey(connection.id, checked)}
        />
      </DialogContent>
    </Dialog>
  )
}
