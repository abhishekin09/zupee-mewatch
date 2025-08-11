#!/bin/bash
echo "🧪 Starting Test Service..."

if [ "$1" = "leak" ]; then
    echo "🕳️  Simulating memory leaks..."
    npm run test:leak
else
    echo "📊 Running normal operation..."
    npm test
fi
