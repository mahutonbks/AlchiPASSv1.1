import { Router } from 'express'
import db from '../database.js'

const router = Router()

// GET /api/salaries
router.get('/', (req, res) => {
  const salaries = db.prepare('SELECT * FROM salaries ORDER BY prenom').all()
  res.json(salaries.map(normaliser))
})

// GET /api/sites
router.get('/sites', (req, res) => {
  res.json(db.prepare('SELECT * FROM sites ORDER BY nom').all())
})

// POST /api/salaries
router.post('/', (req, res) => {
  const b = req.body
  // Accepte camelCase (frontend) ou snake_case (API directe)
  const nom         = b.nom
  const prenom      = b.prenom
  const role        = b.role        || 'OPERATEUR'
  const code_pin    = b.code_pin    ?? b.pin
  const site_id     = b.site_id     ?? b.siteId
  const heures_hebdo= b.heures_hebdo ?? b.heuresHebdo ?? 35
  const avatar      = b.avatar      || '🧑'

  const id = `emp-${Date.now()}`
  db.prepare('INSERT INTO salaries (id_salarie, nom, prenom, role, code_pin, site_id, heures_hebdo, avatar, actif) VALUES (?,?,?,?,?,?,?,?,1)')
    .run(id, nom, prenom, role, code_pin, site_id, heures_hebdo, avatar)
  res.json(normaliser(db.prepare('SELECT * FROM salaries WHERE id_salarie = ?').get(id)))
})

// PUT /api/salaries/:id
router.put('/:id', (req, res) => {
  const b = req.body
  // Accepte camelCase (frontend) ou snake_case (API directe)
  const nom         = b.nom
  const prenom      = b.prenom
  const role        = b.role        || 'OPERATEUR'
  const code_pin    = b.code_pin    ?? b.pin
  const site_id     = b.site_id     ?? b.siteId
  const heures_hebdo= b.heures_hebdo ?? b.heuresHebdo ?? 35
  const avatar      = b.avatar      || '🧑'

  db.prepare('UPDATE salaries SET nom=?, prenom=?, role=?, code_pin=?, site_id=?, heures_hebdo=?, avatar=? WHERE id_salarie=?')
    .run(nom, prenom, role, code_pin, site_id, heures_hebdo, avatar, req.params.id)
  res.json(normaliser(db.prepare('SELECT * FROM salaries WHERE id_salarie = ?').get(req.params.id)))
})

// PATCH /api/salaries/:id/actif
router.patch('/:id/actif', (req, res) => {
  const s = db.prepare('SELECT actif FROM salaries WHERE id_salarie = ?').get(req.params.id)
  if (!s) return res.status(404).json({ error: 'Salarié introuvable' })
  db.prepare('UPDATE salaries SET actif = ? WHERE id_salarie = ?').run(s.actif ? 0 : 1, req.params.id)
  res.json({ actif: !s.actif })
})

// POST /api/sites
router.post('/sites', (req, res) => {
  const { nom } = req.body
  const id = `site-${Date.now()}`
  db.prepare('INSERT INTO sites (id, nom) VALUES (?,?)').run(id, nom)
  res.json({ id, nom })
})


function normaliser(s) {
  if (!s) return null
  return {
    id: s.id_salarie,
    nom: s.nom,
    prenom: s.prenom,
    role: s.role,
    pin: s.code_pin,
    siteId: s.site_id,
    heuresHebdo: s.heures_hebdo,
    avatar: s.avatar,
    actif: Boolean(s.actif),
  }
}

export default router
