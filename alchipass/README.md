# AlchiPass — Pointage numérique des heures

Application web développée pour **Les Alchimistes Côte d'Azur** dans le cadre
de la GarageWeek 2026 (ISEN Méditerranée). Elle remplace le pointage papier
par une borne numérique connectée à une **badgeuse RFID physique** (Raspberry
Pi + RC522), intègre un suivi de la conformité EPI et propose trois interfaces
distinctes selon le profil.

Le design est volontairement **ultra-visuel** (grands avatars emoji, icônes
couleurs, étapes guidées) pour être utilisable par des salariés ayant des
difficultés de lecture ou d'écriture.

---

## 1. Ce que fait l'application

### Application personnelle employé (accès `/kiosque`)

L'interface employé est une **application personnelle mobile** : l'employé se
connecte avec son nom + code PIN et accède à son espace individuel.

**Login**
- Sélection du nom dans une liste déroulante (avatars emoji)
- Saisie du code PIN à 4 chiffres sur clavier tactile

**Dashboard personnel** (après connexion)
- Statut du jour en temps réel : 🔴 Pas arrivé · 🟢 Sur site · 🟡 En pause · 🔵 Terminé
- Badge de rôle : 🚛 Collecteur ou 🏭 Opérateur
- KPIs visuels : heure d'arrivée, temps travaillé en cours, heure de départ
- **Règle métier "Pauses"** :
  - **Collecteurs** : bouton ☕ **Prendre ma pause** / **Terminer ma pause** visible
    pour pointer les pauses à distance depuis l'application mobile
  - **Opérateurs** : bouton masqué — affichage de la prochaine pause planifiée
    avec rappel automatique (notification push + bip audio)
- Accès rapide à **Mon Planning** et **Mon Historique**

**Mon Planning** (vue `📅`)
- Affichage graphique de la semaine théorique (barres colorées 6h–20h)
- Navigation semaine précédente / suivante
- Total planifié vs contrat affiché

**Mon Historique** (vue `📋`)
- Détail journalier filtré pour l'employé connecté : arrivée, départ, pauses,
  temps travaillé, EPI validés — données issues de `badgeages_reels`
- Navigation par semaine avec total hebdomadaire

**Pointage via RFID physique**
- Les boutons manuels Arrivée/Départ sont réservés à la badgeuse
- Scan RFID → vérification EPI via Digicode (arrivée / retour pause)
  ou choix Pause / Départ (si déjà présent) → enregistrement direct en BDD
  → confirmation via Socket.io sur le dashboard employé
- Un scan RFID interrompt n'importe quelle vue et restaure la session après

### Espace RH (login `rh`)
- Récapitulatif hebdomadaire des heures avec export CSV (format Excel)
- Correction et ajout de pointages oubliés — chaque modification trace
  l'heure originale, l'heure corrigée et l'auteur (`heure_corrigee`)
- Gestion des salariés et de leurs rôles (Opérateur / Collecteur)
- Planning hebdomadaire prévisionnel + configuration des créneaux de pauses
  collectives (pause matin 10h30–10h45, pause déjeuner 12h30–13h)
- **Sidebar responsive** : mini (~64 px, icônes seules) sur mobile/tablette
  avec transition fluide au clic hamburger ☰

### Espace Admin / Sécurité (login `admin`)
- **Sidebar responsive** identique à l'espace RH (mini icônes sur mobile)
- **Présence en temps réel** sur site, filtrée par site
- **Conformité EPI** : tableau par salarié avec statut ✅ / ⚠️ basé sur les
  EPI validés à la dernière arrivée
- **Casques & RFID** : inventaire des stickers RC522, associations
  journalières salarié ↔ casque, gestion des états (actif / défectueux /
  inactif), badges managers
- **Signalement de renouvellement** : enregistrement et suivi des
  équipements à remplacer
- Détection automatique des anomalies (départs oubliés, pauses non clôturées)

---

## 2. Architecture technique

### Stack

| Couche | Techno |
|---|---|
| Frontend | React 18 + React Router 6 + Vite 5 |
| Backend | Node.js + Express 4 + Socket.io 4 |
| Base de données | SQLite via `better-sqlite3` ≥ 12 |
| RFID | RC522 via SPI (`mfrc522-rpi`) — optionnel |
| Keypad | Pavé 4×4 GPIO via `onoff` — optionnel |
| Production | PM2 ou systemd sur Raspberry Pi 5 |

