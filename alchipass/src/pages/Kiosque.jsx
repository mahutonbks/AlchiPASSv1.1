// Application personnelle employé — AlchiPass
// Login confidentiel (nom + PIN sans afficher les statuts)
// Dashboard → Planning → Historique
// Pointage RFID exclusif pour Arrivée/Départ.
// Boutons manuels : Prendre ma pause / Terminer ma pause.

import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Logo, Horloge } from '../components/Communs'
import {
  dateKey,
  etatSalarie,
  formatHeure,
  formatDuree,
  calculerJournee,
  joursDeLaSemaine,
  nomJourCourt,
  LIBELLE_ACTION,
} from '../utils/time'
import { totalSemaine } from '../utils/rapports'

const EPI_ITEMS = [
  { id: 'gilet',  label: 'Gilet de sécurité',    icone: '🦺' },
  { id: 'bottes', label: 'Bottes de sécurité',   icone: '🥾' },
  { id: 'casque', label: 'Casque de protection', icone: '⛑️' },
]

const ETAT_INFOS = {
  absent:   { icone: '🔴', label: 'Pas encore arrivé' },
  present:  { icone: '🟢', label: 'Sur site' },
  en_pause: { icone: '🟡', label: 'En pause' },
  parti:    { icone: '🔵', label: 'Journée terminée' },
}

const JOURS_NOMS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// ── Bip audio Web Audio API ───────────────────────────────────
function jouerSon(freq = 880, duree = 0.9) {
  try {
    const ctx  = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.35, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duree)
    osc.start()
    osc.stop(ctx.currentTime + duree)
  } catch { /* AudioContext non dispo */ }
}

