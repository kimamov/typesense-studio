import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RememberApiKeyField } from '@/components/api-key-dialogs'
import { useErrorMessage } from '@/hooks/use-typesense'
import { api } from '@/lib/typesense/api'
import { createClient, isDesktop } from '@/lib/typesense/client'
import type { Connection, ConnectionInput } from '@/lib/typesense/types'
import { useApiKey } from '@/stores/connections'

const EMPTY: ConnectionInput = {
  name: '',
  protocol: 'http',
  host: 'localhost',
  port: 8108,
  path: '',
  apiKey: '',
  tag: '',
  transport: 'direct',
  rememberApiKey: false,
}

interface ConnectionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: Connection
  onSave: (input: ConnectionInput) => void
}

export function ConnectionFormDialog({ open, onOpenChange, connection, onSave }: ConnectionFormDialogProps) {
  const { t } = useTranslation()
  const apiKey = useApiKey(connection?.id ?? '')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{connection ? t('connections.edit') : t('connections.add')}</DialogTitle>
          <DialogDescription>{t('connections.description')}</DialogDescription>
        </DialogHeader>
        {/* Keyed so the form resets whenever another connection is edited. */}
        <ConnectionForm
          key={connection?.id ?? 'new'}
          initial={connection ? { ...connection, apiKey: apiKey ?? '' } : EMPTY}
          isEdit={!!connection}
          onCancel={() => onOpenChange(false)}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  )
}

function ConnectionForm({
  initial,
  isEdit,
  onCancel,
  onSave,
}: {
  initial: ConnectionInput
  isEdit: boolean
  onCancel: () => void
  onSave: (input: ConnectionInput) => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [values, setValues] = useState<ConnectionInput>(initial)
  const [testing, setTesting] = useState(false)

  const set = <K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const withDefaults = (): ConnectionInput => ({
    ...values,
    name: values.name.trim() || values.host,
    host: values.host.trim(),
    tag: values.tag?.trim() || undefined,
  })

  const testConnection = async () => {
    setTesting(true)
    try {
      const debug = await api.debug(createClient({ ...withDefaults(), id: 'test' }, values.apiKey))
      toast.success(t('connections.testOk', { version: debug.version }))
    } catch (error) {
      toast.error(t('connections.testFailed', { message: errorMessage(error) }))
    } finally {
      setTesting(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave(withDefaults())
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="conn-name">{t('connections.fields.name')}</Label>
        <Input id="conn-name" value={values.name} placeholder={values.host} onChange={(e) => set('name', e.target.value)} />
      </div>
      <div className="grid grid-cols-[7rem_1fr_6rem] gap-2">
        <div className="grid gap-2">
          <Label>{t('connections.fields.protocol')}</Label>
          <Select value={values.protocol} onValueChange={(v) => set('protocol', v as ConnectionInput['protocol'])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">http</SelectItem>
              <SelectItem value="https">https</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="conn-host">{t('connections.fields.host')}</Label>
          <Input id="conn-host" required value={values.host} onChange={(e) => set('host', e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="conn-port">{t('connections.fields.port')}</Label>
          <Input
            id="conn-port"
            type="number"
            required
            min={1}
            max={65535}
            value={values.port}
            onChange={(e) => set('port', Number(e.target.value))}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="conn-path">{t('connections.fields.path')}</Label>
        <Input id="conn-path" value={values.path} placeholder="/" onChange={(e) => set('path', e.target.value)} />
        <p className="text-xs text-muted-foreground">{t('connections.fields.pathHint')}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="conn-key">{t('connections.fields.apiKey')}</Label>
        <Input
          id="conn-key"
          type="password"
          required={!isEdit}
          autoComplete="off"
          placeholder={isEdit ? t('connections.fields.apiKeyKeep') : undefined}
          value={values.apiKey}
          onChange={(e) => set('apiKey', e.target.value)}
        />
        <RememberApiKeyField checked={values.rememberApiKey} onChange={(checked) => set('rememberApiKey', checked)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="conn-tag">{t('connections.fields.tag')}</Label>
        <Input id="conn-tag" value={values.tag ?? ''} onChange={(e) => set('tag', e.target.value)} />
        <p className="text-xs text-muted-foreground">{t('connections.fields.tagHint')}</p>
      </div>
      {!isDesktop() && (
        <div className="grid gap-2">
          <Label>{t('connections.fields.transport')}</Label>
          <Select
            value={values.transport}
            onValueChange={(v) => set('transport', v as ConnectionInput['transport'])}
            // Base UI renders the raw value in <SelectValue> unless it knows the item labels.
            items={{ direct: t('connections.transport.direct'), proxy: t('connections.transport.proxy') }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">{t('connections.transport.direct')}</SelectItem>
              <SelectItem value="proxy">{t('connections.transport.proxy')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {values.transport === 'proxy' ? t('connections.transport.proxyHint') : t('connections.transport.directHint')}
          </p>
        </div>
      )}
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="outline" disabled={testing || !values.host || !values.apiKey} onClick={testConnection}>
          {testing ? t('common.loading') : t('connections.test')}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit">{t('common.save')}</Button>
        </div>
      </DialogFooter>
    </form>
  )
}