> **Dépendances GPIO optionnelles** : `mfrc522-rpi`, `rpi-softspi` et `onoff`
> sont déclarées en `optionalDependencies`. Sur un PC Windows/Mac/Linux standard
> `npm install` les ignore silencieusement. Le serveur détecte leur absence et
> passe automatiquement en mode simulation (RFID virtuel via `sim:badge`,
> validation EPI automatique, PIN via clavier tactile).

### Flux de données

```
Raspberry Pi 5
├── RC522 (SPI)  →  server/hardware/rfid.js
│                       │  demarrerPolling()
│                       ▼
├── Keypad 4×4  →  server/hardware/keypad.js
│                       │  lireTouche()
│                       ▼
├── server/hardware/badgeuse.js  ← orchestrateur principal
│   ├── Identification RFID (DB)
│   ├── EPI via Digicode (1=Gilet 2=Bottes 3=Casque 4=Valider)
│   ├── Enregistrement direct SQLite
│   └── io.emit('badgeuse:confirme' | 'pointages:refresh')
│
├── server/index.js  ←  Express REST :3001 + Socket.io
│
└── Navigateur (React)
    ├── Kiosque.jsx  →  socket.on('badgeuse:confirme') → dashboard
    └── AppContext.jsx  →  fetch('/api/...')
```

### Workflow RFID → pointage (badgeuse physique)

```
Badge casque scanné par RC522
    │ uid_rfid (hex)
    ▼
casques (uid_rfid → id_rfid_sticker)
    │
    ▼
associations_journalieres (id_rfid_sticker + date → id_salarie)
    │
    ▼
salaries (identité + rôle + site)
    │
    ├── état 'absent'   → EPI Digicode → arrivée enregistrée en BDD
    ├── état 'en_pause' → EPI Digicode → pause_fin enregistrée en BDD
    ├── état 'present'  → Digicode : 1=Pause / 2=Départ
    └── état 'parti'    → notification "journée terminée"
                               │
                               ▼
                      io.emit('badgeuse:confirme')
                      io.emit('pointages:refresh')
                               │
                               ▼
                      Dashboard employé mis à jour en temps réel
```

### Événements Socket.io

| Événement | Direction | Description |
|---|---|---|
| `rfid:badge` | Server → Client | UID badge détecté (managers ou simulation) |
| `sim:badge` | Client → Server | Simulation badge depuis le navigateur (dev) |
| `badgeuse:confirme` | Server → Client | Pointage physique enregistré — met à jour le dashboard |
| `pointages:refresh` | Server → Client | Signal de rechargement de la liste des pointages |

### Règle métier — pauses à distance

| Rôle | Bouton pause dans l'app | Pause via badgeuse physique |
|---|---|---|
| `COLLECTEUR` | ✅ Autorisé (`origine: 'app'`) | ✅ Autorisé |
| `OPERATEUR` | ❌ Masqué — 403 si tentative API | ✅ Autorisé |

Le backend vérifie le rôle sur `POST /api/pointages` lorsque `origine === 'app'`
et que `type === 'pause_debut'` ou `'pause_fin'`.

---

## 3. Câblage matériel (Raspberry Pi)

### Lecteur RFID RC522 (SPI logiciel via `rpi-softspi`)

| RC522 | GPIO (BCM) | Broche physique |
|---|---|---|
| SDA (CS) | 24 | 18 |
| SCK | 23 | 16 |
| MOSI | 19 | 35 |
| MISO | 21 | 40 |
| RST | 22 | 15 |
| Buzzer (opt.) | 18 | 12 |
| GND | — | 6 |
| 3.3 V | — | 1 |

### Pavé numérique 4×4 — Digicode EPI (via `onoff`)

| Rangées R1–R4 | GPIO (BCM) | Colonnes C1–C4 | GPIO (BCM) |
|---|---|---|---|
| R1 | 17 | C1 | 6 |
| R2 | 27 | C2 | 13 |
| R3 | 22 | C3 | 19 |
| R4 | 5  | C4 | 26 |

Les rangées sont configurées en **sortie**, les colonnes en **entrée avec
résistance de tirage**. Mapping des touches sur la badgeuse :

