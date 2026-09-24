import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.jsx'
import { PosPage } from './modules/pos/pos-page.jsx'
import './index.css'

const isPosRoute = window.location.pathname === '/pos' || window.location.pathname.startsWith('/pos/')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPosRoute ? <PosPage /> : <App />}
  </StrictMode>,
)
