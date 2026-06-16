// =============================================================
//  hardware.js — Endpoints de compatibilité pour le script Python
//  du Raspberry Pi (RFID + Digicode + EPI).
//
//  Le script Pi appelle :
//    POST /api/badge         → identification par UID RFID
//    POST /api/authentifier  → vérification du code PIN (digicode)
//    POST /api/evenement     → actions EPI + connexion/déconnexion
//
//  Ces routes traduisent les appels Pi vers notre DB SQLite et
//  émettent les événements Socket.io pour la mise à jour temps réel.
// =============================================================

import { Router } from 'express'
import db from '../database.js'

// Accumulation des données EPI entre les étapes de validation Pi.
// Clé = uid_casque ou nom de l'ouvrier, valeur = { gilet, bottes, casque }
const epiSessions = {}

function dateKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10)
}

// ── Utilitaires DB ───────────────────────────────────────────────

function trouverSalarieParNom(nom) {
  if (!nom) return null
  const tous = db.prepare('SELECT * FROM salaries WHERE actif = 1').all()
  const n = nom.toLowerCase().trim()
  return tous.find(s =>
    `${s.prenom} ${s.nom}`.toLowerCase() === n ||
    s.prenom.toLowerCase() === n ||
    s.nom.toLowerCase() === n
  ) || null
}

function etatActuel(salarieId) {
  const cle = dateKey()
  const pts = db.prepare(
    'SELECT type_evenement FROM badgeages_reels WHERE id_salarie = ? AND cle_date = ? ORDER BY date_heure_action'
  ).all(salarieId, cle)
  let etat = 'absent'
  for (const { type_evenement: t } of pts) {
    if      (t === 'Arrivée')     etat = 'present'
    else if (t === 'Pause')       etat = 'en_pause'
    else if (t === 'RetourPause') etat = 'present'
    else if (t === 'Départ')      etat = 'parti'
  }
  return etat
}