- `1` → Gilet ✓/✗  &nbsp; `2` → Bottes ✓/✗  &nbsp; `3` → Casque ✓/✗  &nbsp; `4` → Valider
- `*` → Réinitialiser les EPI  &nbsp; (état présent : `1` = Pause, `2` = Départ)
- Timeout automatique 30 s si aucune saisie

---

## 4. Installation

### Prérequis

- Node.js ≥ 18 (LTS)
- npm ≥ 9

### Développement (PC)

```bash
# Installer les dépendances (les packages GPIO sont ignorés automatiquement)
npm install

# Terminal 1 — backend Express + Socket.io + SQLite
npm run server

# Terminal 2 — frontend Vite avec proxy API et HMR
npm run dev
```

L'app est accessible sur `http://localhost:5173`.  
Le backend API tourne sur `http://localhost:3001`.  
La base SQLite `alchipass.db` est créée et seedée automatiquement au premier démarrage.

### Production sur Raspberry Pi

```bash
# 1. Copier le projet sur le Pi
scp -r alchipass/ pi@<IP_DU_PI>:/home/pi/

# 2. Installer les dépendances (inclut les packages GPIO natifs)
ssh pi@<IP_DU_PI>
cd /home/pi/alchipass
npm install

# 3. Build + démarrage en une seule commande
npm start

# — OU — démarrage automatique avec PM2 (recommandé en production)
npm install -g pm2
mkdir -p logs                  # dossier requis par ecosystem.config.cjs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                    # → copier-coller la commande affichée

# — OU — démarrage automatique avec systemd
sudo cp alchipass.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable alchipass
sudo systemctl start alchipass
```

L'app est alors accessible sur `http://<IP_DU_PI>:3001` depuis tout appareil
du même réseau (tablettes kiosque, PC admin, téléphone RH).

### Activer SPI pour le RC522

```bash
# Dans raspi-config → Interface Options → SPI → Enable
sudo raspi-config

# Vérifier
ls /dev/spidev*   # → /dev/spidev0.0
```

---

## 5. Scripts npm

| Commande | Description |
|---|---|
| `npm run dev` | Frontend Vite + HMR (dev uniquement) |
| `npm run build` | Build React → `dist/` |
| `npm run server` | Backend Express/Socket.io |
| `npm start` | Build puis serveur (production) |

---

## 6. Structure des fichiers

```
index.html                  Page hôte React
package.json                Dépendances et scripts npm
vite.config.js              Config Vite + proxy /api et /socket.io
ecosystem.config.cjs        Config PM2 (production, logs dans logs/)
alchipass.service           Unité systemd (production)
alchipass.db                Base SQLite (générée au premier lancement)

server/
  index.js                  Serveur Express + Socket.io (port 3001)
  database.js               Schéma SQLite + seed de démonstration
  routes/
    salaries.js             CRUD salariés & sites, login admin
    pointages.js            CRUD badgeages — vérification rôle COLLECTEUR
    casques.js              CRUD casques RFID, associations, badges managers
    misc.js                 Pauses, planning, signalements EPI
  hardware/
    badgeuse.js             Orchestrateur physique (RFID+Keypad+DB+Socket.io)
    rfid.js                 Polling RC522 200 ms (fallback silencieux sur PC)
    keypad.js               Pavé numérique GPIO 4×4 (fallback silencieux)

src/
  main.jsx                  Point d'entrée React + routeur
  App.jsx                   Définition des routes
  styles.css                Feuille de style (identité visuelle)
  context/
    AppContext.jsx           État global + appels API REST + refresh badgeuse
  pages/
    Accueil.jsx             Écran d'entrée (choix du mode)
    Kiosque.jsx             Application personnelle employé
                              Login → Dashboard → Planning → Historique
                              Socket.io : rfid:badge, badgeuse:confirme
    AdminConnexion.jsx      Connexion RH / Admin
    Admin.jsx               Espace manager (vue RH ou sécurité)
                              GestionSalaries : sélecteur rôle COLLECTEUR/OPERATEUR
  components/
    Communs.jsx             Logo, horloge temps réel, en-tête
  utils/
    time.js                 Dates, heures, calcul du temps travaillé,
                            états et actions autorisées
    rapports.js             Agrégation des heures, anomalies, export CSV
```

