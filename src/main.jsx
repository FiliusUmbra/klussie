import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { assertSupabaseConfig } from './lib/supabaseClient.js'

// Fail fast on a misconfigured deployment, before anything renders.
//
// This check used to happen as a side effect of importing supabaseClient.js, which meant
// every module that transitively imported the data layer — including pure logic — could
// not be loaded without a configured project. The check now lives here, at the one place
// that genuinely is application startup, so the behaviour a user or an operator sees is
// unchanged: same message, same moment, still before the first render.
assertSupabaseConfig()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
