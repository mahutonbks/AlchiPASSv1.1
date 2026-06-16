import { Router } from 'express'
import db from '../database.js'

const router = Router()

// ── Pauses par défaut ─────────────────────────────────────────────

// GET /api/pauses
router.get('/pauses', (req, res) => {
  res.json(db.prepare('SELECT * FROM pauses_defaut ORDER BY debut').all())
})

// PUT /api/pauses/:id
router.put('/pauses/:id', (req, res) => {
  const { debut, fin, label } = req.body
  db.prepare('UPDATE pauses_defaut SET debut=?, fin=?, label=? WHERE id=?').run(debut, fin, label, req.params.id)
  res.json(db.prepare('SELECT * FROM pauses_defaut WHERE id=?').get(req.params.id))
})

// ── Planning ──────────────────────────────────────────────────────

// GET /api/planning
router.get('/planning', (req, res) => {
  const rows = db.prepare('SELECT * FROM planning ORDER BY id_salarie, jour_index').all()
  // Regroupe par salarié : { [id_salarie]: ['08:00-15:00', ...x5] }
  const planning = {}
  rows.forEach(r => {
    if (!planning[r.id_salarie]) planning[r.id_salarie] = Array(7).fill(null)
    planning[r.id_salarie][r.jour_index] = r.creneau
  })
  res.json(planning)
})

// PUT /api/planning/:salarieId — remplace tout le planning du salarié
router.put('/planning/:salarieId', (req, res) => {
  const { creneaux } = req.body // tableau indexé par jour [0=lun … 6=dim]
  db.prepare('DELETE FROM planning WHERE id_salarie=?').run(req.params.salarieId)
  const ins = db.prepare('INSERT INTO planning (id_salarie, jour_index, creneau) VALUES (?,?,?)')
  creneaux.forEach((c, j) => { if (c) ins.run(req.params.salarieId, j, c) })
  res.json({ ok: true })
})

// ── Signalements EPI ──────────────────────────────────────────────

// GET /api/signalements
router.get('/signalements', (req, res) => {
  const rows = db.prepare('SELECT * FROM epi_renouvellements ORDER BY date_demande DESC').all()
  res.json(rows.map(normaliserSignalement))
})

// POST /api/signalements
router.post('/signalements', (req, res) => {
  const { salarieId, equipements, details = '' } = req.body
  const id = `sig-${Date.now()}`
  db.prepare('INSERT INTO epi_renouvellements (id_demande, id_salarie, equipements, details, date_demande, statut) VALUES (?,?,?,?,?,?)')
    .run(id, salarieId, JSON.stringify(equipements), details, Date.now(), 'en_cours')
  res.json(normaliserSignalement(db.prepare('SELECT * FROM epi_renouvellements WHERE id_demande=?').get(id)))
})

// PATCH /api/signalements/:id/traite
router.patch('/signalements/:id/traite', (req, res) => {
  db.prepare("UPDATE epi_renouvellements SET statut='traite' WHERE id_demande=?").run(req.params.id)
  res.json({ ok: true })
})

function normaliserSignalement(s) {
  return {
    id: s.id_demande,
    salarieId: s.id_salarie,
    equipements: JSON.parse(s.equipements || '[]'),
    details: s.details,
    timestamp: s.date_demande,
    statut: s.statut,
    traite: s.statut === 'traite',
  }
}

// ── Feedbacks fin de journée ──────────────────────────────────────

// GET /api/feedbacks
router.get('/feedbacks', (req, res) => {
  const rows = db.prepare('SELECT * FROM feedbacks ORDER BY timestamp DESC').all()
  res.json(rows.map(normaliserFeedback))
})

// POST /api/feedbacks
router.post('/feedbacks', (req, res) => {
  const { salarieId, note, commentaire = '' } = req.body
  if (!salarieId || !note || note < 1 || note > 5) {
    return res.status(400).json({ error: 'Données invalides' })
  }
  const id = `fb-${Date.now()}`
  const now = Date.now()
  const date = new Date().toISOString().slice(0, 10)
  db.prepare('INSERT INTO feedbacks (id, id_salarie, date, note, commentaire, timestamp) VALUES (?,?,?,?,?,?)')
    .run(id, salarieId, date, note, commentaire, now)
  res.status(201).json(normaliserFeedback(db.prepare('SELECT * FROM feedbacks WHERE id=?').get(id)))
})

function normaliserFeedback(f) {
  return {
    id: f.id,
    salarieId: f.id_salarie,
    date: f.date,
    note: f.note,
    commentaire: f.commentaire,
    timestamp: f.timestamp,
  }
}

export default router
