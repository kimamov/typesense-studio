import { LanguagesIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { languages } from '@/i18n'

export function PreferencesMenu() {
  const { t, i18n } = useTranslation()
  const { theme = 'system', setTheme } = useTheme()
  const ThemeIcon = theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : MonitorIcon

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t('common.language')} />}>
          <LanguagesIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={i18n.resolvedLanguage} onValueChange={(lng) => void i18n.changeLanguage(lng)}>
            <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {languages.map((l) => (
              <DropdownMenuRadioItem key={l.code} value={l.code} closeOnClick>
                {l.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t('common.theme')} />}>
          <ThemeIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuLabel>{t('common.theme')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioItem value="light" closeOnClick>{t('common.light')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" closeOnClick>{t('common.dark')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system" closeOnClick>{t('common.system')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
