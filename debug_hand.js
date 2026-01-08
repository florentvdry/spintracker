const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\flore\\Desktop\\Tracker\\exemple-data\\Betclic';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));

for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.includes('01KE0NSQZ45HD84BD9VFZPH4WP')) {
        console.log(`Found in ${file}`);
        // Extract the hand
        const hands = content.split(/\n\n/); // Rough split
        const hand = hands.find(h => h.includes('01KE0NSQZ45HD84BD9VFZPH4WP'));
        console.log(hand);
        break;
    }
}
