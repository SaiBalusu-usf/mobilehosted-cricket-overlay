#!/bin/bash

echo " Starting Cricket Overlay Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please run: pkg install nodejs"
    exit 1
fi

# Install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Get Local IP (Works on Android/Termux)
echo "----------------------------------------"
echo "📱 Local IP Address:"
ifconfig | grep "inet " | grep -v "127.0.0.1" | awk '{print $2}'
echo "----------------------------------------"

# Start Server
echo "🚀 Server launching..."
node server.js
