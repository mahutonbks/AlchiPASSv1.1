import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { dateKey } from '../utils/time'

const AppContext = createContext(null)

const API = '/api'

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erreur ${res.status}`)
  }
  return res.json()
}

export function AppProvider({ children }) {
  const [salaries,      setSalaries]      = useState([])
  const [sites,         setSites]         = useState([])
  const [pointages,     setPointages]     = useState([])
  const [planning,      setPlanning]      = useState({})
  const [pausesDefaut,  setPausesDefaut]  = useState([])
  const [casques,       setCasques]       = useState([])
  const [associations,  setAssociations]  = useState([])
  const [badgesManagers,setBadgesManagers]= useState([])
  const [signalements,  setSignalements]  = useState([])
  const [feedbacks,     setFeedbacks]     = useState([])
  const [chargement,    setChargement]    = useState(true)
  const [erreurAPI,     setErreurAPI]     = useState(null)

  // ── Chargement initial depuis le backend ─────────────────────
  const charger = useCallback(async () => {
    try {
      const [sal, sit, pts, plan, pauses, caqs, assocs, badges, sigs, fbs] = await Promise.all([
        apiFetch('/salaries'),
        apiFetch('/salaries/sites'),
        apiFetch('/pointages'),
        apiFetch('/planning'),
        apiFetch('/pauses'),
        apiFetch('/casques'),
        apiFetch('/casques/associations?date=' + dateKey(new Date())),
        apiFetch('/casques/badges-managers'),
        apiFetch('/signalements'),
        apiFetch('/feedbacks'),
      ])
      setSalaries(sal)
      setSites(sit)
      setPointages(pts)
      setPlanning(plan)
      setPausesDefaut(pauses)
      setCasques(caqs.map(c => ({ ...c, id: c.id_rfid_sticker })))
      setAssociations(assocs)
      setBadgesManagers(badges)
      setSignalements(sigs)
      setFeedbacks(fbs)
      setErreurAPI(null)
    } catch (e) {
      console.error('[API] Chargement impossible :', e)
      setErreurAPI(e.message)
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => { charger() }, [charger])

  // Recharger les pointages après action de la badgeuse physique
  useEffect(() => {
    function onRefresh(e) {
      if (e.detail) setPointages(e.detail)
    }
    window.addEventListener('alchipass:refresh', onRefresh)
    return () => window.removeEventListener('alchipass:refresh', onRefresh)
  }, [])

  // ── Pointages ────────────────────────────────────────────────

  async function ajouterPointage(salarieId, type, epiData, origine = 'pointage') {
    const res = await apiFetch('/pointages', {
      method: 'POST', body: { salarieId, type, epiData, origine },
    })
    setPointages(prev => [...prev, res])
    return res
  }

  async function corrigerPointage(pointageId, nouveauTimestamp, auteur) {
    const res = await apiFetch(`/pointages/${pointageId}`, {
      method: 'PUT', body: { nouveauTimestamp, auteur },
    })
    setPointages(prev => prev.map(p => p.id === pointageId ? res : p))
  }

  async function ajouterPointageManuel(salarieId, type, timestamp, auteur) {
    const res = await apiFetch('/pointages/manuel', {
      method: 'POST', body: { salarieId, type, timestamp, auteur },
    })
    setPointages(prev => [...prev, res])
  }

  async function supprimerPointage(pointageId) {
    await apiFetch(`/pointages/${pointageId}`, { method: 'DELETE' })
    setPointages(prev => prev.filter(p => p.id !== pointageId))
  }

  // ── Salariés ─────────────────────────────────────────────────

  async function ajouterSalarie(salarie) {
    const res = await apiFetch('/salaries', { method: 'POST', body: salarie })
    setSalaries(prev => [...prev, res])
  }

  async function modifierSalarie(id, champs) {
    const salarie = salaries.find(s => s.id === id)
    const res = await apiFetch(`/salaries/${id}`, {
      method: 'PUT', body: { ...salarie, ...champs },
    })
    setSalaries(prev => prev.map(s => s.id === id ? res : s))
  }

  async function basculerActifSalarie(id) {
    const res = await apiFetch(`/salaries/${id}/actif`, { method: 'PATCH' })
    setSalaries(prev => prev.map(s => s.id === id ? { ...s, actif: res.actif } : s))
  }

  // ── Sites ────────────────────────────────────────────────────

  async function ajouterSite(nom) {
    const res = await apiFetch('/salaries/sites', { method: 'POST', body: { nom } })
    setSites(prev => [...prev, res])
  }

  // ── Planning ─────────────────────────────────────────────────

  async function definirCreneau(salarieId, jourIndex, creneau) {
    const creneaux = Array(7).fill(null)
    const actuel = planning[salarieId] || []
    actuel.forEach((c, i) => { creneaux[i] = c })
    creneaux[jourIndex] = creneau || null

    await apiFetch(`/planning/${salarieId}`, { method: 'PUT', body: { creneaux } })
    setPlanning(prev => ({ ...prev, [salarieId]: creneaux }))
  }

  // ── Casques RFID ─────────────────────────────────────────────

  async function ajouterCasque(casque) {
    const res = await apiFetch('/casques', { method: 'POST', body: casque })
    setCasques(prev => [...prev, { ...res, id: res.id_rfid_sticker }])
  }

  async function modifierCasque(id, champs) {
    const casque = casques.find(c => c.id === id)
    const res = await apiFetch(`/casques/${id}`, {
      method: 'PUT', body: { ...casque, ...champs },
    })
    setCasques(prev => prev.map(c => c.id === id ? { ...res, id: res.id_rfid_sticker } : c))
  }

  async function supprimerCasque(id) {
    await apiFetch(`/casques/${id}`, { method: 'DELETE' })
    setCasques(prev => prev.filter(c => c.id !== id))
    setAssociations(prev => prev.filter(a => a.id_rfid_sticker !== id))
  }

  // ── Badges managers ───────────────────────────────────────────

  async function ajouterBadgeManager(uid_rfid, role, label) {
    const res = await apiFetch('/casques/badges-managers', {
      method: 'POST', body: { uid_rfid, role, label },
    })
    setBadgesManagers(prev => {
      const autres = prev.filter(b => b.uid_rfid !== uid_rfid)
      return [...autres, res]
    })
  }

  async function supprimerBadgeManager(uid_rfid) {
    await apiFetch(`/casques/badges-managers/${encodeURIComponent(uid_rfid)}`, { method: 'DELETE' })
    setBadgesManagers(prev => prev.filter(b => b.uid_rfid !== uid_rfid))
  }

  // ── Associations journalières ─────────────────────────────────

  async function associerCasque(id_salarie, id_rfid_sticker) {
    if (!id_rfid_sticker) {
      const assoc = associations.find(
        a => a.id_salarie === id_salarie && a.date_association === dateKey(new Date())
      )
      if (assoc) {
        await apiFetch(`/casques/associations/${assoc.id}`, { method: 'DELETE' })
        setAssociations(prev => prev.filter(a => a.id !== assoc.id))
      }
      return
    }
    const res = await apiFetch('/casques/associations', {
      method: 'POST', body: { id_salarie, id_rfid_sticker },
    })
    setAssociations(prev => {
      const today = dateKey(new Date())
      const autres = prev.filter(a => !(a.id_salarie === id_salarie && a.date_association === today))
      return [...autres, res]
    })
  }

  // ── Pauses par défaut ────────────────────────────────────────

  async function modifierPauseDefaut(id, champs) {
    const pause = pausesDefaut.find(p => p.id === id)
    const res = await apiFetch(`/pauses/${id}`, {
      method: 'PUT', body: { ...pause, ...champs },
    })
    setPausesDefaut(prev => prev.map(p => p.id === id ? res : p))
  }

  // ── Signalements EPI ─────────────────────────────────────────

  async function signalerRenouvellementEPI(salarieId, equipements, details) {
    const res = await apiFetch('/signalements', {
      method: 'POST', body: { salarieId, equipements, details },
    })
    setSignalements(prev => [...prev, res])
  }

  async function marquerSignalementTraite(sigId) {
    await apiFetch(`/signalements/${sigId}/traite`, { method: 'PATCH' })
    setSignalements(prev => prev.map(s => s.id === sigId ? { ...s, statut: 'traite', traite: true } : s))
  }

  // ── Feedbacks fin de journée ─────────────────────────────────

  async function ajouterFeedback(salarieId, note, commentaire = '') {
    const res = await apiFetch('/feedbacks', {
      method: 'POST', body: { salarieId, note, commentaire },
    })
    setFeedbacks(prev => [res, ...prev])
  }

  // ── Réinitialisation ─────────────────────────────────────────

  async function reinitialiserDemo() {
    await charger()
  }

  const valeur = {
    sites, salaries, pointages, planning, pausesDefaut,
    casques, associations, badgesManagers, signalements, feedbacks,
    chargement, erreurAPI,
    ajouterPointage, corrigerPointage, ajouterPointageManuel, supprimerPointage,
    ajouterSalarie, modifierSalarie, basculerActifSalarie,
    ajouterSite, definirCreneau,
    ajouterCasque, modifierCasque, supprimerCasque, associerCasque,
    ajouterBadgeManager, supprimerBadgeManager,
    modifierPauseDefaut,
    signalerRenouvellementEPI, marquerSignalementTraite,
    ajouterFeedback,
    reinitialiserDemo,
  }

  return <AppContext.Provider value={valeur}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp doit être utilisé dans AppProvider')
  return ctx
}
