# zupee-memwatch

🚀 **Memory Leak Detection Tool for Node.js Microservices**

A comprehensive memory leak detection and monitoring system designed for Zupee's Node.js microservices. Features real-time monitoring, intelligent leak detection, and a beautiful dashboard interface.

## 🏗️ Architecture

```
┌─────────────────┐    WebSocket     ┌─────────────────┐    HTTP/WS    ┌─────────────────┐
│   Node.js App   │ ───────────────► │ Dashboard Server│ ◄─────────── │ React Dashboard │
│  + @zupee/      │    (Metrics)     │                 │  (Real-time)  │     (Web UI)    │
│    memwatch     │                  │                 │               │                 │
└─────────────────┘                  └─────────────────┘               └─────────────────┘
```

## 🚀 Quick Start

### For Package Developers (Setting up the dashboard)

1. **Clone and Setup:**
   ```bash
   git clone <repo-url>
   cd zupee-memwatch
   ./scripts/setup.sh
   ```

2. **Start Dashboard Server:**
   ```bash
   ./scripts/start-dashboard.sh
   ```

3. **Start Dashboard UI:**
   ```bash
   ./scripts/start-frontend.sh
   ```

4. **Test with Simulation:**
   ```bash
   ./scripts/start-test.sh leak
   ```

### For Service Integration (Using the package)

1. **Install Package:**
   ```bash
   npm install zupee-memwatch
   ```

2. **Add to Your Service:**
   ```typescript
   import MemWatch from 'zupee-memwatch';

   // Start monitoring
   MemWatch.start({
     serviceName: 'user-service',
     dashboardUrl: 'ws://localhost:4000',
     checkInterval: 10000,
     leakThresholdMB: 50,
     enableHeapSnapshots: true
   });
   ```

3. **View Dashboard:**
   Open `http://localhost:3000`

## 📦 Installation

### NPM Package
```bash
npm install zupee-memwatch
```

### Development Setup
```bash
git clone <repo-url>
cd zupee-memwatch
npm install
npm run build
```

## 🔧 Configuration

### Basic Configuration
```typescript
import MemWatch from 'zupee-memwatch';

MemWatch.start({
  serviceName: 'my-service',           // Required: Service identifier
  dashboardUrl: 'ws://localhost:4000', // Dashboard WebSocket URL
});
```

### Advanced Configuration
```typescript
MemWatch.start({
  serviceName: 'payment-service',
  dashboardUrl: 'ws://monitoring.zupee.com:4000',
  checkInterval: 30000,              // Check every 30 seconds
  leakThresholdMB: 100,              // Alert if growth > 100MB
  enableHeapSnapshots: true,         // Generate .heapsnapshot files
  snapshotPath: './heap-snapshots',  // Snapshot directory
  historySize: 20                    // Trend analysis window
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | `string` | **Required** | Unique identifier for your service |
| `dashboardUrl` | `string` | `'ws://localhost:4000'` | WebSocket URL of dashboard server |
| `checkInterval` | `number` | `10000` | Memory check interval in milliseconds |
| `leakThresholdMB` | `number` | `50` | Memory growth threshold in MB |
| `enableHeapSnapshots` | `boolean` | `false` | Generate heap snapshots on leak detection |
| `snapshotPath` | `string` | `'./snapshots'` | Directory for heap snapshot files |
| `historySize` | `number` | `12` | Number of readings for trend analysis |

## 🎯 Features

### 🤖 Intelligent Leak Detection
- **Trend Analysis**: Monitors memory growth patterns over time
- **False Positive Reduction**: Distinguishes between normal spikes and actual leaks
- **Configurable Thresholds**: Customize sensitivity per service
- **Multiple Metrics**: Tracks heap usage, RSS, event loop delay

### 📊 Real-time Dashboard
- **Live Service Monitoring**: See all connected services at a glance
- **Interactive Charts**: Detailed memory usage visualization
- **Alert Management**: Real-time notifications and alert history
- **Service Health**: Connection status and performance metrics

### 📸 Heap Snapshot Integration
- **Automatic Generation**: Creates snapshots when leaks are detected
- **Chrome DevTools Compatible**: Analyze with familiar tooling
- **Storage Management**: Configurable snapshot retention

### 🔄 Production Ready
- **Zero Dependencies**: Minimal impact on your application
- **Auto Reconnection**: Handles network interruptions gracefully
- **Error Handling**: Robust error recovery and logging
- **TypeScript Support**: Full type definitions included

## 🧪 Testing & Validation

### Run Test Service
```bash
# Normal operation
npm test

# Simulate memory leaks
npm run test:leak

# Custom configuration
node test/test-service.js --name=my-test --intensity=2 --simulate-leak
```

### Manual Testing
```javascript
// In Node.js REPL or service console
triggerLeak()  // Create major memory leak
clearLeaks()   // Clear all simulated leaks
```

## 📈 Dashboard API

### REST Endpoints

#### Get All Services
```http
GET /api/services
```

#### Get Service Metrics
```http
GET /api/services/:serviceName/metrics?limit=100&from=timestamp&to=timestamp
```

#### Get Alerts
```http
GET /api/alerts?limit=50&service=serviceName&severity=critical
```

#### System Statistics
```http
GET /api/stats
```

### WebSocket Events

#### Agent → Dashboard
```typescript
// Service registration
{ type: 'registration', service: 'my-service', timestamp: number }

