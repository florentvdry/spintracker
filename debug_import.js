const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');

async function testImport() {
    try {
        const filePath = 'C:\\Users\\flore\\Desktop\\Tracker\\exemple-data\\Betclic\\21793509_ExportHH_2026-1-2.txt';
        console.log("Reading file...");
        const content = fs.readFileSync(filePath, 'utf8');

        console.log("0. Deleting all hands...");
        await fetch('http://127.0.0.1:5050/db/delete-all', { method: 'POST' });

        console.log("1. Parsing file...");
        const parseRes = await fetch('http://127.0.0.1:5050/parse/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const parseData = await parseRes.json();
        
        if (!parseData.success) {
            console.error("Parse failed:", parseData.error);
            return;
        }

        const hands = parseData.hands;
        console.log(`Parsed ${hands.length} hands.`);
        
        // Check keys of first hand
        if (hands.length > 0) {
            console.log("Keys of first hand:", Object.keys(hands[0]));
        }

        // Check a hand known to be showdown
        // Hand 21793509 is likely in there.
        // Let's filter for one where jmenfouu went to showdown
        const sdHand = hands.find(h => {
            const players = h.players || h.Players;
            return players && players.some(p => (p.name === 'jmenfouu' || p.Name === 'jmenfouu') && (p.wentToShowdown || p.WentToShowdown));
        });
        
        if (sdHand) {
            console.log("Found a showdown hand in parse result:", sdHand.id || sdHand.Id);
            const players = sdHand.players || sdHand.Players;
            const p = players.find(p => p.name === 'jmenfouu' || p.Name === 'jmenfouu');
            console.log("Player WentToShowdown:", p.wentToShowdown || p.WentToShowdown);
        } else {
            console.log("WARNING: No showdown hand found for jmenfouu in this file (Parse stage).");
        }

        console.log("2. Inserting hands...");
        const insertRes = await fetch('http://127.0.0.1:5050/db/insert-hands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hands })
        });
        const insertData = await insertRes.json();
        console.log("Insert result:", insertData);

        console.log("3. Fetching stats...");
        const statsRes = await fetch('http://127.0.0.1:5050/db/dashboard-stats?heroName=jmenfouu');
        const statsData = await statsRes.json();
        console.log("Stats:", statsData);

    } catch (e) {
        console.error("Error:", e);
    }
}

testImport();
