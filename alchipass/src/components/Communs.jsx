// =============================================================
//  Communs.jsx — Petits composants réutilisés partout :
//  logo AlchiPass, horloge en temps réel, en-tête.
// =============================================================

import { useEffect, useState } from 'react'
import { formatDateLongue } from '../utils/time'
import logo from '../assets/logo.png'

// Logo officiel AlchiPass (horloge + feuille + circuit) dans une
// pastille blanche arrondie. Remplace l'ancien emoji.
export function Logo({ taille = 40 }) {
  return (
    <span className="logo-rond" style={{ width: taille, height: taille }} aria-hidden>
      <img src={logo} alt="AlchiPass" style={{ width: '78%', height: '78%', objectFit: 'contain' }} />
    </span>
  )
}

// Horloge mise à jour chaque seconde, format 24 h + date longue.
export function Horloge({ grand = false }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return (
    <div className="horloge">
      <div className="h">{h}:{m}{grand ? '' : <span style={{ opacity: 0.6, fontSize: '0.7em' }}>:{s}</span>}</div>
      <div className="d">{formatDateLongue(now)}</div>
    </div>
  )
}

// En-tête de l'espace administrateur (et salarié).
export function BarreHaut({ titre, droite }) {
  return (
    <div className="barre-haut">
      <div className="marque">
        <Logo />
        <span>AlchiPass{titre ? ` · ${titre}` : ''}</span>
      </div>
      {droite || <Horloge />}
    </div>
  )
}
