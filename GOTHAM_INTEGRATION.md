# 🎯 Integrating Zupee MemWatch with Gotham Service

This guide shows how to integrate the `@zupee/memwatch` package with the Gotham service for memory leak monitoring.

## 🚀 Quick Integration Steps

### 1. Install MemWatch Package

```bash
cd /Users/abhishek.rawat/tni/gotham.service
npm install /Users/abhishek.rawat/tni/zupee-memwatch
```

> **Note**: Use local path for development. In production, use `npm install @zupee/memwatch` after publishing.

### 2. Add to Gotham Service

Edit your main entry point (likely `src/express/index.ts`):

```typescript
// Add this import at the top
import MemWatch from '@zupee/memwatch';

// Add this configuration before starting your Express server
MemWatch.start({
  serviceName: 'gotham-service',
  dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL || 'ws://localhost:4000',
  checkInterval: 30000,        // Check every 30 seconds
  leakThresholdMB: 150,        // Higher threshold for Gotham
  enableHeapSnapshots: process.env.NODE_ENV !== 'production',
  snapshotPath: './heap-snapshots'
});

// Your existing Express server setup...
```

### 3. Environment Configuration

Add to your `.env` or environment configuration:

```bash
# MemWatch Configuration
MEMWATCH_DASHBOARD_URL=ws://localhost:4000
MEMWATCH_SERVICE_NAME=gotham-service
MEMWATCH_CHECK_INTERVAL=30000
MEMWATCH_LEAK_THRESHOLD=150
MEMWATCH_ENABLE_SNAPSHOTS=true
```

### 4. Configuration by Environment

Update your config files to include MemWatch settings:

```typescript
// In config/index.js or similar
export const memwatchConfig = {
  development: {
    serviceName: 'gotham-service-dev',
    dashboardUrl: 'ws://localhost:4000',
    checkInterval: 10000,       // More frequent in dev
    leakThresholdMB: 50,        // Lower threshold for testing
    enableHeapSnapshots: true
  },
  staging: {
    serviceName: 'gotham-service-staging',
    dashboardUrl: 'ws://monitoring-staging.zupee.com:4000',
    checkInterval: 30000,
    leakThresholdMB: 100,
    enableHeapSnapshots: true
  },
  production: {
    serviceName: 'gotham-service',
    dashboardUrl: 'ws://monitoring.zupee.com:4000',
    checkInterval: 60000,       // Less frequent in production
    leakThresholdMB: 200,       // Higher threshold for production
    enableHeapSnapshots: false  // Disabled for performance
  }
};
```

## 🎮 Game-Specific Monitoring

Since Gotham handles game services, configure appropriately:

### For Game Event Processing

```typescript
// In your game event processors
import MemWatch from '@zupee/memwatch';

// Configure for game workloads
MemWatch.start({
  serviceName: `gotham-${process.env.GAME_TYPE || 'unknown'}`,
  dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL,
  checkInterval: 15000,        // More frequent for games
  leakThresholdMB: 300,        // Higher threshold for game data
  enableHeapSnapshots: true,
  historySize: 20              // Longer analysis window
});
```

### For Different Game Types

```typescript
const getGameSpecificConfig = (gameType: string) => {
  const baseConfig = {
    serviceName: `gotham-${gameType}`,
    dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL || 'ws://localhost:4000',
    enableHeapSnapshots: process.env.NODE_ENV !== 'production'
  };

  switch (gameType) {
    case 'ludo':
      return {
        ...baseConfig,
        checkInterval: 20000,
        leakThresholdMB: 200,
        historySize: 15
      };
    
    case 'rummy':
      return {
        ...baseConfig,
        checkInterval: 15000,
        leakThresholdMB: 250,
        historySize: 20
      };
    
    default:
      return {
        ...baseConfig,
        checkInterval: 30000,
        leakThresholdMB: 150,
        historySize: 12
      };
  }
};

// Usage
const gameType = process.env.GAME_TYPE || 'default';
MemWatch.start(getGameSpecificConfig(gameType));
```

## 🐳 Docker Integration

Update your Dockerfile:

```dockerfile
# In gotham.service Dockerfile

FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create snapshots directory for MemWatch
RUN mkdir -p heap-snapshots

# Build TypeScript
RUN npm run build

# Environment variables for MemWatch
ENV MEMWATCH_DASHBOARD_URL=ws://memwatch-dashboard:4000
ENV MEMWATCH_SERVICE_NAME=gotham-service

EXPOSE 3000

CMD ["node", "dist/express/index.js"]
```

## ☸️ Kubernetes Configuration

### ConfigMap for MemWatch

```yaml
# k8s/memwatch-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: memwatch-config
  namespace: gotham
data:
  dashboard-url: "ws://memwatch-dashboard.monitoring.svc.cluster.local:4000"
  check-interval: "30000"
  leak-threshold: "200"
  enable-snapshots: "false"
```

### Update Deployment

