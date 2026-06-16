// =============================================================
//  Accueil.jsx — Écran d'entrée : choix entre le mode kiosque
//  (pointage des salariés) et l'espace manager/RH.
// =============================================================

import { useNavigate } from 'react-router-dom'
import { Logo, Horloge } from '../components/Communs'

export default function Accueil() {
  const navigate = useNavigate()
  return (
    <div className="connexion">
      <div className="boite carte" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div className="logo-accueil"><Logo taille={88} /></div>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: '-1px' }}>AlchiPass</h1>
          <p className="muet" style={{ margin: 0 }}>
            Pointage des heures · Les Alchimistes Côte d'Azur
          </p>
        </div>

        <div style={{ margin: '18px 0' }}>
          <Horloge />
        </div>

        <div className="choix-role">
          <button className="btn large" onClick={() => navigate('/kiosque')}>
            👋 Espace Employé
          </button>
          <button className="btn large secondaire" onClick={() => navigate('/admin/connexion')}>
            🔑 Espace Admin / RH
          </button>
        </div>
      </div>
    </div>
  )
}
