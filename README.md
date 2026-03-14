# SpinTracker

Application professionnelle de suivi et d'analyse de tournois Spin & Go.

## 🏗️ Architecture

```
spintracker/
├── main.js                    # Process principal Electron (IPC)
├── package.json               # Dépendances Electron
├── backend/                   # Backend C# .NET 8
│   ├── Controllers/           # API REST
│   ├── Services/              # Services métier
│   ├── Engines/              # Calculs (Equity, Analytics)
│   ├── Parsers/              # Parsers multi-rooms
│   │   ├── BetclicParser.cs
│   │   └── PokerStarsParser.cs
│   ├── Data/                 # Accès données SQLite
│   │   └── Repositories/
│   ├── Models/               # Modèles de données
│   └── Migrations/           # Migrations base de données
├── frontend/                  # Application React (Electron)
│   ├── src/
│   │   ├── components/       # Composants UI
│   │   │   ├── layout/       # Layout, Sidebar, Header
│   │   │   ├── ui/           # Composants réutilisables
│   │   │   ├── charts/       # Graphiques (RangeGrid, WinrateChart, RangeHeatmap)
│   │   │   └── replayer/     # Composants du replayer
│   │   ├── pages/            # Pages de l'application
│   │   │   ├── Dashboard/
│   │   │   ├── HandHistory/
│   │   │   ├── Analysis/
│   │   │   ├── Replayer/
│   │   │   ├── RangeResearch/
│   │   │   └── Settings/
│   │   ├── stores/           # État global (Zustand)
│   │   ├── services/         # Services IPC/C#
│   │   ├── hooks/            # Hooks React personnalisés
│   │   ├── locales/          # Traductions (i18n)
│   │   └── utils/            # Utilitaires
│   └── package.json
├── website/                   # Site web Next.js (Vercel)
│   ├── src/
│   │   ├── app/              # Pages Next.js
│   │   ├── components/       # Composants React
│   │   └── messages/         # Traductions i18n
│   └── package.json
└── assets/                    # Ressources (logo, icônes)
```

## 🚀 Installation

### Prérequis

- **Node.js** 18+
- **.NET SDK** 8.0+ (https://dotnet.microsoft.com/download)
- **npm**

### Installation rapide (Application Electron)

```bash
npm run setup
```

Cela installera :
1. Les dépendances Electron
2. Les dépendances React
3. Le build du backend C#

### Installation rapide (Website Next.js)

```bash
cd website
npm install
```

## 🎮 Utilisation

### Application Electron

#### Mode développement

```bash
npm run dev
```

Cela démarre :
- Le serveur de développement Vite (React) sur http://localhost:3000
- L'application Electron avec DevTools
- Le backend C# sur le port 5050

#### Lancer le backend seul

```bash
cd backend
dotnet run
```

#### Build production (Windows)

```bash
npm run build
```

#### Créer l'installateur

```bash
npm run publish
```

### Website Next.js

#### Mode développement

```bash
cd website
npm run dev
```

#### Build production

```bash
cd website
npm run build
```

#### Déployer sur Vercel

Le website est automatiquement déployé sur Vercel via GitHub Actions. Pour déployer manuellement :

```bash
cd website
vercel deploy
```

Ou connectez le repository GitHub à Vercel pour un déploiement automatique.

## 🧮 Backend C#

Le backend C# utilise :
- **ASP.NET Core** - API REST performante
- **SQLite** - Base de données embarquée
- **Manjar** - Évaluation des mains de poker

### API Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Vérification de l'état du serveur |
| `/parser/parse-file` | POST | Parser un fichier d'historique |
| `/database/hands` | GET | Récupérer les mains (avec filtres) |
| `/database/dashboard-stats` | GET | Statistiques du dashboard |
| `/database/winrate-chart` | GET | Données graphique winrate |
| `/database/range-heatmap` | GET | Heatmap des ranges |
| `/database/players` | GET | Liste des joueurs |
| `/database/tournaments` | GET | Liste des tournois |
| `/database/delete-tournament` | DELETE | Supprimer un tournoi |
| `/equity/calculate` | POST | Calcul d'équité hero vs villain |
| `/analysis/leaks` | POST | Détection de leaks |
| `/analysis/range` | POST | Analyse de range par position |
| `/analysis/next-actions` | GET | Prochaines actions d'analyse |

## 🎰 Rooms Supportées

| Room | Format | Tournois |
|------|--------|----------|
| **Betclic** | Texte | Spin & Go, Spin & Rush |
| **PokerStars** | Texte | Spin & Go |

## 📊 Fonctionnalités

### Dashboard
- Statistiques globales (profit, mains jouées, winrate)
- Graphique d'évolution du profit vs EV
- Historique des sessions récentes

### Historique des Mains
- Liste des tournois avec filtrage
- Recherche et filtrage avancés des mains
- Détails complets de chaque main

### Replayer
- Replay visuel interactif des mains
- Timeline de la main
- Contrôles de lecture (play, pause, step)

### Analyse (Leak Detection)
- Analyse automatique des erreurs de jeu
- Classification par sévérité (critique, majeur, mineur)
- Suggestions de correction
- Dashboard d'analyse avec filtres

### Recherche de Range
- Heatmap interactive des ranges par position
- Comparaison avec les ranges GTO
- Outil de recherche de situations

### Settings
- Gestion multi-bases de données
- Import/Export de données
- Configuration de l'application
- Mise à jour de l'application

## 🛠️ Technologies

### Application Electron

- **Electron 28** - Framework desktop cross-platform
- **React 18** - Interface utilisateur
- **Vite** - Build tool ultra-rapide
- **TailwindCSS** - Styling utilitaire
- **Zustand** - Gestion d'état légère
- **Recharts / ECharts** - Graphiques React
- **i18next** - Internationalisation (EN, FR)

### Backend

- **.NET 8** - Backend C#
- **ASP.NET Core** - API REST performante
- **SQLite** - Base de données embarquée
- **Manjar** - Évaluation des mains de poker

### Website

- **Next.js 16** - Framework React full-stack
- **Tailwind CSS v4** - Styling
- **next-intl** - Internationalisation
- **Framer Motion** - Animations

## 📝 License

MIT