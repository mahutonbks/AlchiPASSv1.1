// =============================================================
//  rapports.js — Agrégation des heures, détection d'anomalies
//  et export CSV prêt pour la paie.
// =============================================================

import {
  calculerJournee,
  joursDeLaSemaine,
  dateKey,
  minutesEnHeuresDecimales,
  formatHeure,
} from './time'

// Regroupe les pointages par salarié puis par jour (clé date).
export function grouperParSalarieEtJour(pointages) {
  const map = {}
  for (const p of pointages) {
    map[p.salarieId] ||= {}
    map[p.salarieId][p.cle] ||= []
    map[p.salarieId][p.cle].push(p)
  }
  return map
}

// Total des minutes travaillées par un salarié sur une semaine donnée.
export function totalSemaine(pointages, salarieId, dateRef = new Date()) {
  const jours = joursDeLaSemaine(dateRef)
  const groupes = grouperParSalarieEtJour(pointages)
  const parJour = (groupes[salarieId] || {})
  let total = 0
  const detailJours = {}
  for (const cle of jours) {
    const pts = parJour[cle] || []
    const r = calculerJournee(pts)
    detailJours[cle] = r
    total += r.minutesTravaillees
  }
  return { totalMinutes: total, detailJours }
}

// Détecte les anomalies sur l'ensemble des pointages d'une semaine.
// - départ manquant (présent depuis longtemps sans départ, jour passé)
// - pause non clôturée
// - écart important planning / réel
export function detecterAnomalies(pointages, salaries, planning, dateRef = new Date()) {
  const anomalies = []
  const jours = joursDeLaSemaine(dateRef)
  const cleAujourdhui = dateKey(new Date())
  const groupes = grouperParSalarieEtJour(pointages)

  for (const salarie of salaries) {
    if (!salarie.actif) continue
    const parJour = groupes[salarie.id] || {}

    jours.forEach((cle, indexJour) => {
      const pts = parJour[cle] || []
      if (pts.length === 0) return
      const r = calculerJournee(pts)
      const estPasse = cle < cleAujourdhui

      // Oubli de départ sur un jour déjà passé.
      if (estPasse && r.enCours) {
        anomalies.push({
          type: 'depart_manquant',
          gravite: 'err',
          salarieId: salarie.id,
          salarie: `${salarie.prenom} ${salarie.nom}`,
          cle,
          message: `Départ non pointé le ${cle}`,
        })
      }
      // Pause non clôturée (signalée par le calcul).
      if (r.anomalies.includes('Pause non clôturée') && estPasse) {
        anomalies.push({
          type: 'pause_ouverte',
          gravite: 'warn',
          salarieId: salarie.id,
          salarie: `${salarie.prenom} ${salarie.nom}`,
          cle,
          message: `Pause non clôturée le ${cle}`,
        })
      }
      // Écart planning / réel : si un créneau est prévu ce jour-là.
      const creneau = planning?.[salarie.id]?.[indexJour]
      if (creneau && r.complet) {
        const prevuMin = dureeCreneauMinutes(creneau)
        const ecart = Math.abs(r.minutesTravaillees - prevuMin)
        if (ecart > 90) {
          anomalies.push({
            type: 'ecart_planning',
            gravite: 'warn',
            salarieId: salarie.id,
            salarie: `${salarie.prenom} ${salarie.nom}`,
            cle,
            message: `Écart de ${Math.round(ecart)} min avec le planning le ${cle}`,
          })
        }
      }
    })
  }
  return anomalies
}

// Convertit un créneau "06:00-14:30" en minutes de durée.
function dureeCreneauMinutes(creneau) {
  const [a, b] = creneau.split('-')
  const [h1, m1] = a.split(':').map(Number)
  const [h2, m2] = b.split(':').map(Number)
  return h2 * 60 + m2 - (h1 * 60 + m1)
}

// Échappe une valeur pour le format CSV (gère les points-virgules, guillemets).
function csvCell(v) {
  const s = String(v ?? '')
  if (/[";\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// -------------------------------------------------------------
//  Construit un CSV des totaux d'heures par salarié pour la
//  semaine (une ligne par salarié, détail par jour + total).
//  Séparateur ";" pour une ouverture directe dans Excel FR.
// -------------------------------------------------------------
export function exporterCSVSemaine(pointages, salaries, sites, dateRef = new Date()) {
  const jours = joursDeLaSemaine(dateRef)
  const nomSite = (id) => sites.find((s) => s.id === id)?.nom || ''

  const entete = [
    'Salarié',
    'Site',
    'Contrat (h/sem)',
    ...jours.map((c) => c), // colonnes par jour
    'Total semaine (h)',
  ]
  const lignes = [entete.map(csvCell).join(';')]

  for (const salarie of salaries) {
    if (!salarie.actif) continue
    const { totalMinutes, detailJours } = totalSemaine(pointages, salarie.id, dateRef)
    const cellulesJours = jours.map((cle) =>
      minutesEnHeuresDecimales(detailJours[cle]?.minutesTravaillees || 0)
        .toFixed(2)
        .replace('.', ',')
    )
    const ligne = [
      `${salarie.prenom} ${salarie.nom}`,
      nomSite(salarie.siteId),
      salarie.heuresHebdo,
      ...cellulesJours,
      minutesEnHeuresDecimales(totalMinutes).toFixed(2).replace('.', ','),
    ]
    lignes.push(ligne.map(csvCell).join(';'))
  }

  return lignes.join('\n')
}

// Déclenche le téléchargement d'un fichier CSV dans le navigateur.
export function telechargerCSV(contenu, nomFichier) {
  // BOM UTF-8 pour qu'Excel affiche correctement les accents.
  const blob = new Blob(['\ufeff' + contenu], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
