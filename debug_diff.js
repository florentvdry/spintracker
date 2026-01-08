const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkChartDiscrepancy() {
    try {
        console.log("1. Fetching Players...");
        const playersRes = await fetch('http://127.0.0.1:5050/db/players?limit=5', { method: 'GET' });
        const playersData = await playersRes.json();
        const mainHero = playersData.data[0];
        console.log(`Hero: ${mainHero.name}`);

        console.log("\n2. Fetching Legacy Chart Data...");
        const legacyRes = await fetch('http://127.0.0.1:5050/db/winrate-chart', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ heroName: null }) 
        });
        const legacyData = await legacyRes.json();
        const legacyFinal = legacyData.data[legacyData.data.length - 1];
        console.log("Legacy Final Point:", legacyFinal);

        console.log(`\n3. Fetching New Chart Data for ${mainHero.name}...`);
        const newRes = await fetch('http://127.0.0.1:5050/db/winrate-chart', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ heroName: mainHero.name }) 
        });
        const newData = await newRes.json();
        const newFinal = newData.data[newData.data.length - 1];
        console.log("New Final Point:", newFinal);

        console.log("\n--- Comparison ---");
        console.log(`Profit: ${legacyFinal.profit} vs ${newFinal.profit}`);
        console.log(`Showdown: ${legacyFinal.chips_won_showdown} vs ${newFinal.chips_won_showdown}`);
        console.log(`No Showdown: ${legacyFinal.chips_won_no_showdown} vs ${newFinal.chips_won_no_showdown}`);

    } catch (e) {
        console.error("Error:", e);
    }
}

checkChartDiscrepancy();
