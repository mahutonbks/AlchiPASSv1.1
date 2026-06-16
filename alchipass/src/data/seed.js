// =============================================================
//  seed.js — Données de démonstration pré-remplies.
//  Génère 3 sites, 8 salariés et une semaine de pointages
//  réalistes pour que la démo soit immédiatement exploitable.
// =============================================================

import { dateKey, debutSemaine } from '../utils/time'

// --- 3 sites des Alchimistes Côte d'Azur ---
export const SITES_DEMO = [
  { id: 'site-farlede', nom: 'La Farlède' },
  { id: 'site-cuers', nom: 'Cuers' },
  { id: 'site-puget', nom: 'Puget-sur-Argens' },
]

// --- 8 salariés fictifs répartis sur les sites ---
// PIN par défaut : 1234. heuresHebdo = contrat (base 35 h).
export const SALARIES_DEMO = [
  { id: 'emp-1', prenom: 'Karim', nom: 'Benali', siteId: 'site-farlede', pin: '1234', heuresHebdo: 35, actif: true, avatar: '🧑🏽‍🌾' },
  { id: 'emp-2', prenom: 'Sophie', nom: 'Martin', siteId: 'site-farlede', pin: '1234', heuresHebdo: 35, actif: true, avatar: '👩🏼‍🔧' },
  { id: 'emp-3', prenom: 'Mehdi', nom: 'Roux', siteId: 'site-farlede', pin: '1234', heuresHebdo: 28, actif: true, avatar: '🧑🏻‍🏭' },
  { id: 'emp-4', prenom: 'Inès', nom: 'Garcia', siteId: 'site-cuers', pin: '1234', heuresHebdo: 35, actif: true, avatar: '👩🏽‍🌾' },
  { id: 'emp-5', prenom: 'Lucas', nom: 'Petit', siteId: 'site-cuers', pin: '1234', heuresHebdo: 35, actif: true, avatar: '🧑🏼‍🏭' },
  { id: 'emp-6', prenom: 'Fatou', nom: 'Diallo', siteId: 'site-puget', pin: '1234', heuresHebdo: 35, actif: true, avatar: '👩🏿‍🔧' },
  { id: 'emp-7', prenom: 'Thomas', nom: 'Lefèvre', siteId: 'site-puget', pin: '1234', heuresHebdo: 21, actif: true, avatar: '🧑🏻‍🌾' },
  { id: 'emp-8', prenom: 'Léa', nom: 'Moreau', siteId: 'site-cuers', pin: '1234', heuresHebdo: 35, actif: true, avatar: '👩🏻‍🏭' },
]

// --- Compte administrateur ---
export const ADMIN_DEMO = { identifiant: 'admin', motDePasse: 'alchipass2026' }

// --- Créneaux de pauses collectives par défaut ---
export const PAUSES_DEFAUT = [
  { id: 'pause-matin', label: 'Pause matin',      debut: '10:30', fin: '10:45' },
  { id: 'pause-midi',  label: 'Pause déjeuner',   debut: '12:30', fin: '13:00' },
]

// --- Casques RFID (un sticker RC522 par casque physique) ---
export const CASQUES_DEMO = SALARIES_DEMO.map((s, i) => ({
  id: `rfid-${i + 1}`,
  uid_rfid: `04${String(i + 1).padStart(2, '0')}ABCDEF`,   // ex : "0401ABCDEF"
  num_interne_casque: `C-${String(i + 1).padStart(3, '0')}`,
  etat: 'actif',   // 'actif' | 'defectueux' | 'inactif'
}))

// --- Badges RFID des managers (cartes, pas des casques) ---
export const BADGES_MANAGERS = [
  { uid_rfid: '04RHMANAGER0', role: 'rh',    label: 'Carte RH' },
  { uid_rfid: '04ADMINCARDO', role: 'admin', label: 'Carte Admin' },
]

// --- Associations journalières : quel salarié porte quel casque aujourd'hui ---
export function genererAssociationsDemo() {
  const today = dateKey(new Date())
  return SALARIES_DEMO.map((s, i) => ({
    id: `assoc-demo-${i + 1}`,
    id_salarie: s.id,
    id_rfid_sticker: CASQUES_DEMO[i].id,
    date_association: today,
  }))
}

