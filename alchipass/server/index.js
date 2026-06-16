import express from 'express'
import { createServer } from 'http'
import { Server as IOServer } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

import db from './database.js'
import salariesRouter  from './routes/salaries.js'
import pointagesRouter from './routes/pointages.js'
import casquesRouter   from './routes/casques.js'
import miscRouter      from './routes/misc.js'
import { creerRouterHardware } from './routes/hardware.js'
import { demarrerBadgeuse, creerHandlerBadgeuse } from './hardware/badgeuse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Port 3000 par défaut pour compatibilité avec le script Python du Raspberry Pi
const PORT = process.env.PORT || 3000

const app    = express()
const server = createServer(app)
const io     = new IOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

// ── Middleware ────────────────────────────────────────────────────
app.use(cors())
app.use(express.json())

// ── Routes API ───────────────────────────────────────────────────
app.use('/api/salaries',   salariesRouter)
app.use('/api/pointages',  pointagesRouter)
app.use('/api/casques',    casquesRouter)
app.use('/api',            miscRouter)
app.use('/api',            creerRouterHardware(io))

// Route login admin
app.post('/api/admin/login', (req, res) => {
  const { identifiant, motDePasse } = req.body
  const compte = db.prepare('SELECT * FROM admin_comptes WHERE identifiant = ?').get(identifiant?.trim()?.toLowerCase())
  if (compte && compte.mot_de_passe === motDePasse) {
    res.json({ ok: true, role: compte.identifiant })
  } else {
    res.status(401).json({ ok: false, error: 'Identifiant ou mot de passe incorrect.' })
  }
})

// ── Servir le build React en production ──────────────────────────
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// ── Socket.io ────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connecte : ${socket.id}`)
  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client deconnecte : ${socket.id}`)
  })
  // Simulation RFID depuis le navigateur (developpement)
  // Passe par le meme workflow que la badgeuse physique.
  socket.on('sim:badge', ({ uid }) => {
    console.log(`[RFID SIM] UID recu via socket : ${uid}`)
    const handler = creerHandlerBadgeuse(io)
    handler(uid)
  })
})

// ── Demarrage ────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n AlchiPass backend demarre sur le port ${PORT}`)
  console.log(`   API  : http://localhost:${PORT}/api`)
  console.log(`   App  : http://localhost:${PORT}`)
  console.log(`   Pi   : http://10.115.166.244:${PORT}\n`)

  // Lance le workflow complet (RFID + Keypad EPI + DB + Socket.io)
  const hardwareDispo = await demarrerBadgeuse(io)
  if (!hardwareDispo) {
    console.log('[Badgeuse] Mode simulation - utilisez sim:badge depuis /kiosque.')
  }
})

export { io }