```yaml
# k8s/deployments/gotham.service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gotham-service
spec:
  template:
    spec:
      containers:
      - name: gotham-service
        image: gotham-service:latest
        env:
        # Existing environment variables...
        
        # MemWatch configuration
        - name: MEMWATCH_DASHBOARD_URL
          valueFrom:
            configMapKeyRef:
              name: memwatch-config
              key: dashboard-url
        - name: MEMWATCH_SERVICE_NAME
          value: "gotham-service"
        - name: MEMWATCH_CHECK_INTERVAL
          valueFrom:
            configMapKeyRef:
              name: memwatch-config
              key: check-interval
        - name: MEMWATCH_LEAK_THRESHOLD
          valueFrom:
            configMapKeyRef:
              name: memwatch-config
              key: leak-threshold
        - name: MEMWATCH_ENABLE_SNAPSHOTS
          valueFrom:
            configMapKeyRef:
              name: memwatch-config
              key: enable-snapshots
```

## 📊 Monitoring Different Services

### Consumer Services

```typescript
// In consumers/kafka/pucConsumer.ts
import MemWatch from '@zupee/memwatch';

MemWatch.start({
  serviceName: 'gotham-puc-consumer',
  dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL,
  checkInterval: 20000,
  leakThresholdMB: 100,
  enableHeapSnapshots: true
});
```

### Job Services

```typescript
// In jobs/init.ts
import MemWatch from '@zupee/memwatch';

MemWatch.start({
  serviceName: 'gotham-jobs',
  dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL,
  checkInterval: 45000,       // Less frequent for background jobs
  leakThresholdMB: 250,       // Higher threshold for batch processing
  enableHeapSnapshots: true
});
```

## 🔍 Gotham-Specific Monitoring Points

### Challenge Processing

Add monitoring around challenge processing:

```typescript
// In classes/challenge/challenge.class.ts
app.get('/api/memory/trigger-challenge-test', async (req, res) => {
  // Test endpoint to trigger memory-intensive challenge processing
  const challenges = [];
  for (let i = 0; i < 1000; i++) {
    challenges.push(await processChallengeData(generateTestChallenge()));
  }
  
  res.json({ 
    message: 'Challenge processing test completed',
    processed: challenges.length 
  });
});
```

### Cache Monitoring

```typescript
// In classes/cache.class.ts
export class CacheManager {
  constructor() {
    // Add MemWatch for cache-specific monitoring
    if (process.env.MEMWATCH_CACHE_MONITORING === 'true') {
      setInterval(() => {
        const cacheSize = this.getCacheSize();
        console.log(`[Cache] Current cache size: ${cacheSize} items`);
      }, 30000);
    }
  }
}
```

## 📈 Performance Considerations for Gotham

### Recommended Settings by Service Type

| Service Type | Check Interval | Threshold | Snapshots | Reason |
|-------------|---------------|-----------|-----------|---------|
| API Server | 30s | 200MB | Dev only | Balance monitoring vs performance |
| Consumer | 20s | 150MB | Yes | Critical for leak detection |
| Jobs | 60s | 300MB | Yes | Batch processing needs higher threshold |
| Cache | 45s | 250MB | Dev only | Cache growth is expected |

### Load Testing Integration

```typescript
// For load testing scenarios
if (process.env.LOAD_TEST_MODE === 'true') {
  MemWatch.start({
    serviceName: `gotham-loadtest-${Date.now()}`,
    dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL,
    checkInterval: 5000,        // Very frequent during load tests
    leakThresholdMB: 50,        // Lower threshold to catch issues early
    enableHeapSnapshots: true,
    historySize: 30             // Longer analysis for load patterns
  });
}
```

## 🚨 Alert Integration

### Slack Notifications

```typescript
// Add to your notification service
import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_TOKEN);

// Listen for MemWatch alerts (if implementing custom alerting)
process.on('memwatch:leak-detected', async (data) => {
  await slack.chat.postMessage({
    channel: '#gotham-alerts',
    text: `🚨 Memory leak detected in ${data.serviceName}!`,
    attachments: [{
      color: 'danger',
      fields: [
        { title: 'Service', value: data.serviceName, short: true },
        { title: 'Heap Usage', value: `${data.heapUsedMB}MB`, short: true },
        { title: 'Growth', value: `+${data.memoryGrowthMB}MB`, short: true }
      ]
    }]
  });
});
```

## ✅ Verification Steps

1. **Install and Configure**:
   ```bash
   cd gotham.service
   npm install /Users/abhishek.rawat/tni/zupee-memwatch
   ```

2. **Update Entry Point**:
   Add MemWatch initialization to your main file

3. **Start Dashboard**:
   ```bash
   cd /Users/abhishek.rawat/tni/zupee-memwatch
   ./scripts/start-dashboard.sh
   ```

4. **Start Gotham Service**:
   ```bash
   cd gotham.service
   npm start
   ```

5. **Verify Connection**:
   - Check console for MemWatch connection messages
   - Visit http://localhost:3000
   - Confirm "gotham-service" appears in services table

6. **Test Memory Monitoring**:
   - Trigger some game events
   - Monitor memory usage in dashboard
   - Check for any leak detection alerts

## 🔧 Troubleshooting

### Common Issues

1. **Service not appearing in dashboard**:
   - Check `MEMWATCH_DASHBOARD_URL` configuration
   - Verify dashboard server is running
   - Check firewall/network settings

2. **High memory usage alerts**:
   - Increase `leakThresholdMB` for game workloads
   - Verify if growth is legitimate (caching, game data)
   - Check for actual memory leaks in game logic

3. **Performance impact**:
   - Increase `checkInterval` to reduce frequency
   - Disable `enableHeapSnapshots` in production
   - Monitor MemWatch overhead itself

---

Ready to monitor Gotham's memory usage! 🎮📊
