// =============================================================
//  time.js — Fonctions utilitaires pour les dates, heures et
//  le calcul du temps de travail.
//  Fuseau de référence : Europe/Paris. Format 24 h.
// =============================================================

// Renvoie la date du jour au format "AAAA-MM-JJ" (clé de journée).
export function dateKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${j}`
}

// Formate une heure en "HH:MM" (24 h).
export function formatHeure(ts) {
  if (!ts) return '--:--'
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// Formate une date en toutes lettres : "lundi 9 juin 2026".
export function formatDateLongue(d = new Date()) {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Formate une durée exprimée en minutes en "Xh YYmin".
export function formatDuree(minutes) {
  if (minutes == null || isNaN(minutes) || minutes < 0) return '0h 00min'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h ${String(m).padStart(2, '0')}min`
}

// Convertit une durée en minutes vers un nombre d'heures décimales
// (utile pour l'export paie : 7h30 -> 7.50).
export function minutesEnHeuresDecimales(minutes) {
  if (!minutes || minutes < 0) return 0
  return Math.round((minutes / 60) * 100) / 100
}

// -------------------------------------------------------------
//  Calcul du temps travaillé sur UNE journée.
//  Entrée : tableau de pointages d'un salarié pour une journée,
//  chacun ayant { type, timestamp }.
//  Types possibles : 'arrivee', 'pause_debut', 'pause_fin', 'depart'.
//
//  Règle : temps travaillé = (départ − arrivée) − somme des pauses.
//  Gère les cas limites : départ manquant, pause non clôturée,
//  journée à cheval sur minuit (départ < arrivée => +24 h).
// -------------------------------------------------------------
export function calculerJournee(pointages) {
  // On trie par ordre chronologique pour être robuste.
  const p = [...pointages].sort((a, b) => a.timestamp - b.timestamp)

  const arrivee = p.find((x) => x.type === 'arrivee')
  // On prend le DERNIER départ de la journée s'il y en a.
  const departs = p.filter((x) => x.type === 'depart')
  const depart = departs.length ? departs[departs.length - 1] : null

  // Anomalies détectées pendant le calcul.
  const anomalies = []

  if (!arrivee) {
    return {
      minutesTravaillees: 0,
      minutesPause: 0,
      heureArrivee: null,
      heureDepart: depart ? depart.timestamp : null,
      anomalies: depart ? ['Départ sans arrivée'] : [],
      enCours: false,
      complet: false,
    }
  }

  // Calcul du temps de pause total en appariant pause_debut / pause_fin.
  let minutesPause = 0
  let pauseOuverte = null
  for (const e of p) {
    if (e.type === 'pause_debut') {
      pauseOuverte = e.timestamp
    } else if (e.type === 'pause_fin' && pauseOuverte != null) {
      minutesPause += (e.timestamp - pauseOuverte) / 60000
      pauseOuverte = null
    }
  }
  // Pause commencée mais jamais clôturée => anomalie.
  if (pauseOuverte != null) {
    anomalies.push('Pause non clôturée')
  }

  // Si pas encore de départ, le salarié est toujours sur site.
  if (!depart) {
    const maintenant = Date.now()
    let brut = (maintenant - arrivee.timestamp) / 60000
    if (brut < 0) brut = 0
    return {
      minutesTravaillees: Math.max(0, Math.round(brut - minutesPause)),
      minutesPause: Math.round(minutesPause),
      heureArrivee: arrivee.timestamp,
      heureDepart: null,
      anomalies,
      enCours: true,
      complet: false,
    }
  }

  // Journée complète : on calcule la durée brute.
  let brut = (depart.timestamp - arrivee.timestamp) / 60000
  // Cas "à cheval sur minuit" : si le départ est avant l'arrivée,
  // on suppose que le départ a eu lieu le lendemain (+24 h).
  if (brut < 0) {
    brut += 24 * 60
    anomalies.push('Journée à cheval sur minuit')
  }

  const minutesTravaillees = Math.max(0, Math.round(brut - minutesPause))

  return {
    minutesTravaillees,
    minutesPause: Math.round(minutesPause),
    heureArrivee: arrivee.timestamp,
    heureDepart: depart.timestamp,
    anomalies,
    enCours: false,
    complet: true,
  }
}

// -------------------------------------------------------------
//  Détermine l'état courant d'un salarié à partir de ses
//  pointages du jour, pour savoir quelles actions proposer.
//  Retourne : 'absent' | 'present' | 'en_pause' | 'parti'.
// -------------------------------------------------------------
export function etatSalarie(pointagesDuJour) {
  const p = [...pointagesDuJour].sort((a, b) => a.timestamp - b.timestamp)
  if (p.length === 0) return 'absent'
  const dernier = p[p.length - 1].type
  if (dernier === 'depart') return 'parti'
  if (dernier === 'pause_debut') return 'en_pause'
  if (dernier === 'arrivee' || dernier === 'pause_fin') return 'present'
  return 'absent'
}

// Renvoie la liste des actions autorisées selon l'état.
// C'est ce qui empêche un "Départ" sans "Arrivée", etc.
export function actionsAutorisees(etat) {
  switch (etat) {
    case 'absent':
      return ['arrivee']
    case 'present':
      return ['pause_debut', 'depart']
    case 'en_pause':
      return ['pause_fin']
    case 'parti':
      return [] // Journée terminée, plus d'action possible.
    default:
      return []
  }
}

// Libellés lisibles des types de pointage.
export const LIBELLE_ACTION = {
  arrivee: 'Arrivée',
  pause_debut: 'Début de pause',
  pause_fin: 'Fin de pause',
  depart: 'Départ',
}

// Renvoie le lundi (clé de date) de la semaine d'une date donnée.
export function debutSemaine(d = new Date()) {
  const date = new Date(d)
  const jour = (date.getDay() + 6) % 7 // 0 = lundi
  date.setDate(date.getDate() - jour)
  date.setHours(0, 0, 0, 0)
  return date
}

// Renvoie les 7 clés de date (lundi -> dimanche) d'une semaine.
export function joursDeLaSemaine(dateRef = new Date()) {
  const lundi = debutSemaine(dateRef)
  const jours = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(lundi)
    d.setDate(lundi.getDate() + i)
    jours.push(dateKey(d))
  }
  return jours
}

// Nom court du jour à partir d'une clé "AAAA-MM-JJ".
export function nomJourCourt(cle) {
  const [y, m, j] = cle.split('-').map(Number)
  const d = new Date(y, m - 1, j)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}
