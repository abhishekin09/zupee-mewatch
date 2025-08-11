const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Connect to dashboard
const ws = new WebSocket('ws://localhost:4000');

ws.on('open', () => {
  console.log('Connected to dashboard');
  
  // Register as capture agent
  ws.send(JSON.stringify({
    type: 'capture-agent-registration',
    serviceName: 'memwatch-demo',
    containerId: 'memwatch-demo',
    timestamp: Date.now()
  }));
  
  setTimeout(() => {
    // Send before snapshot
    sendSnapshot('before');
  }, 1000);
  
  setTimeout(() => {
    // Send after snapshot
    sendSnapshot('after');
  }, 2000);
  
  setTimeout(() => {
    // Trigger comparison
    ws.send(JSON.stringify({
      type: 'comparison-ready',
      serviceName: 'memwatch-demo',
      containerId: 'memwatch-demo',
      beforeSnapshotId: 'before_memwatch-demo_test',
      afterSnapshotId: 'after_memwatch-demo_test',
      timeframe: 3,
      timestamp: new Date().toISOString()
    }));
  }, 3000);
});

function sendSnapshot(phase) {
  const filename = phase === 'before' 
    ? 'before_memwatch-demo_2025-08-11T11-56-30-988Z.heapsnapshot'
    : 'after_memwatch-demo_2025-08-11T11-59-31-985Z.heapsnapshot';
  const filepath = path.join('./snapshots', filename);
  
  if (!fs.existsSync(filepath)) {
    console.error(`Snapshot not found: ${filepath}`);
    return;
  }
  
  const snapshotData = fs.readFileSync(filepath, 'utf8');
  const snapshotId = `${phase}_memwatch-demo_test`;
  
  // Send metadata
  ws.send(JSON.stringify({
    type: 'snapshot-metadata',
    snapshot: {
      id: snapshotId,
      serviceName: 'memwatch-demo',
      containerId: 'memwatch-demo',
      phase: phase,
      timestamp: new Date().toISOString(),
      size: snapshotData.length,
      filename: filename
    }
  }));
  
  // Send data in one chunk for testing
  ws.send(JSON.stringify({
    type: 'snapshot-chunk',
    snapshotId: snapshotId,
    chunkIndex: 0,
    totalChunks: 1,
    data: snapshotData
  }));
  
  // Send completion
  ws.send(JSON.stringify({
    type: 'snapshot-complete',
    snapshotId: snapshotId
  }));
  
  console.log(`Sent ${phase} snapshot`);
}

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Dashboard response:', message.type);
});

ws.on('close', () => {
  console.log('Connection closed');
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Close after 10 seconds
setTimeout(() => {
  ws.close();
}, 10000);
