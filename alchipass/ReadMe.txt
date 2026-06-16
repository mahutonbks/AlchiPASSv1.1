===========================================================
 AlchiPass - ReadMe technique - GarageWeek 2026
===========================================================

NOM DU PROJET : AlchiPass
EQUIPE        : Groupe 16
CLIENT        : Les Alchimistes Cote d'Azur
OBJET         : Pointage numerique des heures (remplace le papier)
PI IP         : 10.115.166.244

-----------------------------------------------------------
1. TECHNOLOGIES UTILISEES
-----------------------------------------------------------
Frontend :
  - React 18 (bibliotheque d'interface)
  - Vite 5 (outil de build et serveur de developpement)
  - React Router 6 (navigation entre les ecrans)
  - socket.io-client (reception RFID + confirmations badgeuse en temps reel)
  - Langage : JavaScript (JSX), CSS pur
  - Responsive mobile (media query max-width: 640px)

Backend (Raspberry Pi) :
  - Node.js + Express 4 (serveur REST)
  - Socket.io 4 (push RFID et confirmations vers les navigateurs)
  - better-sqlite3 v12 (base de donnees locale, API synchrone, WAL mode)

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
    npm run server     (lance Express + Socket.io + SQLite sur :3000)

  Terminal 2 - frontend :
    npm run dev        (Vite avec proxy API, accessible sur :5173)

  La base SQLite (alchipass.db) est creee et seedee automatiquement
  au premier demarrage du serveur.

  En mode simulation (sans Raspberry Pi) :
  - La validation EPI est automatiquement approuvee
  - Utilisez le bouton "sim:badge" dans /kiosque pour simuler un badge
  - Le workflow complet est execute : identification -> EPI -> enregistrement BDD

  Developper contre le Raspberry Pi :
    Creer le fichier .env.local a la racine du projet avec :
      VITE_API_TARGET=http://10.115.166.244:3000
    Puis relancer "npm run dev" — le proxy Vite pointe vers le Pi.

>>> PRODUCTION (Raspberry Pi) <<<

  npm install         (installe aussi les paquets GPIO natifs)
  npm start           (build le frontend puis lance le serveur sur :3000)

  L'application est ensuite accessible sur http://10.115.166.244:3000
  depuis tous les appareils du reseau (tablettes, PC, telephones).

  Note port : le serveur ecoute sur le port 3000 par defaut.
  Cela correspond a URL_BASE = 'http://127.0.0.1:3000/api' dans
  le script Python du Pi. Pour changer : PORT=3001 npm start

  Pour un demarrage automatique au boot :
    pm2 start ecosystem.config.cjs  (avec PM2)
    -- ou --
    sudo cp alchipass.service /etc/systemd/system/
    sudo systemctl enable alchipass
    sudo systemctl start alchipass  (avec systemd)

  Activer SPI pour le RC522 :
    sudo raspi-config -> Interface Options -> SPI -> Enable
    Verifier : ls /dev/spidev*  (doit afficher /dev/spidev0.0)

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
                            (cible via VITE_API_TARGET dans .env.local)
.env.example                Exemple de variables d'environnement
ecosystem.config.cjs        Config PM2 (production)
alchipass.service           Unite systemd (production)
alchipass.db                Base SQLite (generee au premier lancement)

server/
  index.js                  Serveur Express + Socket.io (port 3000)
  database.js               Schema SQLite + seed de demonstration
  routes/
    salaries.js             CRUD salaries & sites, login admin
                            (accepte camelCase et snake_case)
    pointages.js            CRUD badgeages — verification role COLLECTEUR
                            pour pauses distantes (origine: 'app')
    casques.js              CRUD casques RFID, associations, badges managers
    misc.js                 Pauses, planning, signalements EPI, feedbacks
    hardware.js             Bridge API pour script Python Pi :
                              POST /api/badge
                              POST /api/authentifier
                              POST /api/evenement
                              GET  /api/historique
  hardware/
    badgeuse.js             Orchestrateur physique : RFID + Digicode EPI
                            + enregistrement BDD + emission Socket.io
    rfid.js                 Polling RC522 200ms (fallback simulation sur PC)
    keypad.js               Pave numerique GPIO 4x4 (fallback simulation)

src/
  main.jsx                  Point d'entree React + routeur
  App.jsx                   Definition des routes
  styles.css                Feuille de style responsive (mobile <= 640px)
  context/
    AppContext.jsx          Etat global + appels API REST + feedbacks
  pages/
    Accueil.jsx             Ecran d'entree (choix du mode)
    Kiosque.jsx             Application personnelle employe
                              Login : liste boutons compatible Android
                              Dashboard -> Planning -> Historique
                              FeedbackJournee (note 1-5 etoiles apres depart)
                              Socket.io : rfid:badge, badgeuse:confirme
    AdminConnexion.jsx      Connexion RH / Admin
    Admin.jsx               Espace manager (vue RH ou securite)
                              VueFeedbacks : notes + commentaires + KPIs
  components/
    Communs.jsx             Logo, horloge temps reel, en-tete
  utils/
    time.js                 Dates, heures, calcul du temps travaille,
                            etats et actions autorisees
    rapports.js             Agregation des heures, anomalies, export CSV

-----------------------------------------------------------
6. FLUX DE POINTAGE RFID (BADGEUSE NODE.JS - CHEMIN A)
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
7. BRIDGE API SCRIPT PYTHON (CHEMIN B)
-----------------------------------------------------------
Le script Python du Pi (URL_BASE = 'http://127.0.0.1:3000/api') peut
communiquer avec le serveur via ces endpoints :

POST /api/badge
  Corps   : { uid: "390476793230" }
  Reponse : { role: "OUVRIER" | "ADMIN" | "RH" | "INCONNU", nom, salarieId }
  Action  : identifie le badge (manager ou casque salarie), emet rfid:badge

POST /api/authentifier
  Corps   : { password: "1234" }
  Reponse : { status: "OK", nom, salarieId } | { status: "ERREUR" }
  Action  : verifie le code PIN dans la table salaries

POST /api/evenement
  Corps   : { action, ouvrier, uid_casque, uid, nom, etape }
  Reponse : { status: "OK" }
  Actions gerees :
    CASQUE_OK/NOK, GILET_OK/NOK  -> accumulation EPI en session memoire
    CHAUSSURES_OK/NOK            -> mappe vers "bottes" dans notre schema
    CONNEXION_CASQUE_VALIDE      -> INSERT Arrivee + io.emit badgeuse:confirme
    FIN_VALIDATION_OK            -> idem
    DECONNEXION_OUVRIER          -> INSERT Depart  + io.emit badgeuse:confirme
    CONNEXION_ADMIN/RH           -> io.emit rfid:badge (dashboard)
    ECHEC_VALIDATION_EPI         -> pas de pointage, nettoyage session EPI

GET /api/historique
  Reponse : 200 derniers pointages { type, salarieId, date, origine }

-----------------------------------------------------------
8. FEEDBACK JOURNEE
-----------------------------------------------------------
Apres le pointage de depart d'un salarie :
- L'ecran de confirmation reste 2 secondes
- Puis l'ecran de feedback s'affiche (FeedbackJournee dans Kiosque.jsx)
- Le salarie peut donner une note de 1 a 5 etoiles
  (label anime : Journee difficile -> Excellente journee)
- Un champ commentaire apparait si une note est selectionnee
- Bouton "Envoyer" (desactive si note = 0) + bouton "Passer"
- La soumission appelle POST /api/feedbacks et restaure la session
- Les feedbacks sont visibles dans Admin -> Feedbacks salaries :
  tableau notes/commentaires, filtrage par salarie, KPIs (total, moyenne)

-----------------------------------------------------------
9. SELECTEUR EMPLOYE ANDROID-COMPATIBLE
-----------------------------------------------------------
Le <select> natif HTML cause des problemes sur Android WebView :
  - Les emojis dans les <option> ne s'affichent pas correctement
  - Le onChange n'est pas toujours declenche

Remplacement : liste de <button> dans un div scrollable
  - .login-liste : conteneur avec overflow-y: auto, -webkit-overflow-scrolling
  - Chaque bouton affiche avatar + prenom nom + fleche >
  - Clic -> selecte le salarie, affiche le clavier PIN
  - Bouton "Changer" pour revenir a la liste

-----------------------------------------------------------
10. RESPONSIVE MOBILE
-----------------------------------------------------------
Media query @media (max-width: 640px) :
  - Header kiosque : masque la date (seule l'heure reste visible)
  - Grilles formulaires : passage a 1 colonne (grid-template-columns: 1fr)
  - Actions de pointage : colonne unique
  - .carte : overflow-x: auto pour les tableaux larges
  - Police horloge reduite
  - Sidebar Admin/RH : mini (64px icones) a partir de 900px

-----------------------------------------------------------
11. REGLES METIER PAUSES
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
12. EVENEMENTS SOCKET.IO
-----------------------------------------------------------
rfid:badge        Server -> Client   UID badge detecte (manager ou simulation)
sim:badge         Client -> Server   Simulation badge depuis le navigateur (dev)
badgeuse:confirme Server -> Client   Pointage physique enregistre
                                     { salarieId, prenom, action, timestamp, epi }
pointages:refresh Server -> Client   Signal rechargement liste pointages

-----------------------------------------------------------
13. TABLES DE LA BASE SQLITE
-----------------------------------------------------------
sites                  Sites geographiques
salaries               Employes (code_pin, site_id, heures_hebdo, ROLE)
                       role : 'OPERATEUR' (defaut) | 'COLLECTEUR'
casques                Stickers RFID RC522 (uid_rfid, num interne)
badges_managers        Badges RH/admin (uid_rfid, role)
associations_journ.    Casque du jour (salarie <-> sticker)
badgeages_reels        Pointages (type_evenement, timestamp, EPI, origine,
                       heure_corrigee, modifications)
                       origine : 'badgeuse' | 'badgeuse-pi' | 'app' | 'correction'
feedbacks              Notes journee employe (id_salarie, date, note 1-5,
                       commentaire, timestamp)
epi_renouvellements    Signalements equipements a renouveler
planning               Horaires previsionnels par salarie
pauses_defaut          Pauses collectives (matin 10h30, midi 12h30)
admin_comptes          Comptes rh et admin

-----------------------------------------------------------
14. API REST - RESUME
-----------------------------------------------------------
Salaries & sites :
  GET    /api/salaries
  POST   /api/salaries
  PUT    /api/salaries/:id
  PATCH  /api/salaries/:id/actif
  GET    /api/salaries/sites
  POST   /api/admin/login

Pointages :
  GET    /api/pointages
  POST   /api/pointages         { salarieId, type, epiData, origine }
  PUT    /api/pointages/:id     { nouveauTimestamp, auteur }
  POST   /api/pointages/manuel  { salarieId, type, timestamp, auteur }
  DELETE /api/pointages/:id

Casques & RFID :
  GET/POST/PUT/DELETE /api/casques
  GET/POST/DELETE     /api/casques/associations
  GET/POST/DELETE     /api/casques/badges-managers

Pauses, planning, signalements :
  GET/PUT  /api/pauses/:id
  GET/PUT  /api/planning/:salarieId
  GET/POST /api/signalements
  PATCH    /api/signalements/:id/traite

Feedbacks :
  GET  /api/feedbacks
  POST /api/feedbacks         { salarieId, note, commentaire }

Hardware bridge (script Python Pi) :
  POST /api/badge             { uid }
  POST /api/authentifier      { password }
  POST /api/evenement         { action, ouvrier, uid_casque, ... }
  GET  /api/historique

-----------------------------------------------------------
15. POINTS TECHNIQUES NOTABLES
-----------------------------------------------------------
- Orchestrateur badgeuse.js : RFID + Digicode + SQLite + Socket.io en un seul
  module. Fallback simulation complet si GPIO non disponibles (PC).
- Hardware bridge hardware.js : les 3 endpoints Pi accumulent les EPI en
  memoire entre les appels. Pointage cree uniquement a CONNEXION_CASQUE_VALIDE.
  Mapping CHAUSSURES -> bottes dans notre schema DB.
- Compatibilite Raspberry Pi 5 : mfrc522-rpi / WiringPi sont incompatibles
  avec le chip RP1 du Pi 5. Seul le script Python RFID (spidev) fonctionne
  en hardware sur Pi 5. Les messages "simulation mode" dans les logs sont
  attendus et inoffensifs sur Pi 5.
- CRUD complet casques & badges managers : ajout, edition inline dans le
  tableau (UID, numero, etat, label, role), suppression avec modal de
  confirmation. Si l'UID d'un badge manager est modifie, l'ancien enregistrement
  est supprime et un nouveau est insere (contrainte PK uid_rfid).
- Suppression casques (FK SQLite) : foreign_keys = ON est actif. La suppression
  d'un casque utilise une transaction qui efface d'abord les
  associations_journalieres concernees, puis le casque, pour eviter la
  violation de cle etrangere.
- Modal de confirmation (ModalConfirmation) : rendu via createPortal vers
  document.body pour echapper aux parents overflow-y: auto. position: fixed,
  backdrop-filter: blur, max-height: calc(100dvh - 32px), animation pop.
- Confirm modal - pattern intent : l'etat stocke { type, id, uid } plutot
  qu'une fonction callback pour eviter les closures perimees dans useState.
  executerSuppression() lit le type et appelle la bonne fonction avec une
  closure fraiche a chaque render.
- FeedbackJournee : affichage 2s apres confirmation depart. Note 1-5 etoiles
  avec hover anime, commentaire conditionnel si note > 0. Bouton "Passer".
- Selecteur employe Android : <select> remplace par liste de boutons natifs
  pour compatibilite Android WebView (emojis + onChange fiables).
- Responsive mobile : masquage date header <= 640px, grilles en colonne unique.
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
- VITE_API_TARGET dans .env.local pour pointer le proxy vers le Pi en dev.

===========================================================
