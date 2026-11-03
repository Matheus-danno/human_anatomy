import { useEffect } from 'react'
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
  useEffect(() => {
    loadAnatomy().then(useAnatomyStore.getState().setAnatomy)
    return startUrlSync()
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,_#4b5563_0%,_#1f2937_55%,_#0b0f17_100%)] text-slate-100">
      <div className="absolute inset-0">
        <Viewer />
      </div>
      <SystemPanel />
      <SearchBar />
      <LayerSlider />
      <InfoPanel />
      <Toolbar />
      <Tooltip />
      <LoadingOverlay />
    </div>
  )
}
