// =============================================================
//  App.jsx — Routage principal de l'application.
//  Routes : / (accueil), /kiosque (pointage),
//  /admin/connexion (login), /admin (espace manager protégé).
// =============================================================

import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Accueil from './pages/Accueil'
import Kiosque from './pages/Kiosque'
import AdminConnexion from './pages/AdminConnexion'
import Admin from './pages/Admin'

export default function App() {
  // null = déconnecté, 'rh' = espace paie, 'admin' = espace sécurité/pilotage.
  const [roleConnecte, setRoleConnecte] = useState(null)

  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/kiosque" element={<Kiosque />} />
        <Route
          path="/admin/connexion"
          element={<AdminConnexion onConnexion={(role) => setRoleConnecte(role)} />}
        />
        <Route
          path="/admin"
          element={
            roleConnecte
              ? <Admin role={roleConnecte} onDeconnexion={() => setRoleConnecte(null)} />
              : <Navigate to="/admin/connexion" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProvider>
  )
}