function creerPointage(salarie, typeDB, epi) {
  const now = Date.now()
  const id  = `pt-hw-${now}-${Math.floor(Math.random() * 1000)}`
  const e   = epi || {}
  db.prepare(`
    INSERT INTO badgeages_reels
      (id_badgeage, id_salarie, site_id, date_heure_action, type_evenement,
       epi_gilet, epi_bottes, epi_casque, origine, cle_date, modifications)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, salarie.id_salarie, salarie.site_id, now, typeDB,
    e.gilet  ? 1 : 0,
    e.bottes ? 1 : 0,
    e.casque ? 1 : 0,
    'badgeuse-pi', dateKey(now), '[]'
  )
  return { id, timestamp: now }
}

// ── Factory : reçoit l'instance io pour les émissions Socket.io ──

export function creerRouterHardware(io) {
  const router = Router()

  // ── POST /api/badge ──────────────────────────────────────────
  // Le Pi envoie { uid } après lecture RFID.
  // Réponse : { role, nom } — role = "ADMIN" | "RH" | "OUVRIER" | "INCONNU"
  router.post('/badge', (req, res) => {
    const uid = String(req.body?.uid ?? '').trim()
    if (!uid) return res.status(400).json({ role: 'INCONNU', nom: 'Inconnu' })

    console.log(`[Pi /badge] UID reçu : ${uid}`)

    // 1. Badge manager (RH / Admin)
    const manager = db.prepare('SELECT * FROM badges_managers WHERE uid_rfid = ?').get(uid)
    if (manager) {
      io.emit('rfid:badge', { uid, manager: true, role: manager.role })
      return res.json({ role: manager.role.toUpperCase(), nom: manager.label })
    }

    // 2. Casque RFID associé à un salarié aujourd'hui
    const casque = db.prepare('SELECT * FROM casques WHERE uid_rfid = ?').get(uid)
    if (!casque) {
      io.emit('rfid:badge', { uid, inconnu: true })
      return res.json({ role: 'INCONNU', nom: 'Inconnu' })
    }

    const assoc = db.prepare(
      'SELECT * FROM associations_journalieres WHERE id_rfid_sticker = ? AND date_association = ?'
    ).get(casque.id_rfid_sticker, dateKey())
    if (!assoc) {
      io.emit('rfid:badge', { uid, inconnu: true })
      return res.json({ role: 'INCONNU', nom: 'Inconnu' })
    }

    const salarie = db.prepare('SELECT * FROM salaries WHERE id_salarie = ? AND actif = 1').get(assoc.id_salarie)
    if (!salarie) {
      return res.json({ role: 'INCONNU', nom: 'Inconnu' })
    }

    io.emit('rfid:badge', { uid, salarieId: salarie.id_salarie })
    res.json({
      role:      'OUVRIER',
      nom:       `${salarie.prenom} ${salarie.nom}`,
      salarieId: salarie.id_salarie,
    })
  })

  // ── POST /api/authentifier ───────────────────────────────────
  // Le Pi envoie { password } après saisie digicode.
  // Réponse : { status: "OK", nom } | { status: "ERREUR" }
  router.post('/authentifier', (req, res) => {
    const password = String(req.body?.password ?? '').trim()
    if (!password) return res.json({ status: 'ERREUR' })

    console.log(`[Pi /authentifier] Vérification PIN`)

    const salarie = db.prepare(
      'SELECT * FROM salaries WHERE code_pin = ? AND actif = 1 LIMIT 1'
    ).get(password)

    if (salarie) {
      console.log(`[Pi /authentifier] OK → ${salarie.prenom} ${salarie.nom}`)
      return res.json({
        status:    'OK',
        nom:       `${salarie.prenom} ${salarie.nom}`,
        salarieId: salarie.id_salarie,
      })
    }

    console.log('[Pi /authentifier] Code PIN invalide')
    res.json({ status: 'ERREUR' })
  })

  // ── POST /api/evenement ──────────────────────────────────────
  // Le Pi envoie les événements EPI et les actions de connexion.
  // Chaque action est traitée et traduite en pointage DB si nécessaire.
  router.post('/evenement', (req, res) => {
    const { action, uid, nom, ouvrier, uid_casque } = req.body
    const nomOuvrier = (ouvrier || nom || '').trim()
    const cleSession = uid_casque || nomOuvrier

    console.log(`[Pi /evenement] ${action}`, { nomOuvrier, uid_casque })

    // Initialise la session EPI si absente
    if (!epiSessions[cleSession]) {
      epiSessions[cleSession] = { gilet: false, bottes: false, casque: false }
    }
    const session = epiSessions[cleSession]

    switch (action) {

      // ── Résultats EPI individuels ────────────────────────────
      case 'CASQUE_OK':      session.casque = true;  break
      case 'CASQUE_NOK':     session.casque = false; break
      case 'GILET_OK':       session.gilet  = true;  break
      case 'GILET_NOK':      session.gilet  = false; break
      case 'CHAUSSURES_OK':  session.bottes = true;  break // chaussures → bottes
      case 'CHAUSSURES_NOK': session.bottes = false; break
      case 'GANTS_OK':   break // non suivi dans notre schéma
      case 'GANTS_NOK':  break

      // ── Validation EPI complète → Arrivée ───────────────────
      case 'CONNEXION_CASQUE_VALIDE':
      case 'FIN_VALIDATION_OK': {
        const salarie = trouverSalarieParNom(nomOuvrier)
        if (salarie) {
          const pt = creerPointage(salarie, 'Arrivée', session)
          io.emit('badgeuse:confirme', {
            salarieId: salarie.id_salarie,
            prenom:    salarie.prenom,
            avatar:    salarie.avatar,
            action:    'arrivee',
            timestamp: pt.timestamp,
            epi:       { ...session },
          })
          io.emit('pointages:refresh')
          console.log(`[Pi /evenement] Arrivée enregistrée → ${nomOuvrier}`)
        } else {
          console.warn(`[Pi /evenement] Salarié introuvable : "${nomOuvrier}"`)
        }
        delete epiSessions[cleSession]
        break
      }

      // ── Validation EPI échouée → pas de pointage ────────────
      case 'ECHEC_VALIDATION_EPI':
      case 'FIN_VALIDATION_NOK':
        console.log(`[Pi /evenement] EPI refusé pour "${nomOuvrier}"`)
        delete epiSessions[cleSession]
        break

      // ── Déconnexion ouvrier → Départ ────────────────────────
      case 'DECONNEXION_OUVRIER': {
        const salarie = trouverSalarieParNom(nomOuvrier)
        if (salarie) {
          const etatNow = etatActuel(salarie.id_salarie)
          if (etatNow === 'present' || etatNow === 'en_pause') {
            const pt = creerPointage(salarie, 'Départ', null)
            io.emit('badgeuse:confirme', {
              salarieId: salarie.id_salarie,
              prenom:    salarie.prenom,
              avatar:    salarie.avatar,
              action:    'depart',
              timestamp: pt.timestamp,
            })
            io.emit('pointages:refresh')
            console.log(`[Pi /evenement] Départ enregistré → ${nomOuvrier}`)
          }
        }
        break
      }

      // ── Connexion directe ouvrier (sans validation EPI) ─────
      case 'CONNEXION_OUVRIER': {
        const salarie = trouverSalarieParNom(nomOuvrier)
        if (salarie && etatActuel(salarie.id_salarie) === 'absent') {
          const pt = creerPointage(salarie, 'Arrivée', { gilet: false, bottes: false, casque: false })
          io.emit('badgeuse:confirme', {
            salarieId: salarie.id_salarie,
            prenom:    salarie.prenom,
            avatar:    salarie.avatar,
            action:    'arrivee',
            timestamp: pt.timestamp,
            epi:       {},
          })
          io.emit('pointages:refresh')
        }
        break
      }

      // ── Badge manager (admin/RH) ─────────────────────────────
      case 'CONNEXION_ADMIN':
      case 'CONNEXION_RH':
        io.emit('rfid:badge', { uid: String(uid || ''), manager: true, role: 'admin' })
        break

      default:
        console.log(`[Pi /evenement] Action ignorée : ${action}`)
    }

    res.json({ status: 'OK' })
  })

  // ── GET /api/historique ─────────────────────────────────────
  // Compatible avec le script Pi (historique des passages).
  router.get('/historique', (req, res) => {
    const rows = db.prepare(
      'SELECT * FROM badgeages_reels ORDER BY date_heure_action DESC LIMIT 200'
    ).all()
    res.json(rows.map(r => ({
      type:      r.type_evenement,
      salarieId: r.id_salarie,
      date:      new Date(r.date_heure_action).toISOString(),
      origine:   r.origine,
    })))
  })

  return router
}
