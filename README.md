# Poker Tracker Pro v2.0

Application professionnelle de suivi et d'analyse pour le poker Spin & Go.

## 🏗️ Architecture

```
poker-tracker-pro/
├── main.js                    # Process principal Electron
├── package.json               # Dépendances principales
├── electron/                  # Modules Electron
│   ├── database/             # Base de données SQLite
│   │   └── database.js
│   └── parser/               # Parser de hand history
│       └── handParser.js
├── backend/                   # Backend Python pour les calculs
│   ├── server.py             # Serveur Flask API
│   ├── equity_calculator.py  # Calculs d'équité (Treys)
│   ├── analysis_engine.py    # Détection de leaks
│   └── requirements.txt      # Dépendances Python
└── frontend/                  # Application React
    ├── src/
    │   ├── components/       # Composants UI
    │   │   ├── layout/       # Layout, Sidebar, Header
    │   │   ├── ui/           # Composants réutilisables
    │   │   └── charts/       # Graphiques
    │   ├── pages/            # Pages de l'application
    │   │   ├── Dashboard/
    │   │   ├── Players/
    │   │   ├── HandHistory/
    │   │   ├── LeakAnalysis/
    │   │   ├── RangeAnalysis/
    │   │   └── Settings/
    │   ├── stores/           # État global (Zustand)
    │   ├── services/         # Services IPC/Python
    │   ├── hooks/            # Hooks React personnalisés
    │   └── utils/            # Utilitaires
    └── package.json
```

## 🚀 Installation

### Prérequis

- **Node.js** 18+ (https://nodejs.org/)
- **Python** 3.8+ (https://python.org/)
- **npm** ou **yarn**

### Installation automatique (Windows)

```bash
.\setup.bat
```

### Installation manuelle

```bash
# 1. Installer les dépendances principales
npm install

# 2. Installer les dépendances React
cd frontend
npm install
cd ..

# 3. Installer les dépendances Python
pip install -r backend/requirements.txt

# 4. Reconstruire les modules natifs
npx electron-rebuild -f -w better-sqlite3
```

## 🎮 Utilisation

### Mode développement

```bash
npm run dev
```

Cela démarre :
- Le serveur de développement Vite (React) sur http://localhost:3000
- L'application Electron avec DevTools
- Le backend Python sur le port 5050

### Build production

```bash
npm run build
```

## 🧮 Calculs Python

Le backend Python utilise des librairies optimisées pour les calculs d'équité :

- **Treys** - Évaluation rapide des mains de poker (7 cartes)
- **NumPy** - Calculs vectorisés haute performance
- **Flask** - API REST pour la communication avec Electron

### API Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Vérification de l'état du serveur |
| `/equity` | POST | Calcul d'équité hero vs villain |
| `/equity/batch` | POST | Calcul en batch pour plusieurs mains |
| `/analyze/leaks` | POST | Détection de leaks dans l'historique |
| `/analyze/range` | POST | Analyse de range par position |
| `/recalculate-ev` | POST | Recalcul de l'EV pour toutes les mains |

## 📊 Fonctionnalités

### Dashboard
- Statistiques globales (profit, mains jouées, winrate)
- Graphique d'évolution du profit vs EV
- Historique des sessions récentes

### Analyse des Joueurs
- Liste des adversaires rencontrés
- Statistiques détaillées (VPIP, PFR, 3-Bet, C-Bet)
- Profit par joueur

### Historique des Mains
- Recherche et filtrage avancés
- Détails complets de chaque main
- Replay visuel

### Détection de Leaks
- Analyse automatique des erreurs de jeu
- Classification par sévérité (critique, majeur, mineur)
- Suggestions de correction

### Analyse de Ranges
- Heatmap interactive des ranges par position
- Comparaison avec les ranges GTO
- Fréquences par type de main

## 🛠️ Technologies

- **Electron** - Framework desktop cross-platform
- **React 18** - Interface utilisateur
- **Vite** - Build tool ultra-rapide
- **TailwindCSS** - Styling utilitaire
- **Zustand** - Gestion d'état légère
- **Recharts** - Graphiques React
- **SQLite** - Base de données embarquée
- **Python/Flask** - Backend de calculs

## 📝 License

MIT
"# poker-tracker" 
