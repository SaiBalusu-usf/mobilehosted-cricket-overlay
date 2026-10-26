const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');

const app = express();
app.use(cors());
// Only browser assets are public; never expose source, captures, or lockfiles.
for (const [route, file] of [['/', 'index.html'], ['/index.html', 'index.html'], ['/script.js', 'script.js'], ['/style.css', 'style.css']]) {
    app.get(route, (_req, res) => res.sendFile(path.join(__dirname, file)));
}

app.get('/api/live-score', (req, res) => {
    const matchId = req.query.matchId ?? '5405';
    const clubId = req.query.clubId ?? '157';
    const league = req.query.league ?? 'TCL';
    if (typeof matchId !== 'string' || !/^[1-9][0-9]{0,11}$/.test(matchId) ||
        typeof clubId !== 'string' || !/^[1-9][0-9]{0,11}$/.test(clubId) ||
        typeof league !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(league)) {
        return res.status(400).json({ error: 'Invalid league, matchId, or clubId' });
    }

    const url = new URL('https://cricclubs.com/' + league + '/viewScorecard.do');
    url.searchParams.set('matchId', matchId);
    url.searchParams.set('clubId', clubId);
    const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    // No shell and no redirects: user input cannot become a command or a new host.
    const args = ['--fail', '--silent', '--show-error', '--proto', '=https',
        '--max-time', '15', '--max-filesize', '10485760',
        '-H', 'User-Agent: Mozilla/5.0', '-H', 'Accept: text/html',
        '-H', 'Accept-Language: en-US,en;q=0.9', '--url', url.href];
    execFile(curlCmd, args, { maxBuffer: 10 * 1024 * 1024, timeout: 20000, windowsHide: true }, (error, stdout) => {
        if (error) {
            console.error('Scorecard request failed');
            return res.status(502).json({ error: 'Failed to fetch scorecard' });
        }

        try {
            const html = stdout;
            const $ = cheerio.load(html);

            const data = {
                matchSummary: {
                    league: league // Return the league name
                },
                batsmen: [],
                bowlers: [],
                recentBalls: []
            };

            // --- Attempt to Scrape League Logo ---
            // Often in the navbar or a specific league logo class
            let logoUrl = "";
            // Try common selectors
            const logoImg = $('.navbar-brand img').attr('src') || $('.league-logo img').attr('src');
            if (logoImg) {
                // Handle relative URLs
                if (logoImg.startsWith('http')) {
                    logoUrl = logoImg;
                } else {
                    logoUrl = `https://cricclubs.com${logoImg.startsWith('/') ? '' : '/'}${logoImg}`;
                }
            }
            data.matchSummary.leagueLogo = logoUrl;

            // --- Extract Match Summary & Status & Projected Score ---
            const title = $('title').text().trim();
            data.matchSummary.title = title;

            const teams = [];
            $('.match-summary ul li').each((i, el) => {
                const teamName = $(el).find('.teamName').text().trim();
                const score = $(el).find('span').not('.teamName').first().text().trim();
                const overs = $(el).find('p').text().trim();

                if (teamName) {
                    // Clean up extra whitespace (mobile view often has huge gaps)
                    const cleanName = teamName.replace(/\s+/g, ' ').trim();
                    teams.push({ name: cleanName, score, overs });
                }
            });
            data.matchSummary.teams = teams;

            const status = $('.list-live').text().trim() || $('.sc-res').text().trim();
            data.matchSummary.status = status;

            const projectedScore = $('.score-top h3').text().trim();
            if (projectedScore) {
                data.matchSummary.projected = projectedScore;
            }

            // --- Extract Stats (Batsmen & Bowlers) ---
            $('.about-table table, table').each((i, table) => {
                const headers = $(table).find('th').map((j, th) => $(th).text().trim()).get();

                if (headers.some(h => h.includes('Batter') || h.includes('Batsman'))) {
                    $(table).find('tbody tr').each((j, tr) => {
                        const cols = $(tr).find('td, th');
                        if (cols.length >= 6) {
                            const name = $(cols[0]).text().trim();
                            const runs = $(cols[1]).text().trim();
                            const balls = $(cols[2]).text().trim();
                            const fours = $(cols[3]).text().trim();
                            const sixes = $(cols[4]).text().trim();
                            const sr = $(cols[5]).text().trim();

                            if (name && runs !== "" && !name.includes("Extras") && !name.includes("Total")) {
                                data.batsmen.push({ name, runs, balls, fours, sixes, sr });
                            }
                        }
                    });
                }

                if (headers.some(h => h.includes('Bowler'))) {
                    $(table).find('tbody tr').each((j, tr) => {
                        const cols = $(tr).find('td, th');
                        if (cols.length >= 6) {
                            const name = $(cols[0]).text().trim();
                            const overs = $(cols[1]).text().trim();
                            const maidens = $(cols[2]).text().trim();
                            const runs = $(cols[3]).text().trim();
                            const wickets = $(cols[4]).text().trim();
                            const econ = $(cols[5]).text().trim();

                            if (name && overs !== "") {
                                data.bowlers.push({ name, overs, maidens, runs, wickets, econ });
                            }
                        }
                    });
                }
            });

            // --- Extract Recent Balls ---
            // --- Extract Recent Balls ---
            // Desktop: div.bbb-row > div.col2
            // Mobile: ul.bbb-row > li.col2
            // Robust Selector: Use [id^='ballid_'] to filter out summaries/ads
            // FIX: Target only the ACTIVE tab (Current Innings)
            let ballElements = $('.tab-pane.active').find('[id^="ballid_"]');
            if (ballElements.length === 0) {
                // Fallback if no active tab found (e.g. mobile view might differ)
                ballElements = $('[id^="ballid_"]');
            }

            ballElements.each((i, el) => {
                // Stop if we have 12 balls already
                if (data.recentBalls.length >= 12) return false;

                // Validate this is a ball row (must have .col2 for runs)
                const col2 = $(el).find('.col2');
                if (col2.length === 0) return; // Skip this row

                // Filter out hidden rows (like Bowler changes or Start of Over)
                if (col2.hasClass('d-none') || col2.hasClass('hidden') || $(el).hasClass('d-none')) return;
                if ($(el).find('li.col2').hasClass('d-none')) return;

                // Try desktop selector first, then mobile
                let runSpan = $(el).find('.col2 span').first();
                // Mobile structure: li.col2 > span.runs
                if (runSpan.length === 0) {
                    runSpan = $(el).find('li.col2 span').first();
                }

                let runText = runSpan.text().trim();

                let overNum = $(el).find('.ov').text().trim();
                let commText = $(el).find('.col3').text().trim(); // Desktop .col3 is div, Mobile .col3 is li
                if (!commText) {
                    commText = $(el).find('li.col3').text().trim();
                }

                if (runText === '' || runSpan.find('.fa-dot-circle-o').length > 0 || runSpan.hasClass('zero')) {
                    runText = '0';
                }

                let type = 'normal';
                // Check for Extras first
                if (runText.toLowerCase().includes('wd')) {
                    type = 'wide';
                    // User requested "wd" specifically, ensure lowercase
                    runText = runText.toLowerCase();
                }
                else if (runText.toLowerCase().includes('nb')) type = 'no-ball'; // Potential future support
                else if (runText.includes('W')) type = 'wicket'; // Strict uppercase W for wicket
                else if (runText.includes('4')) type = 'four';
                else if (runText.includes('6')) type = 'six';
                else if (runText === '0') type = 'dot';

                if (runText) { // Ensure we found something
                    data.recentBalls.push({ over: overNum, runs: runText, commentary: commText, type });
                }
            });

            console.log(`Parsed: ${data.matchSummary.teams.length > 0 ? 'Teams OK' : 'No Teams'} | Batsmen: ${data.batsmen.length} | Bowlers: ${data.bowlers.length} | Balls: ${data.recentBalls.length}`);

            res.json(data);
        } catch (parseError) {
            console.error('Parse error:', parseError);
            res.status(500).json({ error: 'Failed to parse data' });
        }
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Live Data Endpoint: http://localhost:${PORT}/api/live-score`);
});
