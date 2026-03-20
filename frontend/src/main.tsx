import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installAllBeingsFutureCompat } from './lib/allBeingsFutureCompat'
import './styles/globals.css'

installAllBeingsFutureCompat()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
