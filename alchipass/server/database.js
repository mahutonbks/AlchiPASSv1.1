// =============================================================
//  database.js — Initialisation SQLite + schéma + données démo.
//  Utilise better-sqlite3 (API synchrone, idéal Raspberry Pi).
//  La base est créée dans alchipass.db à la racine du projet.
// =============================================================

import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import path from 'path'
import { randomUUID } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'alchipass.db')

export const db = new Database(DB_PATH)

// Performances : WAL mode + foreign keys
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// =============================================================
//  SCHÉMA
// =============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id   TEXT PRIMARY KEY,
    nom  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS salaries (
    id_salarie   TEXT PRIMARY KEY,
    nom          TEXT NOT NULL,
    prenom       TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'OPERATEUR',
    code_pin     TEXT NOT NULL,
    site_id      TEXT REFERENCES sites(id),
    heures_hebdo INTEGER DEFAULT 35,
    avatar       TEXT DEFAULT '🧑',
    actif        INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS casques (
    id_rfid_sticker    TEXT PRIMARY KEY,
    uid_rfid           TEXT UNIQUE NOT NULL,
    num_interne_casque TEXT NOT NULL,
    etat               TEXT NOT NULL DEFAULT 'actif'
  );

  CREATE TABLE IF NOT EXISTS badges_managers (
    uid_rfid TEXT PRIMARY KEY,
    role     TEXT NOT NULL,
    label    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS associations_journalieres (
    id               TEXT PRIMARY KEY,
    id_salarie       TEXT NOT NULL REFERENCES salaries(id_salarie),
    id_rfid_sticker  TEXT NOT NULL REFERENCES casques(id_rfid_sticker),
    date_association TEXT NOT NULL,
    UNIQUE (id_salarie, date_association)
  );

  CREATE TABLE IF NOT EXISTS badgeages_reels (
    id_badgeage       TEXT PRIMARY KEY,
    id_salarie        TEXT NOT NULL REFERENCES salaries(id_salarie),
    site_id           TEXT REFERENCES sites(id),
    date_heure_action INTEGER NOT NULL,
    type_evenement    TEXT NOT NULL,
    epi_gilet         INTEGER DEFAULT 0,
    epi_bottes        INTEGER DEFAULT 0,
    epi_casque        INTEGER DEFAULT 0,
    heure_corrigee    INTEGER,
    origine           TEXT DEFAULT 'pointage',
    cle_date          TEXT NOT NULL,
    modifications     TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS epi_renouvellements (
    id_demande    TEXT PRIMARY KEY,
    id_salarie    TEXT NOT NULL REFERENCES salaries(id_salarie),
    equipements   TEXT NOT NULL,
    details       TEXT DEFAULT '',
    date_demande  INTEGER NOT NULL,
    statut        TEXT DEFAULT 'en_cours'
  );

  CREATE TABLE IF NOT EXISTS planning (
    id_salarie  TEXT NOT NULL REFERENCES salaries(id_salarie),
    jour_index  INTEGER NOT NULL,
    creneau     TEXT NOT NULL,
    PRIMARY KEY (id_salarie, jour_index)
  );

  CREATE TABLE IF NOT EXISTS pauses_defaut (
    id    TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    debut TEXT NOT NULL,
    fin   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_comptes (
    identifiant  TEXT PRIMARY KEY,
    mot_de_passe TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedbacks (
    id          TEXT PRIMARY KEY,
    id_salarie  TEXT NOT NULL REFERENCES salaries(id_salarie),
    date        TEXT NOT NULL,
    note        INTEGER NOT NULL,
    commentaire TEXT DEFAULT '',
    timestamp   INTEGER NOT NULL
  );
`)

// =============================================================
//  SEED — données de démo si la base est vide
// =============================================================
function dateKey(d) {
  return d.toISOString().slice(0, 10)
}

function ts(cle, h, m) {
  const [y, mo, j] = cle.split('-').map(Number)
  return new Date(y, mo - 1, j, h, m, 0, 0).getTime()
}

function lundi(d) {
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  const l = new Date(d)
  l.setDate(d.getDate() + diff)
  l.setHours(0, 0, 0, 0)
  return l
}

const sitesExist = db.prepare('SELECT COUNT(*) as n FROM sites').get().n

if (sitesExist === 0) {
  console.log('[DB] Initialisation avec les données de démonstration…')

  const insertSite = db.prepare('INSERT INTO sites (id, nom) VALUES (?, ?)')
  const SITES = [
    ['site-farlede', 'La Farlède'],
    ['site-cuers',   'Cuers'],
    ['site-puget',   'Puget-sur-Argens'],
  ]
  SITES.forEach(s => insertSite.run(...s))

  // Collecteurs = employés mobiles autorisés à pointer les pauses depuis l'appli mobile
  const SALARIES = [
    { id: 'emp-1', nom: 'Benali',  prenom: 'Karim',  site: 'site-farlede', pin: '1234', h: 35, avatar: '🧑🏽‍🌾', role: 'COLLECTEUR' },
    { id: 'emp-2', nom: 'Martin',  prenom: 'Sophie', site: 'site-farlede', pin: '1234', h: 35, avatar: '👩🏼‍🔧', role: 'OPERATEUR'  },
    { id: 'emp-3', nom: 'Roux',    prenom: 'Mehdi',  site: 'site-farlede', pin: '1234', h: 28, avatar: '🧑🏻‍🏭', role: 'OPERATEUR'  },
    { id: 'emp-4', nom: 'Garcia',  prenom: 'Inès',   site: 'site-cuers',   pin: '1234', h: 35, avatar: '👩🏽‍🌾', role: 'COLLECTEUR' },
    { id: 'emp-5', nom: 'Petit',   prenom: 'Lucas',  site: 'site-cuers',   pin: '1234', h: 35, avatar: '🧑🏼‍🏭', role: 'OPERATEUR'  },
    { id: 'emp-6', nom: 'Diallo',  prenom: 'Fatou',  site: 'site-puget',   pin: '1234', h: 35, avatar: '👩🏿‍🔧', role: 'OPERATEUR'  },
    { id: 'emp-7', nom: 'Lefèvre', prenom: 'Thomas', site: 'site-puget',   pin: '1234', h: 21, avatar: '🧑🏻‍🌾', role: 'OPERATEUR'  },
    { id: 'emp-8', nom: 'Moreau',  prenom: 'Léa',    site: 'site-cuers',   pin: '1234', h: 35, avatar: '👩🏻‍🏭', role: 'COLLECTEUR' },
  ]

  const insertSal = db.prepare(
    'INSERT INTO salaries (id_salarie, nom, prenom, role, code_pin, site_id, heures_hebdo, avatar, actif) VALUES (?,?,?,?,?,?,?,?,1)'
  )
  SALARIES.forEach(s => insertSal.run(s.id, s.nom, s.prenom, s.role, s.pin, s.site, s.h, s.avatar))

  // Casques RFID
  const insertCasque = db.prepare(
    'INSERT INTO casques (id_rfid_sticker, uid_rfid, num_interne_casque, etat) VALUES (?,?,?,?)'
  )
  SALARIES.forEach((s, i) => {
    insertCasque.run(
      `rfid-${i + 1}`,
      `04${String(i + 1).padStart(2, '0')}ABCDEF`,
      `C-${String(i + 1).padStart(3, '0')}`,
      'actif'
    )
  })

  // Badges managers
  db.prepare('INSERT INTO badges_managers (uid_rfid, role, label) VALUES (?,?,?)').run('04RHMANAGER0', 'rh',    'Carte RH')
  db.prepare('INSERT INTO badges_managers (uid_rfid, role, label) VALUES (?,?,?)').run('04ADMINCARDO', 'admin', 'Carte Admin')

  // Associations journalières (aujourd'hui)
  const today = dateKey(new Date())
  const insertAssoc = db.prepare(
    'INSERT OR REPLACE INTO associations_journalieres (id, id_salarie, id_rfid_sticker, date_association) VALUES (?,?,?,?)'
  )
  SALARIES.forEach((s, i) => {
    insertAssoc.run(`assoc-demo-${i + 1}`, s.id, `rfid-${i + 1}`, today)
  })

  // Pointages démo — semaine en cours
  const insertPt = db.prepare(`
    INSERT INTO badgeages_reels
      (id_badgeage, id_salarie, site_id, date_heure_action, type_evenement, epi_gilet, epi_bottes, epi_casque, origine, cle_date, modifications)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `)

  const lun = lundi(new Date())
  const cleAujourdhui = dateKey(new Date())
  let cpt = 1

  const ajouterPt = (empId, siteId, cle, type, t, epi = false) => {
    insertPt.run(
      `pt-${cpt++}`, empId, siteId, t, type,
      epi ? 1 : 0, epi ? 1 : 0, epi ? 1 : 0,
      'pointage', cle, '[]'
    )
  }

  for (let i = 0; i < 5; i++) {
    const d = new Date(lun)
    d.setDate(lun.getDate() + i)
    const cle = dateKey(d)
    if (d.setHours(0,0,0,0) > new Date().setHours(0,0,0,0)) break
    const estAujourdhui = cle === cleAujourdhui

    SALARIES.forEach((emp, idx) => {
      if (emp.h < 35 && i === 4) return
      const hArr = 6 + (idx % 3)
      ajouterPt(emp.id, emp.site, cle, 'Arrivée', ts(cle, hArr, idx % 20), true)

      if (estAujourdhui) {
        if (emp.id === 'emp-2') { ajouterPt(emp.id, emp.site, cle, 'Pause', ts(cle, 11, 30)); return }
        if (['emp-1','emp-4','emp-6'].includes(emp.id)) {
          ajouterPt(emp.id, emp.site, cle, 'Pause', ts(cle, 9, 30))
          ajouterPt(emp.id, emp.site, cle, 'Pause', ts(cle, 10, 0), true)
          return
        }
      }

      const hP = 11 + (idx % 2), mP = idx % 30, durP = 30 + idx % 30
      ajouterPt(emp.id, emp.site, cle, 'Pause',   ts(cle, hP, mP))
      ajouterPt(emp.id, emp.site, cle, 'Pause',   ts(cle, hP, mP) + durP * 60000, true)
      ajouterPt(emp.id, emp.site, cle, 'Départ',  ts(cle, 14 + idx % 3, idx % 40))
    })
  }

  // Planning démo
  const insertPlan = db.prepare('INSERT INTO planning (id_salarie, jour_index, creneau) VALUES (?,?,?)')
  SALARIES.forEach((s, idx) => {
    const debut = 6 + (idx % 3)
    const creneau = `${String(debut).padStart(2,'0')}:00-${String(debut+7).padStart(2,'0')}:30`
    const nbJ = s.h < 35 ? 4 : 5
    for (let j = 0; j < nbJ; j++) insertPlan.run(s.id, j, creneau)
  })

  // Pauses par défaut
  db.prepare('INSERT INTO pauses_defaut (id, label, debut, fin) VALUES (?,?,?,?)').run('pause-matin', 'Pause matin',     '10:30', '10:45')
  db.prepare('INSERT INTO pauses_defaut (id, label, debut, fin) VALUES (?,?,?,?)').run('pause-midi',  'Pause déjeuner',  '12:30', '13:00')

  // Comptes admin
  db.prepare('INSERT INTO admin_comptes (identifiant, mot_de_passe) VALUES (?,?)').run('rh',    'alchipass2026')
  db.prepare('INSERT INTO admin_comptes (identifiant, mot_de_passe) VALUES (?,?)').run('admin', 'alchipass2026')

  console.log('[DB] Données de démonstration insérées.')
}

export default db
