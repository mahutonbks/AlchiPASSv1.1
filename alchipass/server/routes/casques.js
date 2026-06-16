import { Router } from 'express'
import db from '../database.js'

const router = Router()

function dateKey(d) {
  return d.toISOString().slice(0, 10)
}

// ── Casques ──────────────────────────────────────────────────────

// GET /api/casques
router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM casques ORDER BY num_interne_casque').all())
})

// POST /api/casques
router.post('/', (req, res) => {
  const { uid_rfid, num_interne_casque, etat = 'actif' } = req.body
  const id = `rfid-${Date.now()}`
  db.prepare('INSERT INTO casques (id_rfid_sticker, uid_rfid, num_interne_casque, etat) VALUES (?,?,?,?)')
    .run(id, uid_rfid, num_interne_casque, etat)
  res.json({ id_rfid_sticker: id, uid_rfid, num_interne_casque, etat })
})

// PUT /api/casques/:id
router.put('/:id', (req, res) => {
  const { uid_rfid, num_interne_casque, etat } = req.body
  db.prepare('UPDATE casques SET uid_rfid=?, num_interne_casque=?, etat=? WHERE id_rfid_sticker=?')
    .run(uid_rfid, num_interne_casque, etat, req.params.id)
  res.json(db.prepare('SELECT * FROM casques WHERE id_rfid_sticker=?').get(req.params.id))
})

// DELETE /api/casques/:id
router.delete('/:id', (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM associations_journalieres WHERE id_rfid_sticker=?').run(req.params.id)
    db.prepare('DELETE FROM casques WHERE id_rfid_sticker=?').run(req.params.id)
  })()
  res.json({ ok: true })
})

// ── Associations journalières ─────────────────────────────────────

// GET /api/casques/associations?date=YYYY-MM-DD
router.get('/associations', (req, res) => {
  const date = req.query.date || dateKey(new Date())
  const rows = db.prepare('SELECT * FROM associations_journalieres WHERE date_association=?').all(date)
  res.json(rows)
})

// POST /api/casques/associations — associer ou réassocier un casque à un salarié pour la journée
router.post('/associations', (req, res) => {
  const { id_salarie, id_rfid_sticker, date_association } = req.body
  const date = date_association || dateKey(new Date())
  const id = `assoc-${Date.now()}`

  db.prepare('DELETE FROM associations_journalieres WHERE id_salarie=? AND date_association=?')
    .run(id_salarie, date)

  db.prepare('INSERT INTO associations_journalieres (id, id_salarie, id_rfid_sticker, date_association) VALUES (?,?,?,?)')
    .run(id, id_salarie, id_rfid_sticker, date)

  res.json({ id, id_salarie, id_rfid_sticker, date_association: date })
})

// DELETE /api/casques/associations/:id
router.delete('/associations/:id', (req, res) => {
  db.prepare('DELETE FROM associations_journalieres WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── Badges managers ───────────────────────────────────────────────

// GET /api/casques/badges-managers
router.get('/badges-managers', (req, res) => {
  res.json(db.prepare('SELECT * FROM badges_managers').all())
})

// POST /api/casques/badges-managers
router.post('/badges-managers', (req, res) => {
  const { uid_rfid, role, label } = req.body
  db.prepare('INSERT OR REPLACE INTO badges_managers (uid_rfid, role, label) VALUES (?,?,?)').run(uid_rfid, role, label)
  res.json({ uid_rfid, role, label })
})

// DELETE /api/casques/badges-managers/:uid
router.delete('/badges-managers/:uid', (req, res) => {
  db.prepare('DELETE FROM badges_managers WHERE uid_rfid=?').run(req.params.uid)
  res.json({ ok: true })
})

export default router
