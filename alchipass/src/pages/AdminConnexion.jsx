// =============================================================
//  AdminConnexion.jsx — Authentification par rôle.
//  Rôles : 'rh' (outils de paie) et 'admin' (pilotage sécurité).
//  Mot de passe commun de démo : alchipass2026.
// =============================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Communs'

export default function AdminConnexion({ onConnexion }) {
  const navigate = useNavigate()
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(false)

  async function soumettre(e) {
    e.preventDefault()
    setChargement(true)
    setErreur('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant: identifiant.trim().toLowerCase(), motDePasse }),
      })
      const data = await res.json()
      if (data.ok) {
        onConnexion(data.role)
        navigate('/admin')
      } else {
        setErreur(data.error || 'Identifiant ou mot de passe incorrect.')
      }
    } catch {
      setErreur('Impossible de joindre le serveur.')
    } finally {
      setChargement(false)
    }
  }

  return (
    <div className="connexion">
      <form className="boite carte" onSubmit={soumettre}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <Logo taille={60} />
          <h1 style={{ margin: '10px 0 4px', fontSize: 26 }}>Espace Admin / RH</h1>
          <p className="muet" style={{ margin: 0 }}>Connexion sécurisée</p>
        </div>

        <div className="champ">
          <label>Identifiant</label>
          <input
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            autoFocus
            placeholder="rh ou admin"
          />
        </div>
        <div className="champ">
          <label>Mot de passe</label>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {erreur && <div className="alerte err">⚠️ {erreur}</div>}

        <button type="submit" className="btn large" style={{ width: '100%', marginTop: 6 }} disabled={chargement}>
          {chargement ? 'Connexion…' : 'Se connecter'}
        </button>

        <div className="center mt">
          <button type="button" className="retour" onClick={() => navigate('/')}>← Retour à l'accueil</button>
        </div>

        <div className="login-hints">
          <div className="login-hint"><span className="role-badge-mini rh">👤 rh</span> Outils de paie &amp; export</div>
          <div className="login-hint"><span className="role-badge-mini admin">🔐 admin</span> Pilotage sécurité &amp; site</div>
          <p className="muet" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>Mot de passe démo : alchipass2026</p>
        </div>
      </form>
    </div>
  )
}
