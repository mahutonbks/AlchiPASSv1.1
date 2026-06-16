// =============================================================
//  main.jsx — Point d'entrée : monte l'application React dans
//  la page et active le routeur (HashRouter pour fonctionner
//  même en ouvrant le build sans serveur).
// =============================================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
