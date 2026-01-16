import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Provide Buffer in the browser for libs that expect it
const globalWithBuffer = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer
}

if (typeof globalWithBuffer.Buffer === 'undefined') {
  globalWithBuffer.Buffer = Buffer
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
