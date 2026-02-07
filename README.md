# Mobile Cricket Overlay

A lightweight, robust, and mobile-optimized cricket overlay for live streaming (OBS, Prism Live Studio, etc.).

## 🚀 Features

*   **Live Score Updates**: Fetches real-time data from CricClubs match scorecards.
*   **Active Innings Auto-Detection**: Smart logic ensures "Last 12 Balls" always show the *current* live innings, even during the 2nd innings.
*   **Mobile Optimized**: Designed to run efficiently on Android devices via Termux, with battery-saving tips included.
*   **Resilient Connectivity**:
    *   **Auto-Reconnect**: Automatically retries on network failure without crashing.
    *   **Stale Data Persistence**: Keeps the last known score visible if the connection drops, rather than showing a blank screen.
    *   **Visual Health Indicator**: Shows connection status (Green = Live, Orange = Reconnecting, Red = Lost).
*   **Dynamic League Support**: Automatically displays League Name and Logo based on the match URL.
*   **Rich Stats**:
    *   **Batsmen**: Runs, Balls, 4s, 6s, Strike Rate.
    *   **Bowlers**: Overs, Maidens, Runs, Wickers, Economy.
    *   **Recent Balls**: Last 12 balls ticker with color-coded events (Wicket = Red/Pulse, Wide = Orange, Boundary = Blue/Purple).

## 🛠️ Installation

### Prerequisites
*   **Node.js**: Required to run the backend server.
*   **Git**: To download and update the code.

### Setup on PC (Windows/Mac/Linux)
1.  Clone the repository:
    ```bash
    git clone https://github.com/SaiBalusu-usf/mobilehosted-cricket-overlay.git
    cd mobilehosted-cricket-overlay
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the server:
    ```bash
    node server.js
    ```
4.  Open `http://localhost:3000` in your browser or add it as a Browser Source in OBS.

### Setup on Android (Termux)
See [Mobile Streaming Guide](mobile_streaming_guide.md) for detailed instructions.
Quick start:
```bash
pkg update && pkg upgrade
pkg install nodejs git
git clone https://github.com/SaiBalusu-usf/mobilehosted-cricket-overlay.git
cd mobilehosted-cricket-overlay
npm install
./start.sh
```

## ⚙️ Configuration

### Updating the Match
1.  Open the overlay in your browser (`http://localhost:3000` or your phone's IP).
2.  Click the **⚙️ Settings** icon in the top-left corner.
3.  Paste the full **CricClubs Match URL** (e.g., `https://cricclubs.com/TCL/viewScorecard.do?matchId=...&clubId=...`).
4.  Click **Update Match**. The overlay will reload with the new match data.

### Customizing Styles
*   Edit `style.css` to change colors, fonts, or layout.
*   The overlay is responsive but optimized for landscape 16:9 streaming.

## 🐛 Troubleshooting

### "Waiting for Data..."
*   **Cause**: The server hasn't fetched data yet or the match ID is invalid.
*   **Fix**: Check the server console (`node server.js` output). Ensure the URL is correct and the match is live or has data.

### "Reconnecting..." / Orange Status
*   **Cause**: Temporary network glitch or server slowdown.
*   **Fix**: Do nothing. The system will auto-retry.

### "Connection Lost" / Red Status
*   **Cause**: Server stopped or internet is down.
*   **Fix**: Restart the server (`./start.sh` or `node server.js`) and check your internet connection.

### Incorrect Recent Balls (e.g. showing 1st Innings)
*   **Fix**: This is handled automatically now! The server looks for the "Active Tab" on the scorecard to ensure it only scrapes the live innings.

### Data Not Updating
*   **Cause**: Cloudflare might be blocking requests.
*   **Fix**: The server uses special headers to mimic a real browser. If it insists on blocking, try restarting the server or using a different network (toggle Flight Mode).

## 📂 Project Structure
*   `server.js`: Node.js backend. Handles scraping (cheerio), parsing, and hosting the API.
*   `script.js`: Frontend logic. Fetches data from API, updates DOM, handles errors.
*   `index.html`: Main overlay layout.
*   `style.css`: Styling and animations.
*   `start.sh`: Helper script for Termux (prevents sleep, keeps server alive).

## 📄 License
ISC
