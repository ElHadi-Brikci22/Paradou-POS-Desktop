# PARADOU POS DESKTOP (Caisse Tactile & Blanchisserie)

Application de caisse tactile professionnelle native (Electron) fonctionnant en **mode DUAL** :
- **En Ligne (Web Cloud)** : Synchronisation automatique en temps réel avec le serveur central Laravel (`/api/pos/*`).
- **Hors-Ligne (Secours)** : Fonctionnement autonome ininterrompu en cas de panne d'Internet ou de coupure réseau locale, encaissement rapide, file d'attente locale et impression silencieuse de tickets de caisse 80mm ESC/POS.
- **Auto-Sync** : Détection automatique du retour de connexion par watchdog réseau et transfert immédiat des commandes locales vers le Cloud sans doublon (idempotence garantie par UUID).

---

## Architecture du Projet
```
paradou-pos-desktop/
├── src/
│   ├── main/
│   │   └── main.js          # Processus principal Electron (fenêtre native, watchdog OS, silent print)
│   ├── preload/
│   │   └── preload.js       # Pont sécurisé IPC (contextBridge isolé)
│   └── renderer/
│       ├── index.html       # Interface caisse tactile (Header watchdog, 3 niveaux compacts, Panier)
│       ├── css/
│       │   └── app.css      # Design system moderne dark theme
│       └── js/
│           └── app.js       # Moteur caisse, cache local IndexedDB/localStorage, auto-sync, silent print
├── package.json             # Dépendances et scripts
├── demarrer_caisse.bat      # Lanceur 1-clic pour Windows
└── .gitignore
```

---

## Démarrage Rapide

### Option 1 : Double-clic
Double-cliquez sur `demarrer_caisse.bat` (ou `demarrer_caisse_desktop.bat` à la racine).

### Option 2 : En ligne de commande
```bash
cd paradou-pos-desktop
npm start
```

---

## Configuration de la Caisse
Cliquez sur l'icône d'engrenage (⚙️) en haut à droite pour :
- Définir l'URL du serveur central (par défaut `http://paradou.test` ou votre URL Cloud `https://monpressing.com`).
- Définir le code du terminal (ex: `POS-CAISSE-01`).
- Sélectionner l'imprimante thermique de tickets de caisse (ESC/POS 80mm).
- Forcer un rafraîchissement complet du catalogue depuis le Cloud.