---

## 7. Schéma de la base de données

| Table | Colonnes clés | Description |
|---|---|---|
| `sites` | `id`, `nom` | Sites géographiques |
| `salaries` | `id_salarie`, `nom`, `prenom`, `role`, `code_pin`, `site_id`, `heures_hebdo` | Employés (role : OPERATEUR \| COLLECTEUR) |
| `casques` | `id_rfid_sticker`, `uid_rfid`, `num_interne_casque`, `etat` | Stickers RC522 |
| `badges_managers` | `uid_rfid`, `role`, `label` | Badges RH/admin |
| `associations_journalieres` | `id_salarie`, `id_rfid_sticker`, `date_association` | Casque du jour |
| `badgeages_reels` | `id_salarie`, `date_heure_action`, `type_evenement`, `epi_gilet/bottes/casque`, `heure_corrigee`, `origine` | Pointages + traçabilité |
| `epi_renouvellements` | `id_salarie`, `equipements`, `statut` | Signalements |
| `planning` | `id_salarie`, `jour_index`, `creneau` | Horaires prévisionnels |
| `pauses_defaut` | `id`, `label`, `debut`, `fin` | Pauses collectives |
| `admin_comptes` | `identifiant`, `mot_de_passe` | Comptes RH/admin |

---

## 8. API REST

### Salariés & sites

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/salaries` | Liste des salariés (avec champ `role`) |
| POST | `/api/salaries` | Créer un salarié (accepte camelCase et snake_case) |
| PUT | `/api/salaries/:id` | Modifier un salarié (accepte camelCase et snake_case) |
| PATCH | `/api/salaries/:id/actif` | Activer / désactiver |
| GET | `/api/salaries/sites` | Liste des sites |
| POST | `/api/salaries/sites` | Créer un site |
| POST | `/api/admin/login` | Authentification manager |

### Pointages

| Méthode | Route | Corps | Description |
|---|---|---|---|
| GET | `/api/pointages` | — | Tous les pointages |
| POST | `/api/pointages` | `{ salarieId, type, epiData, origine }` | Enregistrer un badgeage |
| PUT | `/api/pointages/:id` | `{ nouveauTimestamp, auteur }` | Corriger l'heure (RH) |
| POST | `/api/pointages/manuel` | `{ salarieId, type, timestamp, auteur }` | Ajout manuel (RH) |
| DELETE | `/api/pointages/:id` | — | Supprimer un pointage |

> `origine` : `'pointage'` (borne physique), `'app'` (bouton mobile Collecteur),
> `'badgeuse'` (script hardware), `'correction'` (RH). Les pauses avec
> `origine === 'app'` retournent **403** si le salarié n'est pas `COLLECTEUR`.

### Casques RFID & associations

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/casques` | Inventaire casques |
| POST | `/api/casques` | Ajouter un casque |
| PUT | `/api/casques/:id` | Modifier un casque |
| DELETE | `/api/casques/:id` | Supprimer un casque |
| GET | `/api/casques/associations?date=` | Associations du jour |
| POST | `/api/casques/associations` | Associer un casque à un salarié |
| DELETE | `/api/casques/associations/:id` | Supprimer une association |
| GET | `/api/casques/badges-managers` | Badges managers |
| POST | `/api/casques/badges-managers` | Ajouter un badge manager |
| DELETE | `/api/casques/badges-managers/:uid` | Supprimer un badge manager |

