const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkAnalytics() {
    try {
        // We can't query the table directly via API easily, but we can infer from a hand details fetch
        // Fetch a hand that we know went to showdown (from previous debug output)
        // Hand ID: 01KE0SWZ3MWW23307PVSF796TN (Net Profit: -508, Went to SD: true)
        
        const handId = "01KE0SWZ3MWW23307PVSF796TN";
        console.log(`Checking details for hand ${handId}...`);

        const res = await fetch(`http://127.0.0.1:5050/db/hand/${handId}`);
        const data = await res.json();
        
        if (data.success) {
            console.log("\n--- Hand Details ---");
            console.log("Hero Profit:", data.data.hero_profit);
            console.log("EV Chips:", data.data.ev_chips);
            console.log("Net Won Adjusted:", data.data.net_won_adjusted); // This is usually what we graph
            console.log("Equity Preflop:", data.data.equity_preflop);
            
            if (data.data.ev_chips === null && data.data.hero_profit !== 0) {
                console.log("EV is NULL. This confirms why the chart shows EV = Profit (fallback).");
            }
        } else {
            console.log("Hand not found or error:", data.error);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

checkAnalytics();
