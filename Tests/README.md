# Tests

Tests pour le backend Python FastAPI.

## Installation

```bash
cd Tests
pip install -r requirements.txt
```

## Lancer les tests

```bash
pytest
```

## Structure des tests

- `test_health.py` - Tests pour l'endpoint `/health`
- `test_parser.py` - Tests pour les endpoints `/parser/*`
- `test_database.py` - Tests pour les endpoints `/database/*`
- `test_tournaments.py` - Tests pour les endpoints `/tournaments/*`
- `test_players.py` - Tests pour les endpoints `/players/*`
- `test_stats.py` - Tests pour les endpoints `/stats/*`
- `test_equity.py` - Tests pour les endpoints `/equity/*`
- `test_analysis.py` - Tests pour les endpoints `/analysis/*`
- `test_expected_results.py` - Tests qui vérifient les résultats attendus avec les données d'exemple

## Données d'exemple

Les données d'exemple sont dans `publish/exemple-data/Betclic/`.
Les résultats attendus sont dans `excepted_result.txt`.
