import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { linter } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, placeholder as placeholderExtension } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useEffect, useRef } from 'react'

const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--syntax-key)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: [tags.bool, tags.null], color: 'var(--syntax-literal)' },
])

// Colors come from the app's CSS variables, so light and dark mode follow the app theme.
const theme = EditorView.theme({
  '&': { fontSize: '0.75rem', backgroundColor: 'transparent', color: 'var(--foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--foreground)', padding: '0.5rem 0' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted-foreground)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--muted)', outline: '1px solid var(--border)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent)' },
  '.cm-tooltip': { backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' },
})

interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  /** Called on ⌘/Ctrl+Enter. */
  onSubmit?: () => void
  'aria-label': string
  placeholder?: string
}

/** CodeMirror-based JSON editor with highlighting and inline syntax errors. Loaded lazily by its users. */
export default function JsonEditor({ value, onChange, onSubmit, placeholder, ...props }: JsonEditorProps) {
  const parent = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>(null)
  // The editor is created once from the first props; later callbacks are read through a ref.
  const initial = useRef({ value, placeholder: placeholder ?? '', label: props['aria-label'] })
  const callbacks = useRef({ onChange, onSubmit })
  useEffect(() => {
    callbacks.current = { onChange, onSubmit }
  })

  useEffect(() => {
    const { value, placeholder, label } = initial.current
    view.current = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          json(),
          linter(jsonParseLinter(), { delay: 300 }),
          syntaxHighlighting(highlightStyle),
          EditorView.lineWrapping,
          theme,
          placeholderExtension(placeholder),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          keymap.of([
            { key: 'Mod-Enter', run: () => (callbacks.current.onSubmit?.(), true) },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    return () => view.current?.destroy()
  }, [])

  // Replaces the content when `value` changes from outside, e.g. after switching modes.
  useEffect(() => {
    const current = view.current
    if (current && current.state.doc.toString() !== value) {
      current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value } })
    }
  }, [value])

  return (
    <div
      ref={parent}
      className="min-h-32 overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
    />
  )
}
