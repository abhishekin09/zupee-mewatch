const fs = require('fs');
const path = require('path');

console.log('🔍 Checking for snapshot analysis results...\n');

// Check if analysis results exist
const analysisFile = './leak-analysis.json';
if (fs.existsSync(analysisFile)) {
  console.log('📄 Found analysis results:');
  const results = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('❌ No analysis results found at', analysisFile);
}

// Check dashboard snapshots
const dashboardDir = './dashboard-snapshots';
if (fs.existsSync(dashboardDir)) {
  const files = fs.readdirSync(dashboardDir);
  console.log('\n📁 Dashboard snapshots:');
  files.forEach(file => {
    const stats = fs.statSync(path.join(dashboardDir, file));
    console.log(`  ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  });
} else {
  console.log('\n❌ No dashboard snapshots directory found');
}

// Check local snapshots
const snapshotsDir = './snapshots';
if (fs.existsSync(snapshotsDir)) {
  const files = fs.readdirSync(snapshotsDir);
  console.log('\n📁 Local snapshots:');
  files.forEach(file => {
    const stats = fs.statSync(path.join(snapshotsDir, file));
    console.log(`  ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  });
} else {
  console.log('\n❌ No local snapshots directory found');
}

console.log('\n🎯 To view results in dashboard:');
console.log('1. Open http://localhost:3000');
console.log('2. Click "Snapshot Analysis" tab');
console.log('3. Look for completed comparisons');

// Test dashboard connectivity
const WebSocket = require('ws');
console.log('\n🔌 Testing dashboard connection...');

const ws = new WebSocket('ws://localhost:4000/dashboard');
ws.on('open', () => {
  console.log('✅ Dashboard WebSocket connection successful');
  ws.close();
});

ws.on('error', (error) => {
  console.log('❌ Dashboard WebSocket connection failed:', error.message);
});
