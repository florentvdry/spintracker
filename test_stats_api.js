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
    console.log(`✅ ${customStats.length} stats chargées depuis custom_stats_import.json\n`);
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
    console.log('🧪 Test de l\'évaluation des statistiques\n');
    console.log(`📊 Nombre de stats à tester: ${customStats.length}\n`);

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
        console.log('📤 Envoi de la requête à /stats/builder/evaluate-batch...');
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

        console.log('✅ Réponse reçue avec succès\n');
        console.log('📈 Résultats:\n');

        // Afficher les résultats pour chaque stat
        for (const stat of statsToTest) {
            const key = stat.Id || stat.Name;
            const statResult = result.data[key];
            
            if (!statResult) {
                console.log(`⚠️  ${stat.Name} (${key}): PAS DE RÉSULTAT`);
                continue;
            }

            const value = statResult.Opportunities > 0 
                ? (statResult.Successes / statResult.Opportunities * 100).toFixed(2)
                : '0.00';
            
            console.log(`📊 ${stat.Name}`);
            console.log(`   ID: ${key}`);
            console.log(`   Opportunités: ${statResult.Opportunities}`);
            console.log(`   Succès: ${statResult.Successes}`);
            console.log(`   Valeur: ${value}%`);
            console.log('');
        }

        // Test de toutes les stats
        console.log('\n🔄 Test de toutes les stats...\n');
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

        console.log(`✅ Toutes les ${customStats.length} stats ont été évaluées\n`);
        
        // Compter les stats avec des résultats
        let statsWithResults = 0;
        let statsWithZero = 0;
        
        for (const stat of customStats) {
            const key = stat.Id || stat.Name;
            const statResult = allStatsResult.data[key];
            
            if (statResult && statResult.Opportunities > 0) {
                statsWithResults++;
            } else {
                statsWithZero++;
            }
        }

        console.log(`📊 Stats avec résultats: ${statsWithResults}`);
        console.log(`📊 Stats à 0: ${statsWithZero}`);

        // Afficher quelques exemples de stats avec résultats
        console.log('\n📋 Exemples de stats avec résultats:\n');
        let examplesShown = 0;
        for (const stat of customStats) {
            if (examplesShown >= 5) break;
            
            const key = stat.Id || stat.Name;
            const statResult = allStatsResult.data[key];
            
            if (statResult && statResult.Opportunities > 0) {
                const value = (statResult.Successes / statResult.Opportunities * 100).toFixed(2);
                console.log(`  • ${stat.Name}: ${value}% (${statResult.Successes}/${statResult.Opportunities})`);
                examplesShown++;
            }
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
            console.log('✅ Serveur accessible\n');
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
