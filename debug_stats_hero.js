const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkStats() {
    const hero = "jmenfouu";
    try {
        console.log(`Checking stats for ${hero}...`);

        // 1. Get Dashboard Stats
        const dashRes = await fetch(`http://127.0.0.1:5050/db/dashboard-stats?heroName=${encodeURIComponent(hero)}`);
        const dash = await dashRes.json();
        console.log("\n--- Dashboard Stats ---");
        console.log(dash.data);

        // 2. Get Chart Data (Detailed breakdown)
        const chartRes = await fetch('http://127.0.0.1:5050/db/winrate-chart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ heroName: hero })
        });
        const chart = await chartRes.json();
        const data = chart.data || [];
        
        if (data.length > 0) {
            const final = data[data.length - 1];
            console.log("\n--- Chart Final Cumulative ---");
            console.log("Total Profit:", final.profit);
            console.log("Showdown Profit:", final.chips_won_showdown);
            console.log("No Showdown Profit:", final.chips_won_no_showdown);
            console.log("Net Expected (EV):", final.cumulative);
            
            console.log("\n--- Consistency Check ---");
            const sum = final.chips_won_showdown + final.chips_won_no_showdown;
            console.log(`SD + Non-SD = ${sum.toFixed(2)}`);
            console.log(`Total Profit = ${final.profit.toFixed(2)}`);
            console.log(`Diff = ${(final.profit - sum).toFixed(2)}`);
        } else {
            console.log("No chart data found.");
        }

        // 3. Inspect a few individual hands to see if parsing is correct
        console.log("\n--- Sample Hands Inspection ---");
        const handsRes = await fetch('http://127.0.0.1:5050/db/hands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ heroName: hero, limit: 10 })
        });
        const handsData = await handsRes.json();
        const hands = handsData.data.hands || [];

        hands.forEach(h => {
            console.log(`\nHand ID: ${h.hand_id || h.id}`);
            console.log(`Net Profit: ${h.hero_profit}`);
            console.log(`Went to SD: ${h.went_to_showdown}`);
            console.log(`EV: ${h.ev_chips}`);
        });

    } catch (e) {
        console.error("Error:", e);
    }
}

checkStats();
