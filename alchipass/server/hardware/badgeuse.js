// =============================================================
//  badgeuse.js — Orchestrateur physique de la borne de pointage.
//
//  Workflow :
//    1. Lecture RFID -> identification du salarie via la DB
//    2. Calcul de l'etat courant (absent / present / en_pause / parti)
//    3a. Arrivee / Retour de pause -> validation EPI via Digicode
//        (touches 1=Gilet, 2=Bottes, 3=Casque, 4=Valider, *=Reset)
//    3b. Present -> choix via Digicode (1=Pause, 2=Depart)
//    4. Enregistrement en base de donnees
//    5. Emission Socket.io -> mise a jour temps reel du dashboard web
// =============================================================

import db from '../database.js'
import { initRFID, demarrerPolling } from './rfid.js'
import { initKeypad, lireTouche }    from './keypad.js'

// Touches EPI sur le Digicode
const TOUCHE_EPI   = { '1': 'gilet', '2': 'bottes', '3': 'casque' }
const TOUCHE_VALID = '4'
const TOUCHE_RESET = '*'

// Delai avant annulation automatique (30 s)
const TIMEOUT_SAISIE_MS = 30_000

// Indique si le keypad GPIO est disponible (mis a jour lors de l'init)
let keypadActif = false

// ── Utilitaires DB ───────────────────────────────────────────

function dateKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10)
}

function trouverSalarieParUID(uid) {
  const cleJour = dateKey()

  const manager = db.prepare('SELECT * FROM badges_managers WHERE uid_rfid = ?').get(uid)
  if (manager) return { type: 'manager', role: manager.role, label: manager.label }

  const casque = db.prepare('SELECT * FROM casques WHERE uid_rfid = ?').get(uid)
  if (!casque) return null

  const assoc = db.prepare(
    'SELECT * FROM associations_journalieres WHERE id_rfid_sticker = ? AND date_association = ?'
  ).get(casque.id_rfid_sticker, cleJour)
  if (!assoc) return null

  const salarie = db.prepare('SELECT * FROM salaries WHERE id_salarie = ? AND actif = 1').get(assoc.id_salarie)
  if (!salarie) return null

  return { type: 'salarie', salarie }
}

function etatActuel(salarieId) {
  const cle = dateKey()
  const pts  = db.prepare(
    'SELECT type_evenement FROM badgeages_reels WHERE id_salarie = ? AND cle_date = ? ORDER BY date_heure_action'
  ).all(salarieId, cle)

  let etat = 'absent'
  for (const { type_evenement: t } of pts) {
    if      (t === 'Arrivee')     etat = 'present'
    else if (t === 'Pause')       etat = 'en_pause'
    else if (t === 'RetourPause') etat = 'present'
    else if (t === 'Depart')      etat = 'parti'
    // Gestion des noms stockes avec accents
    else if (t === 'Arrivée') etat = 'present'
    else if (t === 'Départ')  etat = 'parti'
  }
  return etat
}