export default function Kiosque() {
  const navigate = useNavigate()
  const {
    salaries, sites, pointages, casques = [], associations = [],
    badgesManagers = [], planning = {}, pausesDefaut = [], ajouterPointage, ajouterFeedback,
  } = useApp()

  const [vue, setVue]               = useState('login')
  const [salarieSel, setSalarieSel] = useState(null)
  const [pin, setPin]               = useState('')
  const [erreurPin, setErreurPin]   = useState(false)
  const [epiChecks, setEpiChecks]   = useState({ gilet: false, bottes: false, casque: false })
  const [confirmation, setConfirmation] = useState(null)
  const [rfidConnecte, setRfidConnecte] = useState(false)
  const [rfidInconnu, setRfidInconnu]   = useState(false)
  const [decalageSemaine, setDecalageSemaine] = useState(0)

  // ── Notifications de pause ────────────────────────────────────
  const [notifPause, setNotifPause] = useState(null)
  const [pauseOk, setPauseOk]       = useState(false)
  const [pauseFinOk, setPauseFinOk] = useState(false)
  const notifShownRef = useRef(new Set())

  // ── Sauvegarde session avant interruption RFID ────────────────
  const vuePreRFID     = useRef(null)
  const salariePreRFID = useRef(null)

  const socketRef  = useRef(null)
  const handlerRef = useRef(null)
  const cleJour = dateKey(new Date())

  const pointagesJourParSalarie = useMemo(() => {
    const map = {}
    for (const p of pointages) {
      if (p.cle !== cleJour) continue
      ;(map[p.salarieId] ||= []).push(p)
    }
    return map
  }, [pointages, cleJour])

  // ── Salariés triés alphabétiquement (sans statut affiché) ────
  const salariesActifs = useMemo(
    () => [...salaries.filter(s => s.actif)].sort((a, b) => a.nom.localeCompare(b.nom)),
    [salaries]
  )

  // ── Système de rappel de pause ────────────────────────────────
  useEffect(() => {
    if (!salarieSel) return
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    function verifierRappels() {
      const now = new Date()
      const minutesNow = now.getHours() * 60 + now.getMinutes()
      const cleMinute  = Math.floor(Date.now() / 60000)
      for (const pause of pausesDefaut) {
        if (!pause.debut || !pause.fin) continue
        const [hD, mD] = pause.debut.split(':').map(Number)
        const [hF, mF] = pause.fin.split(':').map(Number)
        if (minutesNow === hD * 60 + mD - 5) {
          const cle = `${pause.id}-debut-${cleMinute}`
          if (!notifShownRef.current.has(cle)) { notifShownRef.current.add(cle); declencherNotification('debut', pause) }
        }
        if (minutesNow === hF * 60 + mF - 2) {
          const cle = `${pause.id}-fin-${cleMinute}`
          if (!notifShownRef.current.has(cle)) { notifShownRef.current.add(cle); declencherNotification('fin', pause) }
        }
      }
    }
    const id = setInterval(verifierRappels, 10000)
    return () => clearInterval(id)
  }, [salarieSel, pausesDefaut])

  function declencherNotification(type, pause) {
    const estDebut = type === 'debut'
    const message  = estDebut
      ? `☕ ${pause.label} dans 5 min (${pause.debut})`
      : `⏳ Fin de ${pause.label} dans 2 min (${pause.fin})`
    setNotifPause({ type, message, pause })
    setTimeout(() => setNotifPause(n => n?.pause?.id === pause.id ? null : n), 14000)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('AlchiPass — Rappel pause', { body: message })
    }
    jouerSon(estDebut ? 880 : 660)
  }

  // ── Actions pause manuelle (Collecteurs uniquement) ──────────
  async function prendreUnePause() {
    if (!salarieSel) return
    try {
      await ajouterPointage(salarieSel.id, 'pause_debut', null, 'app')
      setPauseOk(true)
      setTimeout(() => setPauseOk(false), 3000)
    } catch (e) { console.error('[PauseDebut]', e) }
  }

  async function terminerLaPause() {
    if (!salarieSel) return
    try {
      await ajouterPointage(salarieSel.id, 'pause_fin', null, 'app')
      setPauseFinOk(true)
      setTimeout(() => setPauseFinOk(false), 3000)
    } catch (e) { console.error('[PauseFin]', e) }
  }

  // ── Handler RFID ──────────────────────────────────────────────
  handlerRef.current = (uid) => {
    setRfidInconnu(false)
    const badgeManager = badgesManagers.find(b => b.uid_rfid === uid)
    if (badgeManager) { navigate('/admin/connexion'); return }

    const casque = casques.find(c => c.uid_rfid === uid)
    const assoc  = casque
      ? associations.find(a => a.id_rfid_sticker === casque.id_rfid_sticker && a.date_association === cleJour)
      : null

    if (!assoc) {
      setRfidInconnu(true)
      setTimeout(() => setRfidInconnu(false), 3000)
      return
    }

    const salarie = salaries.find(s => s.id === assoc.id_salarie && s.actif)
    if (!salarie) return

    vuePreRFID.current     = vue
    salariePreRFID.current = salarieSel

    const pts  = pointagesJourParSalarie[salarie.id] || []
    const etat = etatSalarie(pts)

    setSalarieSel(salarie)
    setEpiChecks({ gilet: false, bottes: false, casque: false })

    if (etat === 'absent' || etat === 'en_pause') {
      setVue('epi')
    } else if (etat === 'present') {
      setVue('actions_rfid')
    } else {
      setConfirmation({ action: null, heure: null, parti: true, prenom: salarie.prenom })
      setVue('confirme')
    }
  }

  // salarieSelRef permet au handler badgeuse:confirme de lire le salarié courant
  // sans re-créer la connexion socket à chaque changement de sélection.
  const salarieSelRef = useRef(null)
  useEffect(() => { salarieSelRef.current = salarieSel }, [salarieSel])

  useEffect(() => {
    const socket = io({ transports: ['websocket'] })
    socketRef.current = socket
    socket.on('connect',    () => setRfidConnecte(true))
    socket.on('disconnect', () => setRfidConnecte(false))
    socket.on('rfid:badge', ({ uid }) => { if (uid) handlerRef.current(uid) })

    // Confirmation de pointage émise par la badgeuse physique
    socket.on('badgeuse:confirme', (data) => {
      if (!data.salarieId) return
      const sel = salarieSelRef.current
      if (sel && sel.id === data.salarieId) {
        setConfirmation({ action: data.action, heure: data.timestamp, prenom: data.prenom, parti: data.parti })
        setVue('confirme')
      }
    })

    // Rechargement des pointages après action badgeuse
    socket.on('pointages:refresh', () => {
      fetch('/api/pointages').then(r => r.json()).then(pts => {
        window.dispatchEvent(new CustomEvent('alchipass:refresh', { detail: pts }))
      }).catch(() => {})
    })

    return () => socket.disconnect()
  }, [])

  // ── Retour après confirmation RFID ───────────────────────────
  useEffect(() => {
    if (vue !== 'confirme') return

    if (confirmation?.action === 'depart') {
      // Après départ : courte confirmation puis écran feedback
      const t = setTimeout(() => {
        // Si l'employé qui part est le même que celui qui était en session, on ne restaure pas sa session
        if (salariePreRFID.current?.id === salarieSelRef.current?.id) {
          vuePreRFID.current = null
          salariePreRFID.current = null
        }
        setVue('feedback')
      }, 2000)
      return () => clearTimeout(t)
    }

    const t = setTimeout(restaurerSession, 4000)
    return () => clearTimeout(t)
  }, [vue])

  function restaurerSession() {
    const vuePrev     = vuePreRFID.current
    const salariePrev = salariePreRFID.current
    vuePreRFID.current     = null
    salariePreRFID.current = null
    if (vuePrev && vuePrev !== 'login' && salariePrev) {
      setSalarieSel(salariePrev)
      setVue(vuePrev)
    } else {
      setSalarieSel(null)
      setPin('')
      setVue('login')
    }
  }

  // ── Login : sélection nom + PIN ───────────────────────────────
  function choisirSalarie(id) {
    const s = salariesActifs.find(x => x.id === id) || null
    setSalarieSel(s)
    setPin('')
    setErreurPin(false)
  }

  function appuyerChiffre(c) {
    if (!salarieSel) return
    if (pin.length >= 4) return
    const nouveau = pin + c
    setPin(nouveau)
    setErreurPin(false)
    if (nouveau.length === 4) setTimeout(() => validerPin(nouveau), 150)
  }

  function effacer() { setPin(p => p.slice(0, -1)); setErreurPin(false) }

  function validerPin(valeur) {
    if (valeur === salarieSel.pin) {
      setDecalageSemaine(0)
      setVue('dashboard')
    } else {
      setErreurPin(true)
      setPin('')
    }
  }

  function seDeconnecter() {
    setSalarieSel(null)
    setPin('')
    setErreurPin(false)
    setDecalageSemaine(0)
    setVue('login')
  }

  // ── EPI ───────────────────────────────────────────────────────
  function toggleEpi(id) { setEpiChecks(prev => ({ ...prev, [id]: !prev[id] })) }
  const tousEpiCoches = EPI_ITEMS.every(item => epiChecks[item.id])

  async function validerEPI() {
    const epiData = { ...epiChecks }
    const pts  = pointagesJourParSalarie[salarieSel.id] || []
    const etat = etatSalarie(pts)
    const type = etat === 'absent' ? 'arrivee' : 'pause_fin'
    try {
      const enregistre = await ajouterPointage(salarieSel.id, type, epiData)
      if (enregistre) {
        setConfirmation({ action: type, heure: enregistre.timestamp, prenom: salarieSel.prenom })
        setVue('confirme')
      }
    } catch (e) { console.error('[EPI]', e) }
  }

  // ── Actions RFID — état 'present' ────────────────────────────
  async function enregistrerActionRFID(type) {
    try {
      const enregistre = await ajouterPointage(salarieSel.id, type, null)
      if (enregistre) {
        setConfirmation({ action: type, heure: enregistre.timestamp, prenom: salarieSel.prenom })
        setVue('confirme')
      }
    } catch (e) { console.error('[ActionRFID]', e) }
  }

  // ── Rendu ─────────────────────────────────────────────────────
  return (
    <div className="kiosque">
      <div className="kiosque-haut">
        <div className="marque">
          <Logo taille={46} />
          <span>AlchiPass</span>
        </div>
        <div className="kiosque-haut-droite">
          {salarieSel && vue !== 'login' && (
            <span style={{ fontWeight: 700, fontSize: 16, opacity: 0.93 }}>
              {salarieSel.avatar} {salarieSel.prenom}
            </span>
          )}
          <span className={`rfid-indicateur ${rfidConnecte ? 'connecte' : ''}`}>
            📡 {rfidConnecte ? 'Badgeuse connectée' : 'Badgeuse hors ligne'}
          </span>
          <Horloge grand />
        </div>
      </div>

      {notifPause && vue !== 'confirme' && (
        <NotifPauseToast notif={notifPause} onFermer={() => setNotifPause(null)} />
      )}

      <div className="kiosque-corps">
        {rfidInconnu && (
          <div className="alerte err" style={{ marginBottom: 16 }}>
            ⚠️ Badge non reconnu — aucune association pour aujourd'hui.
          </div>
        )}

        {/* ── LOGIN : nom + PIN (pas de grille, pas de statuts) ── */}
        {vue === 'login' && (
          <div className="login-zone">
            <div className="login-titre">
              <span style={{ fontSize: 52 }}>👋</span>
              <h2>Connexion</h2>
              <p className="muet">Appuie sur ton nom, puis entre ton code PIN</p>
            </div>

            <div className="login-form">
              {!salarieSel ? (
                /* ── Sélection de l'employé : liste de boutons (Android-safe) ── */
                <div className="champ">
                  <label>Sélectionne ton nom</label>
                  <div className="login-liste">
                    {salariesActifs.map(s => (
                      <button
                        key={s.id}
                        className="login-employee-btn"
                        onClick={() => choisirSalarie(s.id)}
                      >
                        <span className="login-employee-avatar">{s.avatar}</span>
                        <span className="login-employee-nom">{s.prenom} {s.nom}</span>
                        <span className="login-employee-fleche">›</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* ── Saisie du PIN ── */
                <div className="login-pin-zone" style={{ animation: 'monteFondu .3s ease both' }}>
                  <div className="login-employee-selectionne">
                    <span style={{ fontSize: 30 }}>{salarieSel.avatar}</span>
                    <strong style={{ fontSize: 17, flex: 1 }}>{salarieSel.prenom} {salarieSel.nom}</strong>
                    <button
                      className="retour"
                      style={{ color: 'var(--texte-doux)', fontSize: 13 }}
                      onClick={() => { setSalarieSel(null); setPin(''); setErreurPin(false) }}
                    >
                      ← Changer
                    </button>
                  </div>
                  <p className="muet" style={{ marginBottom: 16, textAlign: 'center' }}>
                    Code PIN à 4 chiffres
                  </p>
                  <div className="pin-points" style={{ marginBottom: 20 }}>
                    {[0,1,2,3].map(i => (
                      <span key={i} className={`pin-point ${i < pin.length ? 'plein' : ''}`} />
                    ))}
                  </div>
                  {erreurPin && (
                    <p style={{ color: 'var(--rouge)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
                      Code incorrect — réessaie.
                    </p>
                  )}
                  <div className="pin-clavier">
                    {['1','2','3','4','5','6','7','8','9'].map(c => (
                      <button key={c} className="pin-touche" onClick={() => appuyerChiffre(c)}>{c}</button>
                    ))}
                    <button className="pin-touche" onClick={effacer}>⌫</button>
                    <button className="pin-touche" onClick={() => appuyerChiffre('0')}>0</button>
                    <button
                      className="pin-touche"
                      onClick={() => { setSalarieSel(null); setPin(''); setErreurPin(false) }}
                      title="Annuler"
                    >✕</button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt center">
              <button className="retour" style={{ color: 'var(--texte-doux)' }} onClick={() => navigate('/')}>
                ← Retour à l'accueil
              </button>
            </div>
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {vue === 'dashboard' && salarieSel && (
          <Dashboard
            salarie={salarieSel}
            pointagesDuJour={pointagesJourParSalarie[salarieSel.id] || []}
            site={sites.find(s => s.id === salarieSel.siteId)}
            pauseOk={pauseOk}
            pauseFinOk={pauseFinOk}
            pausesDefaut={pausesDefaut}
            onPrenderPause={prendreUnePause}
            onTerminerPause={terminerLaPause}
            onPlanning={() => { setDecalageSemaine(0); setVue('planning') }}
            onHistorique={() => { setDecalageSemaine(0); setVue('historique') }}
            onDeconnecter={seDeconnecter}
          />
        )}

        {/* ── MON PLANNING ── */}
        {vue === 'planning' && salarieSel && (
          <MonPlanning
            salarie={salarieSel}
            planning={planning}
            pausesDefaut={pausesDefaut}
            decalage={decalageSemaine}
            onDecalage={setDecalageSemaine}
            onRetour={() => setVue('dashboard')}
          />
        )}

        {/* ── MON HISTORIQUE ── */}
        {vue === 'historique' && salarieSel && (
          <MonHistorique
            salarie={salarieSel}
            pointages={pointages}
            decalage={decalageSemaine}
            onDecalage={setDecalageSemaine}
            onRetour={() => setVue('dashboard')}
          />
        )}

        {/* ── EPI (RFID uniquement) ── */}
        {vue === 'epi' && salarieSel && (
          <div className="epi-zone">
            <div style={{ fontSize: 60 }}>{salarieSel.avatar}</div>
            <h2 style={{ margin: '6px 0', fontSize: 26 }}>Vérification des EPI</h2>
            <p className="muet" style={{ marginBottom: 0 }}>Coche chaque équipement que tu portes</p>
            <div className="epi-liste">
              {EPI_ITEMS.map(item => (
                <button
                  key={item.id}
                  className={`epi-item ${epiChecks[item.id] ? 'valide' : ''}`}
                  onClick={() => toggleEpi(item.id)}
                >
                  <span className="epi-icone">{item.icone}</span>
                  <span className="epi-label">{item.label}</span>
                  <span className="epi-check">{epiChecks[item.id] ? '✅' : '⬜'}</span>
                </button>
              ))}
            </div>
            <button className="btn large" style={{ width: '100%' }} disabled={!tousEpiCoches} onClick={validerEPI}>
              {tousEpiCoches ? 'Confirmer →' : 'Coche tous les équipements'}
            </button>
            <div className="mt center">
              <button className="retour" onClick={restaurerSession}>← Annuler</button>
            </div>
          </div>
        )}

        {/* ── ACTIONS RFID — état 'present' ── */}
        {vue === 'actions_rfid' && salarieSel && (
          <div style={{ textAlign: 'center', animation: 'monteFondu .35s ease both' }}>
            <div style={{ fontSize: 60, marginBottom: 4 }}>{salarieSel.avatar}</div>
            <h2 style={{ fontSize: 26, margin: '4px 0 6px' }}>{salarieSel.prenom} {salarieSel.nom}</h2>
            <p className="muet">Badge détecté — que veux-tu faire ?</p>
            <div className="actions-pointage" style={{ marginTop: 28 }}>
              <button className="bouton-action pause_debut" onClick={() => enregistrerActionRFID('pause_debut')}>
                <span className="icone">☕</span>
                Prendre une pause
              </button>
              <button className="bouton-action depart" onClick={() => enregistrerActionRFID('depart')}>
                <span className="icone">🏁</span>
                Quitter le site
              </button>
            </div>
            <div className="mt center">
              <button className="retour" onClick={restaurerSession}>← Annuler</button>
            </div>
          </div>
        )}

        {/* ── FEEDBACK FIN DE JOURNÉE ── */}
        {vue === 'feedback' && salarieSel && (
          <FeedbackJournee
            salarie={salarieSel}
            onSoumettre={(note, commentaire) => {
              if (note > 0) ajouterFeedback(salarieSel.id, note, commentaire).catch(() => {})
              restaurerSession()
            }}
            onPasser={restaurerSession}
          />
        )}
      </div>

      {/* ── CONFIRMATION ── */}
      {vue === 'confirme' && (
        <div className="confirmation" onClick={restaurerSession}>
          {confirmation?.parti ? (
            <>
              <div className="check">🌙</div>
              <div className="titre">Journée déjà terminée</div>
              <div className="sous">À demain, {confirmation?.prenom} !</div>
            </>
          ) : (
            <>
              <div className="check">✅</div>
              <div className="titre">{LIBELLE_ACTION[confirmation?.action]} enregistré·e</div>
              <div className="heure">{formatHeure(confirmation?.heure)}</div>
              <div className="sous">Bonne journée, {confirmation?.prenom} !</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================
//  TOAST NOTIFICATION PAUSE
// =============================================================
function NotifPauseToast({ notif, onFermer }) {
  const estDebut = notif.type === 'debut'
  return (
    <div className={`notif-pause notif-pause--${notif.type}`} role="alert" aria-live="assertive">
      <span className="notif-pause-icone">{estDebut ? '☕' : '⏳'}</span>
      <p className="notif-pause-message">{notif.message}</p>
      <button className="notif-pause-fermer" onClick={onFermer} aria-label="Fermer">✕</button>
    </div>
  )
}

// =============================================================
//  DASHBOARD PERSONNEL
// =============================================================
function Dashboard({ salarie, pointagesDuJour, site, pauseOk, pauseFinOk, pausesDefaut, onPrenderPause, onTerminerPause, onPlanning, onHistorique, onDeconnecter }) {
  const pts  = [...pointagesDuJour].sort((a, b) => a.timestamp - b.timestamp)
  const etat = etatSalarie(pts)
  const { minutesTravaillees, heureArrivee, heureDepart, enCours } = calculerJournee(pts)
  const info = ETAT_INFOS[etat] || ETAT_INFOS.absent
  const estCollecteur = salarie.role === 'COLLECTEUR'

  const minutesNow = new Date().getHours() * 60 + new Date().getMinutes()
  const prochainePause = pausesDefaut
    .map(p => { const [h, m] = p.debut.split(':').map(Number); return { ...p, debutMin: h * 60 + m } })
    .filter(p => p.debutMin > minutesNow)
    .sort((a, b) => a.debutMin - b.debutMin)[0]

  return (
    <div className="employe-dashboard">
      {/* Identité */}
      <div className="dashboard-identite">
        <div className="dashboard-avatar">{salarie.avatar}</div>
        <div>
          <h2 className="dashboard-nom">{salarie.prenom} {salarie.nom}</h2>
          {site && <p className="muet dashboard-site">📍 {site.nom} · {salarie.heuresHebdo}h/semaine</p>}
          <p className="muet" style={{ fontSize: 12, marginTop: 2 }}>
            {estCollecteur ? '🚛 Collecteur' : '🏭 Opérateur'}
          </p>
        </div>
      </div>

      {/* Statut */}
      <div className={`dashboard-statut statut-${etat}`}>
        <span className="statut-icone">{info.icone}</span>
        <div>
          <div className="statut-label">{info.label}</div>
          {enCours && <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>En cours : {formatDuree(minutesTravaillees)}</div>}
        </div>
      </div>

      {/* KPIs du jour */}
      <div className="grille k3">
        <div className="kpi">
          <div className="v">{heureArrivee ? formatHeure(heureArrivee) : '—'}</div>
          <div className="l">Arrivée</div>
        </div>
        <div className="kpi">
          <div className={`v ${minutesTravaillees > 0 ? 'vert' : ''}`}>
            {minutesTravaillees > 0 ? formatDuree(minutesTravaillees) : '—'}
          </div>
          <div className="l">Temps travaillé</div>
        </div>
        <div className="kpi">
          <div className="v">
            {heureDepart
              ? formatHeure(heureDepart)
              : enCours
                ? <span style={{ color: 'var(--orange)', fontSize: 22 }}>En cours</span>
                : '—'}
          </div>
          <div className="l">Départ</div>
        </div>
      </div>

      {/* Bouton Prendre ma pause — Collecteurs uniquement */}
      {etat === 'present' && estCollecteur && (
        <div style={{ textAlign: 'center' }}>
          {pauseOk ? (
            <div className="pause-succes">☕ Pause enregistrée !</div>
          ) : (
            <button className="btn-pause-manuel" onClick={onPrenderPause}>
              ☕ Prendre ma pause
            </button>
          )}
          {prochainePause && !pauseOk && (
            <p className="muet" style={{ fontSize: 13, marginTop: 8 }}>
              Prochaine pause collective : {prochainePause.label} à {prochainePause.debut}
            </p>
          )}
        </div>
      )}

      {/* Bouton Terminer ma pause — Collecteurs uniquement */}
      {etat === 'en_pause' && estCollecteur && (
        <div style={{ textAlign: 'center' }}>
          {pauseFinOk ? (
            <div className="pause-succes">✅ Retour au poste enregistré !</div>
          ) : (
            <button className="btn-terminer-pause" onClick={onTerminerPause}>
              ✅ Terminer ma pause
            </button>
          )}
        </div>
      )}

      {/* Rappel pauses planifiées — Opérateurs (pas de bouton, seulement info) */}
      {etat === 'present' && !estCollecteur && prochainePause && (
        <div className="carte" style={{ textAlign: 'center', padding: '14px 20px', background: 'var(--creme)' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>⏰ Prochaine pause</p>
          <p className="muet" style={{ margin: '4px 0 0', fontSize: 14 }}>
            {prochainePause.label} · {prochainePause.debut} → {prochainePause.fin}
          </p>
          <p className="muet" style={{ fontSize: 12, marginTop: 4 }}>
            Le pointage de pause se fait sur la badgeuse physique.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="grille k2 nav-cards-grid">
        <button className="nav-card" onClick={onPlanning}>
          <span className="nav-card-icone">📅</span>
          <span className="nav-card-label">Mon Planning</span>
          <span className="nav-card-desc">Horaires de la semaine</span>
        </button>
        <button className="nav-card" onClick={onHistorique}>
          <span className="nav-card-icone">📋</span>
          <span className="nav-card-label">Mon Historique</span>
          <span className="nav-card-desc">Heures pointées</span>
        </button>
      </div>

      <div className="mt center">
        <button className="btn gris" onClick={onDeconnecter}>Déconnexion</button>
      </div>
    </div>
  )
}

// =============================================================
//  MON PLANNING
// =============================================================
function MonPlanning({ salarie, planning, pausesDefaut, decalage, onDecalage, onRetour }) {
  const dateRef = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + decalage * 7)
    return d
  }, [decalage])

  const jours    = joursDeLaSemaine(dateRef)
  const creneaux = planning[salarie.id] || []
  const cleAujourdhui = dateKey(new Date())

  const totalPlanifie = creneaux.reduce((acc, c) => {
    if (!c || !c.includes('-')) return acc
    const [a, b] = c.split('-')
    const [h1, m1] = a.split(':').map(Number)
    const [h2, m2] = b.split(':').map(Number)
    return acc + (h2 * 60 + m2 - (h1 * 60 + m1))
  }, 0)

  return (
    <div className="employe-section">
      <div className="flex between wrap mb">
        <h2 style={{ margin: 0 }}>📅 Mon Planning</h2>
        <div className="flex">
          <button className="btn gris mini" onClick={() => onDecalage(d => d - 1)}>← Semaine préc.</button>
          <button className="btn gris mini" onClick={() => onDecalage(d => d + 1)} disabled={decalage >= 0}>Suiv. →</button>
        </div>
      </div>

      <div className="planning-semaine">
        {jours.slice(0, 5).map((cle, idx) => {
          const creneau    = creneaux[idx] || null
          const estAujourd = cle === cleAujourdhui
          return (
            <div key={cle} className={`planning-jour ${estAujourd ? 'planning-jour--actif' : ''}`}>
              <div className="planning-jour-entete">
                <div>
                  <span className="planning-jour-nom">{JOURS_NOMS[idx]}</span>
                  <span className="muet" style={{ fontSize: 12, marginLeft: 8 }}>{nomJourCourt(cle)}</span>
                </div>
                {estAujourd && <span className="badge-aujourd-hui">Aujourd'hui</span>}
              </div>
              {creneau ? (
                <div className="planning-creneau-zone">
                  <BarreHoraire creneau={creneau} pausesDefaut={pausesDefaut} />
                  <span className="planning-heures">{creneau}</span>
                </div>
              ) : (
                <div className="planning-repos">😴 Repos</div>
              )}
            </div>
          )
        })}
      </div>

      {pausesDefaut.length > 0 && (
        <div className="carte" style={{ marginTop: 16, padding: '14px 20px' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--texte-doux)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
            Pauses collectives
          </h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {pausesDefaut.map(p => (
              <span key={p.id} className="pause-chip">☕ {p.label} · {p.debut}–{p.fin}</span>
            ))}
          </div>
        </div>
      )}

      {totalPlanifie > 0 && (
        <div className="carte" style={{ textAlign: 'center', padding: '14px 20px', marginTop: 12 }}>
          <strong>Total planifié :</strong> {formatDuree(totalPlanifie)}
          <span className="muet"> (contrat {salarie.heuresHebdo}h)</span>
        </div>
      )}

      <div className="mt center">
        <button className="retour" onClick={onRetour}>← Retour</button>
      </div>
    </div>
  )
}

// =============================================================
//  FEEDBACK FIN DE JOURNÉE
// =============================================================
const LABELS_NOTE = {
  1: '😔 Journée difficile',
  2: '😕 Pas terrible…',
  3: '😐 Journée correcte',
  4: '😊 Bonne journée !',
  5: '🤩 Excellente journée !',
}

function FeedbackJournee({ salarie, onSoumettre, onPasser }) {
  const [note, setNote] = useState(0)
  const [survol, setSurvol] = useState(0)
  const [commentaire, setCommentaire] = useState('')

  const noteAffichee = survol || note

  return (
    <div className="feedback-zone">
      <div style={{ fontSize: 56, lineHeight: 1 }}>{salarie.avatar}</div>
      <div>
        <h2 className="feedback-titre">Comment s'est passée ta journée ?</h2>
        <p className="muet" style={{ margin: '6px 0 0', fontSize: 14 }}>
          Facultatif — aide-nous à améliorer tes conditions de travail
        </p>
      </div>

      <div className="feedback-etoiles">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            className={`feedback-etoile${noteAffichee >= n ? ' active' : ''}`}
            onMouseEnter={() => setSurvol(n)}
            onMouseLeave={() => setSurvol(0)}
            onClick={() => setNote(note === n ? 0 : n)}
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          >
            ⭐
          </button>
        ))}
      </div>

      {noteAffichee > 0 && (
        <p className="feedback-label-note">{LABELS_NOTE[noteAffichee]}</p>
      )}

      {note > 0 && (
        <div style={{ width: '100%', animation: 'monteFondu .3s ease both' }}>
          <textarea
            className="feedback-commentaire"
            placeholder="Un commentaire ? (facultatif)"
            value={commentaire}
            onChange={e => setCommentaire(e.target.value)}
            maxLength={500}
          />
        </div>
      )}

      <div className="feedback-actions">
        <button
          className="btn large"
          disabled={note === 0}
          onClick={() => onSoumettre(note, commentaire)}
          style={{ width: '100%' }}
        >
          Envoyer mon feedback
        </button>
        <button className="btn gris" onClick={onPasser} style={{ width: '100%' }}>
          Passer
        </button>
      </div>
    </div>
  )
}

function BarreHoraire({ creneau, pausesDefaut = [] }) {
  if (!creneau || !creneau.includes('-')) return null
  const [a, b]  = creneau.split('-')
  const [h1,m1] = a.split(':').map(Number)
  const [h2,m2] = b.split(':').map(Number)
  const BASE    = 6 * 60
  const FENETRE = 14 * 60
  const left    = Math.max(0, (h1 * 60 + m1 - BASE) / FENETRE * 100)
  const width   = Math.min(100 - left, (h2 * 60 + m2 - (h1 * 60 + m1)) / FENETRE * 100)

  return (
    <div className="barre-horaire">
      <div className="barre-horaire-fond" />
      <div className="barre-horaire-active" style={{ left: `${left}%`, width: `${width}%` }} />
      {pausesDefaut.map(p => {
        const [ph, pm] = p.debut.split(':').map(Number)
        const pLeft = Math.max(0, (ph * 60 + pm - BASE) / FENETRE * 100)
        if (pLeft < left || pLeft > left + width) return null
        return (
          <span key={p.id} className="barre-pause-marque" title={`${p.label} (${p.debut})`} style={{ left: `${pLeft}%` }} />
        )
      })}
      <span className="barre-horaire-label barre-debut">{a}</span>
      <span className="barre-horaire-label barre-fin">{b}</span>
    </div>
  )
}

// =============================================================
//  MON HISTORIQUE
// =============================================================
function MonHistorique({ salarie, pointages, decalage, onDecalage, onRetour }) {
  const dateRef = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + decalage * 7)
    return d
  }, [decalage])

  const jours = joursDeLaSemaine(dateRef)
  const { totalMinutes } = totalSemaine(pointages, salarie.id, dateRef)
  const cleAujourdhui = dateKey(new Date())

  const pointagesParJour = useMemo(() => {
    const map = {}
    for (const p of pointages) {
      if (p.salarieId !== salarie.id) continue
      if (!jours.includes(p.cle)) continue
      ;(map[p.cle] ||= []).push(p)
    }
    return map
  }, [pointages, salarie.id, jours])

  return (
    <div className="employe-section">
      <div className="flex between wrap mb">
        <h2 style={{ margin: 0 }}>📋 Mon Historique</h2>
        <div className="flex">
          <button className="btn gris mini" onClick={() => onDecalage(d => d - 1)}>← Semaine préc.</button>
          <button className="btn gris mini" onClick={() => onDecalage(d => d + 1)} disabled={decalage >= 0}>Suiv. →</button>
        </div>
      </div>

      <div className="historique-liste">
        {jours.slice(0, 5).map((cle, idx) => {
          const pts = (pointagesParJour[cle] || []).sort((a, b) => a.timestamp - b.timestamp)
          const r   = calculerJournee(pts)
          const estAujourd = cle === cleAujourdhui
          const derniereArrivee = [...pts].reverse().find(p => p.type === 'arrivee')
          const epi = derniereArrivee?.epi || null

          const pauses = []
          let debutPause = null
          for (const p of pts) {
            if (p.type === 'pause_debut') { debutPause = p.timestamp }
            else if (p.type === 'pause_fin' && debutPause != null) {
              pauses.push({ debut: debutPause, fin: p.timestamp })
              debutPause = null
            }
          }

          return (
            <div
              key={cle}
              className={`historique-jour ${estAujourd ? 'historique-jour--actif' : ''} ${pts.length === 0 ? 'historique-jour--vide' : ''}`}
            >
              <div className="historique-jour-entete">
                <div>
                  <span className="historique-jour-nom">{JOURS_NOMS[idx]}</span>
                  <span className="muet historique-jour-date">{nomJourCourt(cle)}</span>
                </div>
                {estAujourd && <span className="badge-aujourd-hui">Aujourd'hui</span>}
              </div>

              {pts.length === 0 ? (
                <p className="muet" style={{ margin: '8px 0 0', fontSize: 14 }}>Aucun pointage</p>
              ) : (
                <div className="historique-donnees">
                  <div className="historique-kpis">
                    <div className="historique-kpi">
                      <span>🟢</span>
                      <div>
                        <div className="historique-kpi-val">{r.heureArrivee ? formatHeure(r.heureArrivee) : '—'}</div>
                        <div className="historique-kpi-label">Arrivée</div>
                      </div>
                    </div>
                    <div className="historique-kpi">
                      <span>🏁</span>
                      <div>
                        <div className="historique-kpi-val">
                          {r.heureDepart ? formatHeure(r.heureDepart) : r.enCours ? <span style={{ color: 'var(--orange)' }}>En cours</span> : '—'}
                        </div>
                        <div className="historique-kpi-label">Départ</div>
                      </div>
                    </div>
                    <div className="historique-kpi">
                      <span>⏱️</span>
                      <div>
                        <div className="historique-kpi-val" style={{ color: r.minutesTravaillees > 0 ? 'var(--vert)' : undefined }}>
                          {r.minutesTravaillees > 0 ? formatDuree(r.minutesTravaillees) : '—'}
                        </div>
                        <div className="historique-kpi-label">Travaillé</div>
                      </div>
                    </div>
                  </div>

                  {pauses.length > 0 && (
                    <div className="historique-pauses">
                      <span>☕ </span>
                      {pauses.map((p, i) => (
                        <span key={i} className="muet" style={{ fontSize: 13 }}>
                          {formatHeure(p.debut)} → {formatHeure(p.fin)} ({formatDuree((p.fin - p.debut) / 60000)})
                          {i < pauses.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {epi && (
                    <div className="historique-epi">
                      <span className="muet" style={{ fontSize: 13 }}>EPI :</span>
                      <span style={{ opacity: epi.gilet  ? 1 : 0.2 }}>🦺</span>
                      <span style={{ opacity: epi.bottes ? 1 : 0.2 }}>🥾</span>
                      <span style={{ opacity: epi.casque ? 1 : 0.2 }}>⛑️</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="carte" style={{ textAlign: 'center', padding: '14px 20px', marginTop: 16 }}>
        <strong>Total semaine :</strong> {formatDuree(totalMinutes)}
        <span className="muet"> / {salarie.heuresHebdo}h prévues</span>
      </div>

      <div className="mt center">
        <button className="retour" onClick={onRetour}>← Retour</button>
      </div>
    </div>
  )
}
