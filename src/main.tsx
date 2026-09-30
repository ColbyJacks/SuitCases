import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { MotionGlobalConfig } from 'motion/react'
import App from './App.tsx'

// ?capture skips UI transitions so slow headless screenshots show the settled state.
if (new URLSearchParams(location.search).has('capture')) MotionGlobalConfig.skipAnimations = true

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