function enregistrerPointage(salarieId, type, epiData) {
  const salarie = db.prepare('SELECT * FROM salaries WHERE id_salarie = ?').get(salarieId)
  const now     = Date.now()
  const id      = `pt-hw-${now}-${Math.floor(Math.random() * 1000)}`
  const epi     = epiData || {}

  const MAP_TYPE = {
    arrivee:     'Arrivée',
    pause_debut: 'Pause',
    pause_fin:   'RetourPause',
    depart:      'Départ',
  }
  const typeDB = MAP_TYPE[type] || type

  db.prepare(`
    INSERT INTO badgeages_reels
      (id_badgeage, id_salarie, site_id, date_heure_action, type_evenement,
       epi_gilet, epi_bottes, epi_casque, origine, cle_date, modifications)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, salarieId, salarie.site_id, now, typeDB,
    epi.gilet  ? 1 : 0,
    epi.bottes ? 1 : 0,
    epi.casque ? 1 : 0,
    'badgeuse', dateKey(now), '[]'
  )

  return { id, salarieId, type, timestamp: now, epi }
}

// ── Validation EPI via Digicode ──────────────────────────────
// Retourne { gilet, bottes, casque } si valide, null si timeout/annule.
function attendreValidationEPI() {
  return new Promise((resolve) => {
    if (!keypadActif) {
      // Simulation : EPI valides automatiquement
      resolve({ gilet: true, bottes: true, casque: true })
      return
    }

    const epi    = { gilet: false, bottes: false, casque: false }
    let termine  = false

    const timer = setTimeout(() => {
      if (!termine) { termine = true; clearInterval(poll); resolve(null) }
    }, TIMEOUT_SAISIE_MS)

    const poll = setInterval(() => {
      if (termine) return
      const t = lireTouche()
      if (!t) return

      if (t === TOUCHE_RESET) {
        epi.gilet = false; epi.bottes = false; epi.casque = false
        console.log('[EPI] Reinitialise.')
      } else if (TOUCHE_EPI[t]) {
        const item = TOUCHE_EPI[t]
        epi[item]  = !epi[item]
        console.log(`[EPI] ${item} -> ${epi[item] ? 'OK' : 'vide'}`)
      } else if (t === TOUCHE_VALID) {
        clearInterval(poll)
        clearTimeout(timer)
        termine = true
        resolve(epi)
      }
    }, 80)
  })
}

// ── Choix d'action via Digicode (etat present) ───────────────
// Retourne 'pause_debut' | 'depart' | null si timeout.
function attendreChoixAction() {
  return new Promise((resolve) => {
    if (!keypadActif) {
      // Sans keypad, pas d'action physique possible en mode present
      resolve(null)
      return
    }

    let termine = false
    console.log('[Badgeuse] 1=Pause  2=Depart  *=Annuler')

    const timer = setTimeout(() => {
      if (!termine) { termine = true; clearInterval(poll); resolve(null) }
    }, TIMEOUT_SAISIE_MS)

    const poll = setInterval(() => {
      if (termine) return
      const t = lireTouche()
      if (!t) return
      clearInterval(poll)
      clearTimeout(timer)
      termine = true
      if      (t === '1') resolve('pause_debut')
      else if (t === '2') resolve('depart')
      else                resolve(null)
    }, 80)
  })
}

// ── Handler principal badge ───────────────────────────────────
export function creerHandlerBadgeuse(io) {
  return async function handlerBadge(uid) {
    console.log(`\n[Badgeuse] Badge UID : ${uid}`)

    const trouve = trouverSalarieParUID(uid)

    if (!trouve) {
      console.warn('[Badgeuse] UID inconnu - aucune association aujourd\'hui.')
      io.emit('rfid:badge', { uid, inconnu: true })
      return
    }

    if (trouve.type === 'manager') {
      console.log(`[Badgeuse] Badge manager : ${trouve.role}`)
      io.emit('rfid:badge', { uid, manager: true, role: trouve.role })
      return
    }

    const { salarie } = trouve
    const etat = etatActuel(salarie.id_salarie)
    console.log(`[Badgeuse] ${salarie.prenom} ${salarie.nom} - etat : ${etat}`)

    if (etat === 'parti') {
      io.emit('badgeuse:confirme', {
        salarieId: salarie.id_salarie,
        prenom:    salarie.prenom,
        parti:     true,
      })
      return
    }

    let typeAction = null
    let epiData    = {}

    if (etat === 'absent' || etat === 'en_pause') {
      const action = etat === 'absent' ? 'arrivee' : 'pause_fin'
      console.log(`[Badgeuse] Verification EPI (${action})...`)
      console.log('[Badgeuse] 1=Gilet  2=Bottes  3=Casque  4=Valider  *=Reset')

      const result = await attendreValidationEPI()
      if (!result) {
        console.warn('[Badgeuse] Timeout EPI - annulation.')
        return
      }
      typeAction = action
      epiData    = result

    } else if (etat === 'present') {
      const choix = await attendreChoixAction()
      if (!choix) {
        console.warn('[Badgeuse] Timeout choix ou annulation.')
        return
      }
      typeAction = choix
    }

    if (!typeAction) return

    const pointage = enregistrerPointage(salarie.id_salarie, typeAction, epiData)
    console.log(`[Badgeuse] Pointe : ${typeAction} @ ${new Date(pointage.timestamp).toLocaleTimeString()}`)

    io.emit('badgeuse:confirme', {
      salarieId: salarie.id_salarie,
      prenom:    salarie.prenom,
      avatar:    salarie.avatar,
      action:    typeAction,
      timestamp: pointage.timestamp,
      epi:       epiData,
    })

    // Signal de rechargement des pointages cote client
    io.emit('pointages:refresh')
  }
}

// ── Initialisation ───────────────────────────────────────────
// Appelee depuis server/index.js au demarrage.
export async function demarrerBadgeuse(io) {
  keypadActif = await initKeypad()
  if (keypadActif) {
    console.log('[Badgeuse] Keypad pret.')
  } else {
    console.log('[Badgeuse] Keypad non disponible - validation EPI auto en simulation.')
  }

  const rfidOk = await initRFID()
  if (!rfidOk) {
    console.warn('[Badgeuse] RFID non disponible - mode simulation (sim:badge via socket).')
    return false
  }

  const handler = creerHandlerBadgeuse(io)
  demarrerPolling(handler)
  console.log('[Badgeuse] Borne demarree - polling RFID actif.')
  return true
}
