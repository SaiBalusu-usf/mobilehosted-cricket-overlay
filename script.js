const BASE_API_URL = 'http://localhost:3000/api/live-score';
const POLL_INTERVAL = 5000;

// Default Application State
let currentConfig = {
    matchId: '5405',
    clubId: '157'
};

// --- Initialization ---
function init() {
    loadConfig();
    setupEventListeners();
    fetchScore(); // Initial fetch
    setInterval(fetchScore, POLL_INTERVAL); // Poll
}

function loadConfig() {
    const savedConfig = localStorage.getItem('cricOverlayConfig');
    if (savedConfig) {
        currentConfig = JSON.parse(savedConfig);
        console.log('Loaded config:', currentConfig);
    }
    document.getElementById('matchUrl').value = `https://cricclubs.com/TCL/viewScorecard.do?matchId=${currentConfig.matchId}&clubId=${currentConfig.clubId}`;
}

function setupEventListeners() {
    const updateBtn = document.getElementById('updateMatchBtn');
    updateBtn.addEventListener('click', handleUrlUpdate);
}

function handleUrlUpdate() {
    const urlInput = document.getElementById('matchUrl').value;
    const statusMsg = document.getElementById('settingsStatus');

    const matchIdMatch = urlInput.match(/matchId=(\d+)/);
    const clubIdMatch = urlInput.match(/clubId=(\d+)/);

    if (matchIdMatch && clubIdMatch) {
        currentConfig.matchId = matchIdMatch[1];
        currentConfig.clubId = clubIdMatch[1];

        localStorage.setItem('cricOverlayConfig', JSON.stringify(currentConfig));

        statusMsg.textContent = "Updated! Fetching new match...";
        statusMsg.style.color = "#2ecc71";

        fetchScore();
    } else {
        statusMsg.textContent = "Invalid URL. Need matchId and clubId.";
        statusMsg.style.color = "#e74c3c";
    }
}

let consecutiveErrors = 0;

async function fetchScore() {
    try {
        const url = `${BASE_API_URL}?matchId=${currentConfig.matchId}&clubId=${currentConfig.clubId}&league=${currentConfig.league || 'TCL'}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();

        // Success - Reset Error Count
        consecutiveErrors = 0;

        const statusMsg = document.getElementById('settingsStatus');
        if (statusMsg) {
            statusMsg.textContent = "Live (Stable)";
            statusMsg.style.color = "#2ecc71";
        }

        updateUI(data);
    } catch (error) {
        console.error('Fetch error:', error);
        consecutiveErrors++;

        const statusMsg = document.getElementById('settingsStatus');
        if (statusMsg) {
            if (consecutiveErrors < 3) {
                // Transient Error - Warning
                statusMsg.textContent = "Reconnecting...";
                statusMsg.style.color = "#f39c12"; // Orange
            } else {
                // Persistent Error - Danger
                statusMsg.textContent = "Connection Lost. Retrying...";
                statusMsg.style.color = "#e74c3c"; // Red
            }
        }
        // Do NOT clear the UI (updateUI is not called), so slightly old data persists.
    }
}

function updateUI(data) {
    if (!data) return;

    // --- Update Match Summary ---
    if (data.matchSummary.teams && data.matchSummary.teams.length >= 2) {
        const t1 = data.matchSummary.teams[0];
        const t2 = data.matchSummary.teams[1];

        const team1El = document.querySelector('#team1');
        const team2El = document.querySelector('#team2');

        team1El.querySelector('.team-name').textContent = t1.name;
        team1El.querySelector('.team-score').textContent = `${t1.score} (${t1.overs})`;

        team2El.querySelector('.team-name').textContent = t2.name;
        team2El.querySelector('.team-score').textContent = `${t2.score} (${t2.overs})`;
    } else if (data.matchSummary.teams && data.matchSummary.teams.length === 1) {
        const t1 = data.matchSummary.teams[0];
        document.querySelector('#team1 .team-name').textContent = t1.name;
        document.querySelector('#team1 .team-score').textContent = `${t1.score} (${t1.overs})`;

        document.querySelector('#team2 .team-name').textContent = "Waiting...";
        document.querySelector('#team2 .team-score').textContent = "";
    }

    // Status & Projected
    if (data.matchSummary.status) {
        document.querySelector('#matchStatus').textContent = data.matchSummary.status;
    }

    if (data.matchSummary.projected) {
        document.querySelector('#projectedScore').textContent = data.matchSummary.projected;
    } else {
        document.querySelector('#projectedScore').textContent = "";
    }

    // --- Update Batsmen ---
    const batsmenBody = document.querySelector('#batsmenTable tbody');
    batsmenBody.innerHTML = '';

    data.batsmen.forEach(batter => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="batsman-name">${batter.name}</td>
            <td class="highlight-stat">${batter.runs}</td>
            <td>${batter.balls}</td>
            <td>${batter.fours}</td>
            <td>${batter.sixes}</td>
            <td>${batter.sr}</td>
        `;
        batsmenBody.appendChild(tr);
    });

    // --- Update Bowlers ---
    const bowlerBody = document.querySelector('#bowlerTable tbody');
    bowlerBody.innerHTML = '';

    data.bowlers.forEach(bowler => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="bowler-name">${bowler.name}</td>
            <td>${bowler.overs}</td>
            <td>${bowler.maidens}</td>
            <td>${bowler.runs}</td>
            <td class="highlight-stat">${bowler.wickets}</td>
            <td>${bowler.econ}</td>
        `;
        bowlerBody.appendChild(tr);
    });

    // --- Update Recent Balls ---
    const ballsContainer = document.getElementById('recentBalls');
    ballsContainer.innerHTML = '';

    const balls = data.recentBalls.slice(0, 10).reverse();

    balls.forEach(ball => {
        const div = document.createElement('div');
        div.className = `ball ${ball.type}`;
        div.textContent = ball.runs;
        div.title = `Over ${ball.over}: ${ball.commentary}`;
        ballsContainer.appendChild(div);
    });
}

// Start app
init();
