import { lazy, Suspense } from 'react'
import type { JsonEditorProps } from '@/components/json-editor'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

// CodeMirror is only loaded once an editor is shown. If its chunk fails to load (offline, or replaced
// by a newer deploy), a plain textarea takes its place so the editor keeps working.
const JsonEditor = lazy(() =>
  import('@/components/json-editor').catch((error: unknown) => {
    console.error('Failed to load the JSON editor', error)
    return { default: JsonTextarea }
  }),
)

/** The CodeMirror JSON editor, loaded on first use. */
export function LazyJsonEditor(props: JsonEditorProps) {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <JsonEditor {...props} />
    </Suspense>
  )
}

/** Fallback for the JSON editor without highlighting or inline errors. */
function JsonTextarea({ value, onChange, onSubmit, ...props }: JsonEditorProps) {
  return (
    <Textarea
      {...props}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          onSubmit?.()
        }
      }}
      spellCheck={false}
      className="min-h-40 font-mono text-xs md:text-xs"
    />
  )
}
