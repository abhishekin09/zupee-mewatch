const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 4000;

// In-memory storage for snapshots and comparisons
const snapshots = new Map();
const comparisons = new Map();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Upload snapshot
app.post('/api/snapshots/upload', (req, res) => {
  try {
    const { serviceName, containerId, phase, snapshotData, filename } = req.body;
    
    if (!serviceName || !containerId || !phase || !snapshotData) {
      return res.status(400).json({ 
        error: 'Missing required fields: serviceName, containerId, phase, snapshotData' 
      });
    }

    const snapshotId = `${phase}_${serviceName}_${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    // Store snapshot in memory
    snapshots.set(snapshotId, {
      id: snapshotId,
      serviceName,
      containerId,
      phase,
      timestamp,
      size: snapshotData.length,
      filename: filename || `${snapshotId}.heapsnapshot`,
      data: snapshotData
    });

    // Save to file
    const snapshotsDir = './dashboard-snapshots';
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }
    
    const filepath = path.join(snapshotsDir, filename || `${snapshotId}.heapsnapshot`);
    fs.writeFileSync(filepath, snapshotData);
    
    console.log(`📸 Snapshot uploaded: ${snapshotId} (${(snapshotData.length / 1024 / 1024).toFixed(2)} MB)`);

    res.json({ 
      success: true, 
      snapshotId,
      message: 'Snapshot uploaded successfully',
      size: snapshotData.length
    });
    
  } catch (error) {
    console.error('❌ Upload failed:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

// Compare snapshots
app.post('/api/snapshots/compare', async (req, res) => {
  try {
    const { serviceName, containerId, beforeSnapshotId, afterSnapshotId, timeframe } = req.body;
    
    if (!serviceName || !beforeSnapshotId || !afterSnapshotId) {
      return res.status(400).json({ 
        error: 'Missing required fields: serviceName, beforeSnapshotId, afterSnapshotId' 
      });
    }

    const sessionId = `comparison_${serviceName}_${Date.now()}`;
    
    // Check if both snapshots exist
    const beforeSnapshot = snapshots.get(beforeSnapshotId);
    const afterSnapshot = snapshots.get(afterSnapshotId);
    
    if (!beforeSnapshot || !afterSnapshot) {
      return res.status(404).json({
        error: 'One or both snapshots not found',
        missing: {
          before: !beforeSnapshot,
          after: !afterSnapshot
        }
      });
    }

    console.log(`🔬 Comparing: ${beforeSnapshotId} vs ${afterSnapshotId}`);

    // Simple analysis (in a real implementation, use memlab or your analyzer)
    const beforeSize = beforeSnapshot.size;
    const afterSize = afterSnapshot.size;
    const growth = afterSize - beforeSize;
    const growthMB = growth / (1024 * 1024);
    
    const analysis = {
      summary: {
        totalGrowthMB: growthMB,
        suspiciousGrowth: Math.abs(growthMB) > 1, // 1MB threshold
        confidence: 0.8
      },
      leakCount: Math.abs(growthMB) > 1 ? 1 : 0,
      recommendations: [
        growthMB > 1 ? '⚠️ Memory growth detected. Review recent code changes.' : '✅ Memory usage appears stable.',
        '💡 Consider using heap profiling for detailed analysis.',
        '🔍 Monitor memory trends over longer periods.'
      ]
    };

    // Store comparison result
    comparisons.set(sessionId, {
      sessionId,
      serviceName,
      beforeSnapshotId,
      afterSnapshotId,
      status: 'completed',
      analysis,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      sessionId,
      status: 'completed',
      analysis
    });
    
  } catch (error) {
    console.error('❌ Comparison failed:', error);
    res.status(500).json({ 
      error: 'Comparison failed', 
      details: error.message 
    });
  }
});

// Get comparison result
app.get('/api/snapshots/comparisons/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const comparison = comparisons.get(sessionId);
  
  if (!comparison) {
    return res.status(404).json({ error: 'Comparison not found' });
  }

  res.json(comparison);
});

// List all snapshots
app.get('/api/snapshots', (req, res) => {
  const snapshotList = Array.from(snapshots.values()).map(snapshot => ({
    id: snapshot.id,
    serviceName: snapshot.serviceName,
    phase: snapshot.phase,
    timestamp: snapshot.timestamp,
    size: snapshot.size
  }));

  res.json({ snapshots: snapshotList });
});

// List all comparisons
app.get('/api/snapshots/comparisons', (req, res) => {
  const comparisonList = Array.from(comparisons.values()).map(comp => ({
    sessionId: comp.sessionId,
    serviceName: comp.serviceName,
    status: comp.status,
    createdAt: comp.createdAt,
    hasResult: !!comp.analysis
  }));

  res.json({ comparisons: comparisonList });
});

app.listen(port, () => {
  console.log(`🚀 Simple HTTP Snapshot Server running on port ${port}`);
  console.log(`📡 API available at http://localhost:${port}/api`);
  console.log(`📸 Upload: POST /api/snapshots/upload`);
  console.log(`🔬 Compare: POST /api/snapshots/compare`);
  console.log(`🏥 Health: GET /health`);
  console.log();
  console.log('Ready for HTTP snapshot uploads! 🎉');
});
