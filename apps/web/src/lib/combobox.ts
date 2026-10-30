import type { Combobox } from '@base-ui/react/combobox'

/**
 * Base UI clears the whole selection when Escape is pressed while a combobox's list is closed. Users
 * expect Escape to close the surrounding popover, dialog or sheet instead, so that change is cancelled
 * and the key passed on. Returns true when the change was such an Escape and should be ignored.
 */
export function isEscapeClear(details: Combobox.Root.ChangeEventDetails): boolean {
  if (details.reason !== 'escape-key') return false
  details.cancel()
  details.allowPropagation()
  return true
}
