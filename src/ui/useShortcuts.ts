import { useEffect } from 'react'
import { sameSet, useAnatomyStore } from '../store/useAnatomyStore'

/** Esc limpa a seleção; H oculta; I isola (ou sai do isolamento); Ctrl/Cmd+Z desfaz. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useAnatomyStore.getState()
      if (e.key === 'Escape') {
        s.clearSelection()
        return
      }
      // Não roubar teclas de campos de texto (busca); sliders e checkboxes não digitam, então tudo bem.
      const target = e.target as HTMLElement | null
      const typing =
        target?.closest('textarea, select, [contenteditable="true"]') ||
        (target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(target.type))
      if (typing) return

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        s.undo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || !s.selection) return
      const key = e.key.toLowerCase()
      if (key === 'h') s.setStructuresHidden(s.selection.ids, true)
      else if (key === 'i') s.isolate(sameSet(s.isolatedIds, s.selection.ids) ? null : s.selection.ids)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
