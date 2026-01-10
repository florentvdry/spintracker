/**
 * Test API pour vérifier que chaque statistique fonctionne correctement
 * Usage: node test_stats_api.js
 * 
 * Note: Nécessite Node.js 18+ pour fetch natif, ou installez node-fetch
 */

const API_BASE = 'http://localhost:5050';

// Charger les stats depuis custom_stats_import.json
const fs = require('fs');
const path = require('path');

let customStats = [];
try {
    const statsPath = path.join(__dirname, 'custom_stats_import.json');
    customStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
} catch (error) {
    console.error('❌ Erreur lors du chargement de custom_stats_import.json:', error.message);
    process.exit(1);
}

// Test avec des filtres basiques
const testFilters = {
    HeroName: '', // Laissez vide pour tester avec tous les joueurs, ou mettez un nom spécifique
    Situation: '',
    Action: '',
    PlayerCount: null,
    MinStackBB: null,
    MaxStackBB: null,
    Positions: [],
    DateFrom: '',
    DateTo: ''
};

async function testStatsEvaluation() {
    // Prendre seulement les 5 premières stats pour le test initial
    const statsToTest = customStats.slice(0, 5);
    
    const payload = {
        stats: statsToTest.map(stat => ({
            id: stat.Id,
            name: stat.Name,
            denominator: stat.Definition.denominator,
            numerator: stat.Definition.numerator
        })),
        filters: testFilters
    };

    try {
        const response = await fetch(`${API_BASE}/stats/builder/evaluate-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erreur HTTP:', response.status, response.statusText);
            console.error('Réponse:', errorText);
            return;
        }

        const result = await response.json();
        
        if (!result.success) {
            console.error('❌ L\'API a retourné success=false');
            console.error('Erreur:', result.error || result);
            return;
        }

        // Test de toutes les stats
        const allStatsPayload = {
            stats: customStats.map(stat => ({
                id: stat.Id,
                name: stat.Name,
                denominator: stat.Definition.denominator,
                numerator: stat.Definition.numerator
            })),
            filters: testFilters
        };

        const allStatsResponse = await fetch(`${API_BASE}/stats/builder/evaluate-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allStatsPayload)
        });

        if (!allStatsResponse.ok) {
            console.error('❌ Erreur lors du test de toutes les stats');
            return;
        }

        const allStatsResult = await allStatsResponse.json();
        
        if (!allStatsResult.success) {
            console.error('❌ Erreur lors du test de toutes les stats');
            return;
        }

    } catch (error) {
        console.error('❌ Erreur lors du test:', error.message);
        console.error(error.stack);
    }
}

// Vérifier que le serveur est accessible
async function checkServer() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        if (response.ok) {
            return true;
        }
    } catch (error) {
        console.error('❌ Impossible de se connecter au serveur');
        console.error('Assurez-vous que le backend est démarré sur http://localhost:5050');
        return false;
    }
}

// Exécuter les tests
(async () => {
    const serverOk = await checkServer();
    if (serverOk) {
        await testStatsEvaluation();
    }
})();
