import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installWorkbenchRuntime } from './app/runtime/installWorkbenchRuntime'
import { installAllBeingsFutureCompat } from './lib/allBeingsFutureCompat'
import './styles/globals.css'

installAllBeingsFutureCompat()
installWorkbenchRuntime()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
