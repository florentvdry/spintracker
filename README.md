# SpinTracker

Tracker Spin & Go avec backend C# (.NET 8), frontend Vue (Vite), et packaging Electron pour la version desktop.

## Architecture

- `backend/`: API C# ASP.NET Core + parsing/import + statistiques + migrations SQLite
- `frontend-vue/`: frontend Vue 3 + Vite
- `main.js`: process principal Electron (prod desktop)

## Backend (refacto)

Organisation backend clarifiée:

- `Controllers/`: endpoints HTTP
- `Data/Repositories/`: accès données
- `Services/`: logique applicative
- `Engines/`: calculs analytiques
- `Extensions/`: configuration DI + pipeline HTTP
- `Configuration/`: résolution des chemins/config runtime
- `Migrations/`: migrations FluentMigrator

## Développement

### Mode dev desktop (recommandé)

```bash
npm run dev:electron
```

Cela lance:

1. `vite` sur `http://localhost:3000`
2. Electron en mode dev
3. backend C# lancé par Electron (port `5050`)

### Mode dev web (backend + frontend séparés)

```bash
npm run dev
```

Note: le frontend restauré utilise l'IPC Electron pour plusieurs actions. En mode navigateur pur, certaines fonctionnalités peuvent ne pas fonctionner.

## Production desktop

```bash
npm run build
```

## Scripts utiles

- `npm run react:dev`: frontend seul
- `npm run backend:dev`: backend seul avec hot reload
- `npm run react:build`: build frontend
- `npm run backend:build`: publish backend

## Notes importantes

- Le mode le plus fiable pour tester toute l'app est `npm run dev:electron`.
- Le mode web (`npm run dev`) sert surtout au développement UI/itérations rapides.

## Stack

- Electron 28
- Vue 3 + Vite
- TailwindCSS
- ASP.NET Core .NET 8
- SQLite + FluentMigrator

## Licence

MIT