### Pauses, planning & signalements

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/pauses` | Pauses collectives par défaut |
| PUT | `/api/pauses/:id` | Modifier une pause |
| GET | `/api/planning` | Planning de tous les salariés |
| PUT | `/api/planning/:salarieId` | Mettre à jour le planning d'un salarié |
| GET | `/api/signalements` | Signalements EPI |
| POST | `/api/signalements` | Créer un signalement |
| PATCH | `/api/signalements/:id/traite` | Marquer un signalement traité |

---

## 9. Données de démonstration

La base SQLite est auto-initialisée avec :

- **3 sites** : La Farlède, Cuers, Puget-sur-Argens
- **8 salariés** (PIN universel : `1234`)
  - Collecteurs (pause mobile autorisée) : Karim Benali, Inès Garcia, Léa Moreau
  - Opérateurs (pause physique uniquement) : Sophie Martin, Mehdi Roux, Lucas Petit, Fatou Diallo, Thomas Lefèvre
- **8 casques RFID** avec stickers numérotés `C-001` à `C-008`
- **2 badges managers** (UID `04RHMANAGER0` et `04ADMINCARDO`)
- **Associations** casque ↔ salarié pour aujourd'hui
- **Pointages** sur la semaine en cours (scénarios variés)
- **Planning** sur 5 jours, pauses matin & midi configurées

### Parcours de démonstration

**Parcours 1 – Collecteur (pause mobile)**
> Kiosque → connexion Karim Benali (PIN 1234) → Dashboard → bouton ☕ Prendre ma pause → confirmation

**Parcours 2 – Opérateur (lecture seule pauses)**
> Kiosque → connexion Sophie Martin (PIN 1234) → Dashboard → pas de bouton pause, prochaine pause affichée

**Parcours 3 – Pointage par RFID (simulation depuis le kiosque)**
> Bouton "sim:badge" → EPI validés automatiquement → arrivée enregistrée → dashboard mis à jour via Socket.io

**Parcours 4 – Badge manager**
> Badge RFID manager → redirection vers la page de connexion admin

---

## 10. Connexion admin

| Identifiant | Mot de passe | Accès |
|---|---|---|
| `rh` | `alchipass2026` | Paie, corrections, gestion salariés & rôles, planning |
| `admin` | `alchipass2026` | Sécurité, RFID, présence temps réel |

---

## 11. Points techniques notables

- **Orchestrateur badgeuse** (`server/hardware/badgeuse.js`) : script unifié qui
  enchaîne lecture RFID → identification DB → validation EPI via Digicode →
  enregistrement direct SQLite → émission Socket.io. En simulation (pas de GPIO),
  la validation EPI est auto-approuvée et l'action est enregistrée en BDD.
- **Rôle COLLECTEUR** : seuls les Collecteurs voient le bouton pause dans l'app.
  Le backend renvoie 403 si un Opérateur tente d'appeler l'endpoint avec
  `origine: 'app'`. L'administrateur attribue les rôles dans Espace Admin → Salariés.
- **Machine à états RFID** : absent → arrivée (EPI), en_pause → pause_fin (EPI),
  present → pause/départ, parti → notification.
- **Interruption RFID non destructive** : la session employé est sauvegardée dans
  une `ref` et restaurée automatiquement après confirmation.
- **Mise à jour temps réel** : `badgeuse:confirme` affiche la confirmation sur le
  dashboard de l'employé connecté ; `pointages:refresh` recharge tous les pointages
  dans AppContext via un événement `CustomEvent` global.
- **Système de rappel de pause** : `setInterval` à 10 s vérifie les `pausesDefaut`.
  Déclenche à −5 min du début et −2 min de la fin : Browser Notifications API,
  bip Web Audio, toast in-app. Une `Set` ref évite les doublons.
- **Sidebar responsive Admin/RH** : media query `(max-width: 900px)` → mini (64 px,
  icônes seules) ; bouton ☰ pour déployer à 230 px, transition CSS 0.28 s.
- **Calcul du temps travaillé** = (départ − arrivée) − somme des pauses. Cas
  limites gérés : journée à cheval sur minuit, pause non clôturée.
- **Traçabilité** : toute correction RH conserve l'heure originale, l'auteur et
  la date (`heure_corrigee` + tableau `modifications` JSON).
- **EPI obligatoires** à l'arrivée et au retour de pause (gilet, bottes, casque —
  validés via Digicode sur la borne, stockés en BDD).
- **Export CSV** au format point-virgule avec BOM UTF-8 (ouverture directe dans
  Excel en français, accents corrects).
- **Fallback matériel** : GPIO optionnels, simulation activée automatiquement.
- **Polling RFID** : intervalle 200 ms avec anti-rebond (même UID ignoré 2 s).
- **WAL mode SQLite** : journal en écriture anticipée pour performances maximales
  sur la carte SD du Pi.
- **Compatibilité noms de champs** : les routes `POST/PUT /api/salaries` acceptent
  indifféremment `pin`/`code_pin`, `siteId`/`site_id`, `heuresHebdo`/`heures_hebdo`.
