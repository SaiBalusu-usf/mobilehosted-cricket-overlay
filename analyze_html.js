const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('match_953.html', 'utf8');
const $ = cheerio.load(html);

console.log('--- Active Tabs ---');
$('.nav-tabs .active, .tab-pane.active').each((i, el) => {
    console.log(`[${i}] Tag: ${el.tagName}, Class: ${$(el).attr('class')}, ID: ${$(el).attr('id')}, Text: ${$(el).text().trim().substring(0, 50)}...`);
});

console.log('\n--- Inning Containers ---');
// Look for divs that contain many balls
$('div').each((i, div) => {
    const balls = $(div).find('[id^="ballid_"]');
    if (balls.length > 5) {
        // Only show top-level containers, distinct IDs
        const id = $(div).attr('id');
        const classAttr = $(div).attr('class');
        if (id || classAttr) {
            console.log(`Div ID: ${id}, Class: ${classAttr}, Balls Count: ${balls.length}`);
        }
    }
});

console.log('\n--- Balls Order ---');
let count = 0;
$('[id^="ballid_"]').each((i, el) => {
    if (count < 5 || count > $('[id^="ballid_"]').length - 5) {
        console.log(`[${i}] ID: ${$(el).attr('id')}, Parent Class: ${$(el).parent().attr('class')}, Parent ID: ${$(el).parent().attr('id')}`);
    }
    count++;
});
console.log(`Total Balls Found: ${count}`);
