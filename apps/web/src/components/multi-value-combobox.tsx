import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import { isEscapeClear } from '@/lib/combobox'

interface MultiValueComboboxProps {
  id: string
  values: string[]
  onChange: (values: string[]) => void
  suggestions: readonly string[]
  invalid?: boolean
}

/**
 * Chips input with suggestions that also accepts any typed value: the typed text is offered as an
 * "Add" item after the suggestions, and a comma or closing the list (except with Escape) adds it as typed.
 */
export function MultiValueCombobox({ id, values, onChange, suggestions, invalid }: MultiValueComboboxProps) {
  const { t } = useTranslation()
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState('')

  const typed = query.trim()
  // Custom values stay in the list, so they can be deselected there like suggestions.
  const known = [...new Set([...suggestions, ...values])]
  const matches = known.filter((item) => item.toLowerCase().includes(typed.toLowerCase()))
  // The "Add" item comes last, so Enter picks the first suggestion while typing a prefix.
  const items = typed && !known.includes(typed) ? [...matches, typed] : matches

  const add = (text: string) => {
    const added = text
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item && !values.includes(item))
    if (added.length > 0) onChange([...values, ...new Set(added)])
  }

  const changeQuery = (next: string) => {
    if (!next.includes(',')) return setQuery(next)
    // Everything up to the last comma becomes chips; the rest stays in the input.
    const cut = next.lastIndexOf(',')
    add(next.slice(0, cut))
    setQuery(next.slice(cut + 1).trimStart())
  }

  return (
    <Combobox
      multiple
      autoHighlight
      items={items}
      filter={null}
      value={values}
      onValueChange={(next: string[], details) => {
        if (isEscapeClear(details)) return
        onChange(next)
        setQuery('')
      }}
      inputValue={query}
      onInputValueChange={changeQuery}
      onOpenChange={(open, details) => {
        // Base UI clears the input when the popup closes, before the input's blur. Keep typed text as a
        // value instead of dropping it, unless the user cancelled with Escape or picked an item instead.
        if (!open && details.reason !== 'escape-key' && details.reason !== 'item-press') add(query)
      }}
    >
      <ComboboxChips ref={anchor} className="font-mono">
        <ComboboxValue>
          {(selected: string[]) => (
            <>
              {selected.map((item) => (
                <ComboboxChip key={item} className="font-mono">
                  {item}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput id={id} aria-invalid={invalid || undefined} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{t('apiKeys.noSuggestions')}</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item} className="font-mono">
              {item === typed && !known.includes(item) ? t('apiKeys.addCustom', { value: item }) : item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
