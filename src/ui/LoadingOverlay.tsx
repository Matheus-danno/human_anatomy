import { useProgress } from '@react-three/drei'

export function LoadingOverlay() {
  const { active, progress } = useProgress()
  if (!active && progress >= 100) return null

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="w-72 rounded-lg bg-slate-900/80 p-4 text-sm shadow-lg backdrop-blur">
        <p className="mb-2 text-slate-200">Carregando modelos 3D… {Math.round(progress)}%</p>
        <div
          className="h-2 overflow-hidden rounded bg-slate-700"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className="h-full bg-sky-400 transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )
}
