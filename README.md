# Poker Tracker Pro v2.0

Application professionnelle de suivi et d'analyse pour le poker Spin & Go.

## 🏗️ Architecture

```
poker-tracker-pro/
├── main.js                    # Process principal Electron (IPC)
├── package.json               # Dépendances Electron
├── poker.db                   # Base de données SQLite
├── backend/                   # Backend Python complet
│   ├── server.py             # Serveur Flask API (port 5050)
│   ├── database.py           # Gestion SQLite
│   ├── equity_calculator.py  # Calculs d'équité (Treys)
│   ├── analysis_engine.py    # Détection de leaks
│   ├── requirements.txt      # Dépendances Python
│   └── parsers/              # Parsers multi-rooms
│       ├── __init__.py
│       ├── base_parser.py    # Classe abstraite + Factory
│       ├── betclic_parser.py # Parser Betclic Spin & Rush
├── frontend/                  # Application React
│   ├── src/
│   │   ├── components/       # Composants UI
│   │   │   ├── layout/       # Layout, Sidebar, Header
│   │   │   ├── ui/           # Composants réutilisables
│   │   │   └── charts/       # Graphiques
│   │   ├── pages/            # Pages de l'application
│   │   │   ├── Dashboard/
│   │   │   ├── Players/
│   │   │   ├── HandHistory/
│   │   │   ├── LeakAnalysis/
│   │   │   ├── RangeAnalysis/
│   │   │   └── Settings/
│   │   ├── stores/           # État global (Zustand)
│   │   ├── services/         # Services IPC/Python
│   │   ├── hooks/            # Hooks React personnalisés
│   │   └── utils/            # Utilitaires
│   └── package.json
└── exemple-data/              # Fichiers de test
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
# 1. Installer les dépendances Electron
npm install

# 2. Installer les dépendances React
cd frontend
npm install
cd ..

# 3. Installer les dépendances Python
pip install -r backend/requirements.txt
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
| `/parse/file` | POST | Parser un fichier d'historique |
| `/parse/detect` | POST | Détecter le format d'un fichier |
| `/db/insert-hands` | POST | Insérer des mains en base |
| `/db/hands` | GET | Récupérer les mains (avec filtres) |
| `/db/dashboard-stats` | GET | Statistiques du dashboard |
| `/db/winrate-chart` | GET | Données graphique winrate |
| `/db/range-heatmap` | GET | Heatmap des ranges |
| `/db/players` | GET | Liste des joueurs |
| `/db/player/:name` | GET | Détails d'un joueur |
| `/db/delete-all` | DELETE | Supprimer toutes les mains |
| `/equity` | POST | Calcul d'équité hero vs villain |
| `/equity/batch` | POST | Calcul en batch |
| `/analyze/leaks` | POST | Détection de leaks |
| `/analyze/range` | POST | Analyse de range par position |
| `/recalculate-ev` | POST | Recalcul EV toutes les mains |

## 🎰 Rooms Supportées

| Room | Format | Tournois |
|------|--------|----------|
| **Betclic** | Texte | Spin & Rush |

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

- **Electron 28** - Framework desktop cross-platform
- **React 18** - Interface utilisateur
- **Vite** - Build tool ultra-rapide
- **TailwindCSS** - Styling utilitaire
- **Zustand** - Gestion d'état légère
- **Recharts** - Graphiques React
- **SQLite (Python)** - Base de données embarquée
- **Python/Flask** - Backend complet (parsing, BDD, calculs)
- **Treys** - Évaluation des mains de poker

## 📝 License

MIT
