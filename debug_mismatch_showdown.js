const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\flore\\Desktop\\Tracker\\exemple-data\\Betclic';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));

const targetHandId = '01KDZZZY2WYWA83GK1QF6VH1B6';

for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.includes(targetHandId)) {
        console.log(`Found in ${file}`);
        const hands = content.split('------------'); 
        const hand = hands.find(h => h.includes(targetHandId));
        console.log(hand);
        break;
    }
}
