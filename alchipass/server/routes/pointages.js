import { Router } from 'express'
import db from '../database.js'

const router = Router()

function dateKey(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

// GET /api/pointages
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM badgeages_reels ORDER BY date_heure_action').all()
  res.json(rows.map(normaliser))
})

// POST /api/pointages — pointage depuis la borne ou l'application
router.post('/', (req, res) => {
  const { salarieId, type, epiData, origine = 'pointage' } = req.body
  const salarie = db.prepare('SELECT * FROM salaries WHERE id_salarie = ?').get(salarieId)
  if (!salarie) return res.status(404).json({ error: 'Salarié introuvable' })

  // Les pauses à distance (origine 'app') sont réservées aux Collecteurs
  const estPauseDistante = origine === 'app' && (type === 'pause_debut' || type === 'pause_fin')
  if (estPauseDistante && salarie.role !== 'COLLECTEUR') {
    return res.status(403).json({ error: 'Action réservée aux Collecteurs.' })
  }

  const now = Date.now()
  const id = `pt-${now}-${Math.floor(Math.random() * 1000)}`
  const epi = epiData || {}

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
    epi.gilet ? 1 : 0, epi.bottes ? 1 : 0, epi.casque ? 1 : 0,
    origine, dateKey(now), '[]'
  )

  res.json(normaliser(db.prepare('SELECT * FROM badgeages_reels WHERE id_badgeage = ?').get(id)))
})

// PUT /api/pointages/:id — correction RH (remplit heure_corrigee)
router.put('/:id', (req, res) => {
  const { nouveauTimestamp, auteur } = req.body
  const p = db.prepare('SELECT * FROM badgeages_reels WHERE id_badgeage = ?').get(req.params.id)
  if (!p) return res.status(404).json({ error: 'Pointage introuvable' })

  const modifs = JSON.parse(p.modifications || '[]')
  modifs.push({ ancienTimestamp: p.date_heure_action, nouveauTimestamp, auteur, date: Date.now() })

  db.prepare(`
    UPDATE badgeages_reels
    SET date_heure_action = ?, heure_corrigee = ?, cle_date = ?, origine = 'correction', modifications = ?
    WHERE id_badgeage = ?
  `).run(nouveauTimestamp, nouveauTimestamp, dateKey(nouveauTimestamp), JSON.stringify(modifs), req.params.id)

  res.json(normaliser(db.prepare('SELECT * FROM badgeages_reels WHERE id_badgeage = ?').get(req.params.id)))
})

// POST /api/pointages/manuel — ajout manuel par admin
router.post('/manuel', (req, res) => {
  const { salarieId, type, timestamp, auteur } = req.body
  const salarie = db.prepare('SELECT * FROM salaries WHERE id_salarie = ?').get(salarieId)
  if (!salarie) return res.status(404).json({ error: 'Salarié introuvable' })

  const id = `pt-manuel-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const modifs = JSON.stringify([{ ajoutManuel: true, auteur, date: Date.now() }])

  db.prepare(`
    INSERT INTO badgeages_reels
      (id_badgeage, id_salarie, site_id, date_heure_action, type_evenement,
       origine, cle_date, modifications)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, salarieId, salarie.site_id, timestamp, type, 'correction', dateKey(timestamp), modifs)

  res.json(normaliser(db.prepare('SELECT * FROM badgeages_reels WHERE id_badgeage = ?').get(id)))
})

// DELETE /api/pointages/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM badgeages_reels WHERE id_badgeage = ?').run(req.params.id)
  res.json({ ok: true })
})

function normaliser(p) {
  if (!p) return null
  return {
    id: p.id_badgeage,
    salarieId: p.id_salarie,
    siteId: p.site_id,
    type: typeVersClient(p.type_evenement),
    timestamp: p.date_heure_action,
    heure_corrigee: p.heure_corrigee,
    epi: { gilet: Boolean(p.epi_gilet), bottes: Boolean(p.epi_bottes), casque: Boolean(p.epi_casque) },
    origine: p.origine,
    cle: p.cle_date,
    modifications: JSON.parse(p.modifications || '[]'),
  }
}

// Mapping type_evenement BDD ↔ clés React
function typeVersClient(t) {
  return { 'Arrivée': 'arrivee', 'Pause': 'pause_debut', 'RetourPause': 'pause_fin', 'Départ': 'depart' }[t] || t
}

export { typeVersClient }
export default router
