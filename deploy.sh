#!/bin/bash
set -e

cd /home/appuser/projects/dodi

echo "📥 מושך שינויים מ-GitHub..."
git pull origin main

echo "📦 מתקין dependencies..."
npm install --production=false

echo "🔨 מבנה..."
npm run build

echo "🔄 מפעיל מחדש..."
pm2 restart dodi

echo "✅ הושלם בהצלחה"
