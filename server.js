const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
app.use(cors());

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

    const curlCommand = `curl.exe -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" "${url}"`;

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
                    teams.push({ name: teamName, score, overs });
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
            $('.bbb-row').each((i, el) => {
                if (i < 12) {
                    const runSpan = $(el).find('.col2 span').first();
                    let runText = runSpan.text().trim();
                    const overNum = $(el).find('.ov').text().trim();
                    const commText = $(el).find('.col3').text().trim();

                    if (runText === '' || runSpan.find('.fa-dot-circle-o').length > 0 || runSpan.hasClass('zero')) {
                        runText = '0';
                    }

                    let type = 'normal';
                    if (runText.includes('W')) type = 'wicket';
                    else if (runText.includes('4')) type = 'four';
                    else if (runText.includes('6')) type = 'six';
                    else if (runText === '0') type = 'dot';

                    data.recentBalls.push({ over: overNum, runs: runText, commentary: commText, type });
                }
            });

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
