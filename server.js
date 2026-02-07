const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.static(__dirname)); // Serve static files (index.html, style.css, etc.)

// Default match ID from user request
const DEFAULT_MATCH_ID = '5405';
const DEFAULT_CLUB_ID = '157';
const DEFAULT_LEAGUE = 'TCL';

// Construct URL dynamically based on league
const getScorecardUrl = (league, matchId, clubId) => `https://cricclubs.com/${league}/viewScorecard.do?matchId=${matchId}&clubId=${clubId}`;

app.get('/api/live-score', (req, res) => {
    const matchId = req.query.matchId || DEFAULT_MATCH_ID;
    const clubId = req.query.clubId || DEFAULT_CLUB_ID;
    // Extract league from query or default
    const league = req.query.league || DEFAULT_LEAGUE;

    const url = getScorecardUrl(league, matchId, clubId);

    console.log(`Fetching data from: ${url}`);

    // CORS Bypass: Use 'curl' on Linux/Mac/Android (Termux) and 'curl.exe' on Windows
    const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';

    // Robust Desktop Headers to bypass restrictions
    const headers = [
        '-H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"',
        '-H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"',
        '-H "Accept-Language: en-US,en;q=0.9"',
        '-H "Cache-Control: max-age=0"',
        '-H "Sec-Ch-Ua: \\"Not A(Brand\\";v=\\"99\\", \\"Google Chrome\\";v=\\"121\\", \\"Chromium\\";v=\\"121\\""',
        '-H "Sec-Ch-Ua-Mobile: ?0"',
        '-H "Sec-Ch-Ua-Platform: \\"Windows\\""',
        '-H "Sec-Fetch-Dest: document"',
        '-H "Sec-Fetch-Mode: navigate"',
        '-H "Sec-Fetch-Site: none"',
        '-H "Sec-Fetch-User: ?1"',
        '-H "Upgrade-Insecure-Requests: 1"',
        // Referer helps
        `-H "Referer: https://cricclubs.com/${league}"`
    ].join(' ');

    const curlCommand = `${curlCmd} -L --max-time 15 --retry 3 ${headers} "${url}"`;

    exec(curlCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            console.error(`stderr: ${stderr}`);
            return res.status(500).json({ error: 'Failed to fetch data via curl', details: stderr });
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
            // Desktop: div.bbb-row > div.col2
            // Mobile: ul.bbb-row > li.col2
            $('.bbb-row').each((i, el) => {
                if (i < 12) {
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
                    if (runText.includes('W')) type = 'wicket';
                    else if (runText.includes('4')) type = 'four';
                    else if (runText.includes('6')) type = 'six';
                    else if (runText === '0') type = 'dot';

                    if (runText) { // Ensure we found something
                        data.recentBalls.push({ over: overNum, runs: runText, commentary: commText, type });
                    }
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
