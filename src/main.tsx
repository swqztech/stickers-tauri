import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installDesktopApi } from './desktopApi'
import './index.css'

installDesktopApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