// Fabrique un timestamp à une heure/minute données pour une clé de date.
function ts(cle, heure, minute) {
  const [y, m, j] = cle.split('-').map(Number)
  return new Date(y, m - 1, j, heure, minute, 0, 0).getTime()
}

// Petite variation aléatoire (en minutes) pour rendre les données réalistes.
function jitter(max) {
  return Math.floor(Math.random() * max)
}

// -------------------------------------------------------------
//  Génère une semaine de pointages réalistes (lundi -> vendredi)
//  pour les salariés actifs. Arrivées 6h-8h, pauses 30-60 min,
//  départs 14h-17h. La journée du jour est laissée "en cours"
//  pour quelques salariés afin que le tableau de bord temps réel
//  ait des présents/en pause à montrer.
// -------------------------------------------------------------
export function genererPointagesDemo() {
  const pointages = []
  let compteur = 1
  const lundi = debutSemaine(new Date())
  const cleAujourdhui = dateKey(new Date())

  const ajouter = (empId, siteId, cle, type, t) => {
    pointages.push({
      id: `pt-${compteur++}`,
      salarieId: empId,
      siteId,
      type,
      timestamp: t,
      cle,
      origine: 'pointage', // 'pointage' (borne) ou 'correction' (admin)
    })
  }

  for (let i = 0; i < 5; i++) {
    // Lundi à vendredi
    const d = new Date(lundi)
    d.setDate(lundi.getDate() + i)
    const cle = dateKey(d)
    const estAujourdhui = cle === cleAujourdhui
    // Si la date est dans le futur (semaine en cours pas finie), on s'arrête.
    if (d.setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0)) break

    SALARIES_DEMO.forEach((emp, idx) => {
      if (!emp.actif) return
      // Temps partiels : un jour off dans la semaine.
      if (emp.heuresHebdo < 35 && i === 4) return

      const heureArr = 6 + (idx % 3) // 6, 7 ou 8 h
      const minArr = jitter(20)
      ajouter(emp.id, emp.siteId, cle, 'arrivee', ts(cle, heureArr, minArr))

      // Si c'est aujourd'hui, on laisse certains salariés "en cours".
      if (estAujourdhui) {
        // emp-2 : actuellement en pause (a pointé début de pause, pas la fin)
        if (emp.id === 'emp-2') {
          ajouter(emp.id, emp.siteId, cle, 'pause_debut', ts(cle, 11, 30))
          return
        }
        // emp-1, emp-4, emp-6 : présents, sans départ (toujours sur site)
        if (['emp-1', 'emp-4', 'emp-6'].includes(emp.id)) {
          ajouter(emp.id, emp.siteId, cle, 'pause_debut', ts(cle, 9, 30))
          ajouter(emp.id, emp.siteId, cle, 'pause_fin', ts(cle, 10, 0))
          return
        }
        // emp-7 : a oublié de pointer son départ hier -> on simule juste arrivée aujourd'hui puis rien
        // Les autres ont une journée complète même aujourd'hui.
      }

      // Pause déjeuner 30-60 min
      const heurePause = 11 + (idx % 2)
      const minPause = jitter(30)
      const dureePause = 30 + jitter(30)
      const debutPause = ts(cle, heurePause, minPause)
      ajouter(emp.id, emp.siteId, cle, 'pause_debut', debutPause)
      ajouter(emp.id, emp.siteId, cle, 'pause_fin', debutPause + dureePause * 60000)

      // Départ 14h-17h
      const heureDep = 14 + (idx % 3)
      const minDep = jitter(40)
      ajouter(emp.id, emp.siteId, cle, 'depart', ts(cle, heureDep, minDep))
    })
  }

  return pointages
}

// -------------------------------------------------------------
//  Planning hebdomadaire de démonstration : horaires prévus
//  par salarié et par jour (0 = lundi ... 4 = vendredi).
//  Format : { salarieId: { 0: '06:00-14:00', ... } }
// -------------------------------------------------------------
export function genererPlanningDemo() {
  const planning = {}
  SALARIES_DEMO.forEach((emp, idx) => {
    const debut = 6 + (idx % 3)
    const creneau = `${String(debut).padStart(2, '0')}:00-${String(debut + 7).padStart(2, '0')}:30`
    planning[emp.id] = {}
    const nbJours = emp.heuresHebdo < 35 ? 4 : 5
    for (let j = 0; j < nbJours; j++) {
      planning[emp.id][j] = creneau
    }
  })
  return planning
}
