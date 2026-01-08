const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');

async function importFile(filePath) {
    console.log(`Processing ${path.basename(filePath)}...`);
    const content = fs.readFileSync(filePath, 'utf8');

    // 1. Parse
    const parseRes = await fetch('http://127.0.0.1:5050/parse/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });
    const parseData = await parseRes.json();
    
    if (!parseData.success) {
        console.error(`Parse failed for ${filePath}:`, parseData.error);
        return;
    }

    const hands = parseData.hands;
    console.log(`  Parsed ${hands.length} hands.`);

    // 2. Insert
    const insertRes = await fetch('http://127.0.0.1:5050/db/insert-hands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hands })
    });
    const insertData = await insertRes.json();
    console.log(`  Inserted: ${insertData.inserted}`);
}

async function importAll() {
    try {
        console.log("Deleting all hands...");
        const delRes = await fetch('http://127.0.0.1:5050/db/delete-all', { method: 'POST' });
        const delData = await delRes.json();
        console.log("Delete result:", delData);

        const dir = 'C:\\Users\\flore\\Desktop\\Tracker\\exemple-data\\Betclic';
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt') && !f.includes('excepted'));

        for (const file of files) {
            await importFile(path.join(dir, file));
        }
        console.log("All files imported.");

    } catch (e) {
        console.error("Error:", e);
    }
}

importAll();
