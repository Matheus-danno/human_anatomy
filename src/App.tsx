import { useCallback, useEffect, useState } from 'react'
import { loadAnatomy } from './data/structures'
import { Viewer } from './scene/Viewer'
import { useAnatomyStore } from './store/useAnatomyStore'
import { startUrlSync } from './store/urlSync'
import { InfoPanel } from './ui/InfoPanel'
import { LayerSlider } from './ui/LayerSlider'
import { LoadingOverlay } from './ui/LoadingOverlay'
import { SearchBar } from './ui/SearchBar'
import { SystemPanel } from './ui/SystemPanel'
import { Toolbar } from './ui/Toolbar'
import { Tooltip } from './ui/Tooltip'
import { useShortcuts } from './ui/useShortcuts'

export default function App() {
  useShortcuts()
  // Abaixo de lg o painel de sistemas vira gaveta; no desktop fica sempre aberto.
  const [panelOpen, setPanelOpen] = useState(false)
  const closePanel = useCallback(() => setPanelOpen(false), [])
  useEffect(() => {
    loadAnatomy().then(useAnatomyStore.getState().setAnatomy)
    return startUrlSync()
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,_#4b5563_0%,_#1f2937_55%,_#0b0f17_100%)] text-slate-100">
      <div className="absolute inset-0">
        <Viewer />
      </div>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        aria-label="Abrir painel de sistemas"
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900/90 text-slate-200 shadow-lg ring-1 ring-white/10 backdrop-blur lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <SystemPanel open={panelOpen} onClose={closePanel} />
      <SearchBar />
      <LayerSlider />
      <InfoPanel />
      <Toolbar />
      <Tooltip />
      <LoadingOverlay />
    </div>
  )
}
