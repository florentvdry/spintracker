# SpinTracker Backend

ASP.NET Core (.NET 8) API powering [SpinTracker](../README.md): hand history parsing and import, SQLite storage, statistics, equity calculation and leak analysis.

## Layout

| Folder | Role |
|---|---|
| `Controllers/` | HTTP endpoints only, no business logic |
| `Services/` | Application logic |
| `Engines/` | Pure analytical computations (stats, equity, EV, leaks) |
| `Parsers/` | One hand history parser per poker room (Winamax, Betclic, Unibet) |
| `Data/Repositories/` | Data access |
| `Migrations/` | FluentMigrator schema migrations |
| `Extensions/`, `Configuration/` | DI, HTTP pipeline, runtime paths |
| `Models/`, `Interfaces/` | DTOs, entities, contracts |
| `Tests/` | xUnit tests, based on anonymized samples in `exemple-data/` |

See [AGENTS.md](../AGENTS.md) for the layering rules and conventions.

## Requirements

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

## Run

```bash
dotnet run          # default port 5050
dotnet run 5050     # explicit port
dotnet watch run -- 5050
```

## Test

```bash
dotnet test Tests/SpinTrackerBackend.Tests.csproj
```

Every parser fix must ship with a test using an **anonymized** sample from `exemple-data/`.

## API

The API listens on `localhost` and is consumed by the Electron/Vue frontend. Main endpoints:

- `GET /health` — health check
- `POST /parse/file`, `POST /parse/detect` — parse a hand history file / detect its room format
- `POST /db/insert-hands` — import parsed hands
- `GET|POST /db/hands`, `GET /db/hand/{id}` — hands
- `GET /db/dashboard-stats` — dashboard statistics
- `GET|POST /db/session-history`, `/db/winrate-chart`, `/db/range-heatmap`, `/db/players` — sessions, charts, ranges, players
- `POST /equity` — equity calculation (preflop lookup table + Monte Carlo)
- `POST /db/delete-all` — wipe local data

See `Controllers/` for the complete and authoritative list.
