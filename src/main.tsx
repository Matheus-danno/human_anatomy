import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Cache dos modelos 3D no Cache Storage (public/sw.js). Só no build: no dev o Vite serve tudo direto.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // sem service worker (navegador restrito): os modelos vêm da rede normalmente
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