// Memory metrics
{ 
  type: 'metrics', 
  service: 'my-service',
  heapUsedMB: number,
  rssMB: number,
  eventLoopDelayMs: number,
  leakDetected: boolean,
  timestamp: number
}

// Heap snapshot generated
{ type: 'snapshot', service: 'my-service', filename: string, timestamp: number }
```

#### Dashboard → Frontend
```typescript
// Real-time metric updates
{ type: 'metricsUpdate', ...metrics }

// Leak alerts
{ type: 'leakAlert', alert: Alert }

// Service status changes
{ type: 'serviceUpdate', service: string, status: string }
```

## 🔍 Leak Detection Algorithm

The detection algorithm uses multiple heuristics:

1. **Memory Growth Analysis**: Tracks heap usage over time
2. **Trend Detection**: Identifies consistent upward patterns
3. **Garbage Collection Awareness**: Distinguishes between normal spikes and leaks
4. **Threshold Comparison**: Configurable sensitivity per service

```typescript
function detectLeak(history: MemoryPoint[], threshold: number): boolean {
  const growth = calculateGrowth(history);
  const trend = analyzeTrend(history);
  
  return growth > threshold && trend > 0.7; // 70% upward trend
}
```

## 🏢 Production Deployment

### Environment Variables
```bash
export MEMWATCH_DASHBOARD_URL=ws://monitoring.zupee.com:4000
export MEMWATCH_CHECK_INTERVAL=30000
export MEMWATCH_LEAK_THRESHOLD=100
```

### Docker Integration
```dockerfile
# In your service Dockerfile
COPY package*.json ./
RUN npm install

# Your app will automatically connect if configured
ENV MEMWATCH_DASHBOARD_URL=ws://monitoring.zupee.com:4000
```

### Kubernetes ConfigMap
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: memwatch-config
data:
  dashboard-url: "ws://memwatch-dashboard.monitoring.svc.cluster.local:4000"
  check-interval: "30000"
  leak-threshold: "100"
```

## 🎨 Integration Examples

### Express.js Application
```typescript
import express from 'express';
import MemWatch from 'zupee-memwatch';

const app = express();

// Start memory monitoring
MemWatch.start({
  serviceName: 'express-api',
  dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL,
  leakThresholdMB: 75
});

app.listen(3000, () => {
  console.log('Server running with MemWatch monitoring');
});
```

### Microservice with Custom Config
```typescript
import MemWatch from 'zupee-memwatch';

// Start monitoring with production settings
MemWatch.start({
  serviceName: process.env.SERVICE_NAME || 'unknown-service',
  dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL || 'ws://localhost:4000',
  checkInterval: parseInt(process.env.MEMWATCH_INTERVAL || '30000'),
  leakThresholdMB: parseInt(process.env.MEMWATCH_THRESHOLD || '100'),
  enableHeapSnapshots: process.env.NODE_ENV !== 'production'
});

// Your service logic here...

// Graceful shutdown
process.on('SIGTERM', () => {
  MemWatch.stop();
  process.exit(0);
});
```

### Game Service Integration
```typescript
import MemWatch from 'zupee-memwatch';

// Higher thresholds for game services
MemWatch.start({
  serviceName: 'ludo-game-engine',
  dashboardUrl: 'ws://monitoring.zupee.com:4000',
  checkInterval: 15000,           // Check every 15 seconds
  leakThresholdMB: 200,           // Higher threshold for game logic
  enableHeapSnapshots: true,
  historySize: 20                 // Longer analysis window
});
```

## 🔐 Security Considerations

### Production Checklist
- [ ] Use HTTPS/WSS for dashboard connections
- [ ] Implement authentication for dashboard access
- [ ] Restrict network access to monitoring infrastructure
- [ ] Configure appropriate heap snapshot retention policies
- [ ] Monitor the monitoring system itself

### Network Security
```typescript
// Use secure WebSocket in production
MemWatch.start({
  serviceName: 'secure-service',
  dashboardUrl: 'wss://monitoring.zupee.com:4000',
  // ... other config
});
```

## 📊 Metrics & Monitoring

### Collected Metrics
- **Heap Used**: Current JavaScript heap usage
- **Heap Total**: Total heap size allocated
- **RSS**: Resident Set Size (physical memory)
- **External**: Memory used by C++ objects
- **Event Loop Delay**: Node.js event loop responsiveness

### Alert Types
- **Memory Leak**: Sustained memory growth above threshold
- **Heap Snapshot**: Snapshot generated for analysis
- **Service Disconnect**: Service connection lost

## 🛠️ Development

### Building from Source
```bash
git clone <repo-url>
cd zupee-memwatch
npm install
npm run build
```

### Running Tests
```bash
npm test                    # Basic test service
npm run test:leak          # Memory leak simulation
npm run start:dashboard    # Start dashboard server
npm run start:frontend     # Start React UI
```

### Project Structure
```
zupee-memwatch/
├── src/
│   ├── index.ts           # Main MemWatch agent
│   └── dashboard/
│       └── server.ts      # Dashboard server
├── dashboard-ui/          # React dashboard
├── test/                  # Test services
├── scripts/               # Setup and utility scripts
└── dist/                  # Built TypeScript output
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/zupee/memwatch/issues)
- **Documentation**: [GitHub Wiki](https://github.com/zupee/memwatch/wiki)
- **Team**: Zupee Engineering Team

---

Made with ❤️ by Zupee Engineering Team
