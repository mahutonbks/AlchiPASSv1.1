===========================================================
 AlchiPass - ReadMe technique - GarageWeek 2026
===========================================================

NOM DU PROJET : AlchiPass
EQUIPE        : Groupe 16
CLIENT        : Les Alchimistes Cote d'Azur
OBJET         : Pointage numerique des heures (remplace le papier)

-----------------------------------------------------------
1. TECHNOLOGIES UTILISEES
-----------------------------------------------------------
Frontend :
  - React 18 (bibliotheque d'interface)
  - Vite 5 (outil de build et serveur de developpement)
  - React Router 6 (navigation entre les ecrans)
  - socket.io-client (reception RFID + confirmations badgeuse en temps reel)
  - Langage : JavaScript (JSX), CSS pur

Backend (Raspberry Pi) :
  - Node.js + Express 4 (serveur REST)
  - Socket.io 4 (push RFID et confirmations vers les navigateurs)
  - better-sqlite3 v12 (base de donnees locale, API synchrone)

Hardware (optionnel, Raspberry Pi uniquement) :
  - mfrc522-rpi + rpi-softspi (lecteur RFID RC522 via SPI)
  - onoff (pave numerique GPIO 4x4 — Digicode EPI)
  Ces paquets sont en "optionalDependencies" : npm les ignore
  automatiquement sur PC Windows/Mac/Linux.

-----------------------------------------------------------
2. PREREQUIS
-----------------------------------------------------------
- Node.js version 18 ou superieure (https://nodejs.org, LTS)
- npm version 9 ou superieure

-----------------------------------------------------------
3. INSTALLATION ET LANCEMENT
-----------------------------------------------------------

>>> MODE DEVELOPPEMENT (PC) <<<

  Ouvrir deux terminaux dans le dossier du projet :

  Terminal 1 - backend :
    npm install        (une seule fois)
    npm run server     (lance Express + Socket.io + SQLite sur :3001)

  Terminal 2 - frontend :
    npm run dev        (Vite avec proxy API, accessible sur :5173)

  La base SQLite (alchipass.db) est creee et seedee automatiquement
  au premier demarrage du serveur.

  En mode simulation (sans Raspberry Pi) :
  - La validation EPI est automatiquement approuvee
  - Utilisez le bouton "sim:badge" dans /kiosque pour simuler un badge
  - Le workflow complet est execute : identification -> EPI -> enregistrement BDD

>>> PRODUCTION (Raspberry Pi) <<<

  npm install         (installe aussi les paquets GPIO natifs)
  npm start           (build le frontend puis lance le serveur)

  L'application est ensuite accessible sur http://<IP_DU_PI>:3001
  depuis tous les appareils du reseau (tablettes, PC, telephones).

  Pour un demarrage automatique au boot :
    pm2 start ecosystem.config.cjs  (avec PM2)
    -- ou --
    sudo cp alchipass.service /etc/systemd/system/
    sudo systemctl enable alchipass
    sudo systemctl start alchipass  (avec systemd)

-----------------------------------------------------------
4. COMPTES DE DEMONSTRATION
-----------------------------------------------------------
- Salaries          : PIN par defaut 1234 (tous les salaries)
- Espace RH         : identifiant "rh"    / mot de passe "alchipass2026"
- Espace Admin/Secu : identifiant "admin" / mot de passe "alchipass2026"

Salaries COLLECTEUR (bouton pause mobile actif) :
  - Karim Benali    (site La Farlede)
  - Ines Garcia     (site Cuers)
  - Lea Moreau      (site Cuers)

Salaries OPERATEUR (pause uniquement via badgeuse physique) :
  - Sophie Martin, Mehdi Roux, Lucas Petit, Fatou Diallo, Thomas Lefevre

-----------------------------------------------------------
5. STRUCTURE DES FICHIERS
-----------------------------------------------------------
index.html                  Page hote
package.json                Dependances et scripts npm
vite.config.js              Config Vite + proxy /api et /socket.io
ecosystem.config.cjs        Config PM2 (production)
alchipass.service           Unite systemd (production)
alchipass.db                Base SQLite (generee au premier lancement)

server/
  index.js                  Serveur Express + Socket.io (port 3001)
  database.js               Schema SQLite + seed de demonstration
  routes/
    salaries.js             CRUD salaries & sites, login admin
                            (accepte camelCase et snake_case)
    pointages.js            CRUD badgeages — verification role COLLECTEUR
                            pour pauses distantes (origine: 'app')
    casques.js              CRUD casques RFID, associations, badges managers
    misc.js                 Pauses, planning, signalements EPI
  hardware/
    badgeuse.js             Orchestrateur physique : RFID + Digicode EPI
                            + enregistrement BDD + emission Socket.io
    rfid.js                 Polling RC522 200ms (fallback simulation sur PC)
    keypad.js               Pave numerique GPIO 4x4 (fallback simulation)

src/
  main.jsx                  Point d'entree React + routeur
  App.jsx                   Definition des routes
  styles.css                Feuille de style (identite visuelle)
  context/
    AppContext.jsx          Etat global + appels API REST
                            + refresh via evenement alchipass:refresh
  pages/
    Accueil.jsx             Ecran d'entree (choix du mode)
    Kiosque.jsx             Application personnelle employe
                              Login -> Dashboard -> Planning -> Historique
                              Bouton pause : visible uniquement pour COLLECTEUR
                              Socket.io : rfid:badge, badgeuse:confirme,
                                          pointages:refresh
    AdminConnexion.jsx      Connexion RH / Admin
    Admin.jsx               Espace manager (vue RH ou securite)
                              GestionSalaries : selecteur role COLLECTEUR/OPERATEUR
  components/
    Communs.jsx             Logo, horloge temps reel, en-tete
  utils/
    time.js                 Dates, heures, calcul du temps travaille,
                            etats et actions autorisees
    rapports.js             Agregation des heures, anomalies, export CSV

-----------------------------------------------------------
6. FLUX DE POINTAGE RFID (BADGEUSE PHYSIQUE)
-----------------------------------------------------------
1. Le RC522 sur le Pi detecte un badge (uid hex).
2. server/hardware/rfid.js remonte l'UID via demarrerPolling().
3. server/hardware/badgeuse.js prend en charge :
   a. Identification : uid_rfid -> casque -> association -> salarie (DB)
   b. Calcul de l'etat courant (absent / present / en_pause / parti)
   c. Etat absent ou en_pause :
      - Affichage EPI sur ecran / Digicode physique
      - 1=Gilet  2=Bottes  3=Casque  4=Valider  *=Reset
      - Timeout 30s si aucune saisie
   d. Etat present :
      - Digicode : 1=Pause  2=Depart  *=Annuler
   e. Enregistrement direct en SQLite (origine: 'badgeuse')
   f. io.emit('badgeuse:confirme') -> dashboard employe mis a jour
      io.emit('pointages:refresh') -> rechargement liste pointages
4. Badge manager : io.emit('rfid:badge', { manager: true }) -> redirection admin

-----------------------------------------------------------
7. REGLES METIER PAUSES
-----------------------------------------------------------
COLLECTEUR :
  - Bouton "Prendre ma pause" visible dans le dashboard mobile
  - POST /api/pointages avec { origine: 'app' } -> autorise
  - Notifications de rappel de pause actives

OPERATEUR :
  - Bouton pause cache dans l'interface
  - POST /api/pointages avec { origine: 'app' } -> HTTP 403 Interdit
  - Pointage de pause UNIQUEMENT via badgeuse physique
  - Prochaine pause collective affichee + notifications de rappel actives

Attribution des roles : Espace Admin -> Salaries -> Modifier -> champ "Role"

-----------------------------------------------------------
8. EVENEMENTS SOCKET.IO
-----------------------------------------------------------
rfid:badge        Server -> Client   UID badge detecte (manager ou simulation)
sim:badge         Client -> Server   Simulation badge depuis le navigateur (dev)
badgeuse:confirme Server -> Client   Pointage physique enregistre
                                     { salarieId, prenom, action, timestamp, epi }
pointages:refresh Server -> Client   Signal rechargement liste pointages

-----------------------------------------------------------
9. POINTS TECHNIQUES NOTABLES
-----------------------------------------------------------
- Orchestrateur badgeuse.js : RFID + Digicode + SQLite + Socket.io en un seul
  module. Fallback simulation complet si GPIO non disponibles (PC).
- Verification role backend : les routes salaries acceptent pin/code_pin,
  siteId/site_id, heuresHebdo/heures_hebdo (camelCase ET snake_case).
- Machine a etats : seules les actions logiques sont proposees
  (pas de depart sans arrivee, etc.).
- Calcul du temps travaille = (depart - arrivee) - somme des pauses.
  Cas limites geres : journee a cheval sur minuit, pause non cloturee.
- Traçabilite : toute correction conserve l'heure originale,
  l'auteur et la date (champ heure_corrigee + tableau modifications).
- EPI obligatoires a l'arrivee et au retour de pause
  (gilet, bottes, casque - valides via Digicode, stockes en BDD).
- Export CSV au format point-virgule avec BOM UTF-8 (ouverture
  directe dans Excel en francais, accents corrects).
- Les paquets GPIO sont optionnels : le serveur detecte leur absence
  et active automatiquement le mode simulation.
- Polling RFID : intervalle 200ms avec anti-rebond (meme UID ignore 2s).
- WAL mode SQLite : performances optimales sur carte SD.

-----------------------------------------------------------
10. TABLES DE LA BASE SQLITE
-----------------------------------------------------------
sites                  Sites geographiques
salaries               Employes (code_pin, site_id, heures_hebdo, ROLE)
                       role : 'OPERATEUR' (defaut) | 'COLLECTEUR'
casques                Stickers RFID RC522 (uid_rfid, num interne)
badges_managers        Badges RH/admin (uid_rfid, role)
associations_journ.    Casque du jour (salarie <-> sticker)
badgeages_reels        Pointages (type_evenement, timestamp, EPI, origine,
                       heure_corrigee, modifications)
                       origine : 'badgeuse' | 'pointage' | 'app' | 'correction'
epi_renouvellements    Signalements equipements a renouveler
planning               Horaires previsionnels par salarie
pauses_defaut          Pauses collectives (matin 10h30, midi 12h30)
admin_comptes          Comptes rh et admin

===========================================================
