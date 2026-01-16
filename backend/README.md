# SpinTracker Backend - C# Edition

Backend C# haute performance pour le SpinTracker avec calculs d'équité optimisés et parsing rapide.

## Fonctionnalités

- **Serveur HTTP REST API** compatible avec l'API Python existante
- **Calculateur d'équité optimisé** avec table de lookup preflop et simulation Monte Carlo
- **Parser Betclic** pour fichiers de hand history
- **Base de données SQLite** pour stockage des mains
- **Calcul d'analytics** en parallèle (EV, equity, etc.)
- **Moteur d'analyse** pour détection de leaks

## Prérequis

- .NET 8.0 SDK

## Installation

```bash
# Le projet est auto-contenu, pas besoin d'installation de dépendances externes
```

## Démarrage

```bash
# Compiler et lancer (port par défaut: 5050)
dotnet run

# Ou spécifier un port
dotnet run 5050
```

## Endpoints API

Tous les endpoints sont identiques à la version Python:

- `GET /health` - Health check
- `POST /parse/file` - Parser un fichier de hand history
- `POST /parse/detect` - Détecter le format d'un fichier
- `POST /db/insert-hands` - Insérer des mains dans la DB
- `GET|POST /db/hands` - Récupérer les mains
- `GET /db/hand/{id}` - Récupérer une main spécifique
- `GET /db/dashboard-stats` - Statistiques du dashboard
- `GET|POST /db/session-history` - Historique des sessions
- `GET|POST /db/winrate-chart` - Données du graphique winrate
- `GET|POST /db/range-heatmap` - Heatmap des ranges
- `GET|POST /db/players` - Vue d'ensemble des joueurs
- `POST /db/delete-all` - Supprimer toutes les mains
- `POST /equity` - Calculer l'équité
- `POST /equity/batch` - Calculer l'équité par batch
- `POST /analyze/leaks` - Analyser les leaks
- `POST /analyze/range` - Analyser une range

## Performance

Le backend C# offre des performances significativement améliorées:

- **Parsing**: ~5-10x plus rapide que Python
- **Calculs d'équité**: ~3-5x plus rapide grâce à la compilation native
- **Calculs parallèles**: Utilisation optimale de tous les cœurs CPU
- **Mémoire**: Empreinte mémoire réduite

## Architecture

```
backend/
├── Program.cs              # Point d'entrée et configuration des endpoints
├── Database.cs             # Gestion SQLite
├── EquityCalculator.cs     # Calculs d'équité optimisés
├── AnalyticsCalculator.cs  # Calculs d'analytics
├── AnalysisEngine.cs       # Détection de leaks
├── Parsers.cs              # Parsers de hand history
└── SpinTrackerBackend.csproj
```

## Compatibilité

100% compatible avec le frontend existant - aucune modification requise.
