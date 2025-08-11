# 🚀 Zupee MemWatch Installation Guide

This guide shows how to integrate `@zupee/memwatch` into any existing Node.js repository.

## 📋 Prerequisites

- Node.js 14 or higher
- NPM or Yarn package manager
- Running MemWatch dashboard server

## 🎯 Quick Integration

### 1. Install the Package

```bash
# Using NPM
npm install zupee-memwatch

# Using Yarn
yarn add zupee-memwatch
```

### 2. Basic Integration

Add to your main application file (usually `index.js`, `app.js`, or `server.js`):

```javascript
import MemWatch from 'zupee-memwatch';

// Start monitoring
MemWatch.start({
  serviceName: 'your-service-name',
  dashboardUrl: 'ws://localhost:4000'
});

// Your existing application code...
```

### 3. Verify Integration

1. Start your application
2. Check console for MemWatch connection message:
   ```
   [MemWatch] Starting memory leak detection for: your-service-name
   [MemWatch] Connected to dashboard
   ```
3. Visit dashboard at `http://localhost:3000`
4. Your service should appear in the services table

## 🏗️ Repository-Specific Examples

### Express.js API Server

```javascript
// server.js
import express from 'express';
import MemWatch from 'zupee-memwatch';

const app = express();

// Initialize MemWatch before starting server
MemWatch.start({
  serviceName: 'express-api',
  dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL || 'ws://localhost:4000',
  checkInterval: 30000,
  leakThresholdMB: 100
});

// Your routes and middleware
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  MemWatch.stop();
  server.close();
});
```

### Microservice with Docker

```javascript
// app.js
import MemWatch from 'zupee-memwatch';

// Configuration from environment variables
const config = {
  serviceName: process.env.SERVICE_NAME || 'microservice',
  dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL || 'ws://localhost:4000',
  checkInterval: parseInt(process.env.MEMWATCH_INTERVAL || '30000'),
  leakThresholdMB: parseInt(process.env.MEMWATCH_THRESHOLD || '100'),
  enableHeapSnapshots: process.env.MEMWATCH_SNAPSHOTS === 'true'
};

MemWatch.start(config);

// Your microservice logic
console.log(`${config.serviceName} starting with MemWatch monitoring...`);
```

### Next.js Application

```javascript
// pages/_app.js or app/layout.js
import { useEffect } from 'react';
import MemWatch from 'zupee-memwatch';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Only run on server side
    if (typeof window === 'undefined') {
      MemWatch.start({
        serviceName: 'nextjs-app',
        dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL,
        checkInterval: 60000 // Less frequent for web apps
      });
    }
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;
```

### TypeScript Project

```typescript
// src/index.ts
import MemWatch, { MemWatchConfig } from 'zupee-memwatch';

const memwatchConfig: MemWatchConfig = {
  serviceName: 'typescript-service',
  dashboardUrl: 'ws://localhost:4000',
  checkInterval: 15000,
  leakThresholdMB: 75,
  enableHeapSnapshots: true,
  snapshotPath: './heap-snapshots'
};

MemWatch.start(memwatchConfig);

// Your TypeScript application code...
```

## 🔧 Environment Configuration

### Environment Variables

Create a `.env` file in your project:

```bash
# MemWatch Configuration
MEMWATCH_DASHBOARD_URL=ws://localhost:4000
MEMWATCH_SERVICE_NAME=my-awesome-service
MEMWATCH_CHECK_INTERVAL=30000
MEMWATCH_LEAK_THRESHOLD=100
MEMWATCH_ENABLE_SNAPSHOTS=false
```

### Configuration Helper

```javascript
// config/memwatch.js
const getMemWatchConfig = () => ({
  serviceName: process.env.MEMWATCH_SERVICE_NAME || process.env.npm_package_name || 'unknown-service',
  dashboardUrl: process.env.MEMWATCH_DASHBOARD_URL || 'ws://localhost:4000',
  checkInterval: parseInt(process.env.MEMWATCH_CHECK_INTERVAL || '30000'),
  leakThresholdMB: parseInt(process.env.MEMWATCH_LEAK_THRESHOLD || '100'),
  enableHeapSnapshots: process.env.MEMWATCH_ENABLE_SNAPSHOTS === 'true',
  snapshotPath: process.env.MEMWATCH_SNAPSHOT_PATH || './snapshots'
});

export default getMemWatchConfig;
```

Usage:
```javascript
import MemWatch from 'zupee-memwatch';
import getMemWatchConfig from './config/memwatch.js';

MemWatch.start(getMemWatchConfig());
```

## 🐳 Docker Integration

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create snapshots directory
RUN mkdir -p snapshots

# Environment variables for MemWatch
ENV MEMWATCH_DASHBOARD_URL=ws://memwatch-dashboard:4000
ENV MEMWATCH_SERVICE_NAME=dockerized-service

EXPOSE 3000

CMD ["node", "index.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  your-service:
    build: .
    environment:
      - MEMWATCH_DASHBOARD_URL=ws://memwatch-dashboard:4000
      - MEMWATCH_SERVICE_NAME=your-service
      - MEMWATCH_CHECK_INTERVAL=30000
    depends_on:
      - memwatch-dashboard
    networks:
      - monitoring

  memwatch-dashboard:
    image: zupee/memwatch-dashboard:latest
    ports:
      - "4000:4000"
      - "3000:3000"
    networks:
      - monitoring

networks:
  monitoring:
    driver: bridge
```

## ☸️ Kubernetes Integration

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: memwatch-config
  namespace: production
data:
  dashboard-url: "ws://memwatch-dashboard.monitoring.svc.cluster.local:4000"
  check-interval: "30000"
  leak-threshold: "100"
  enable-snapshots: "false"
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: your-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: your-service
  template:
    metadata:
      labels:
        app: your-service
    spec:
      containers:
      - name: your-service
        image: your-service:latest
        env:
        - name: MEMWATCH_DASHBOARD_URL
          valueFrom:
            configMapKeyRef:
              name: memwatch-config
              key: dashboard-url
        - name: MEMWATCH_SERVICE_NAME
          value: "your-service"
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
```

## 🔍 Verification Steps

### 1. Check Console Output

After starting your application, you should see:

```
[MemWatch] Starting memory leak detection for: your-service
[MemWatch] Connected to dashboard
```

### 2. Dashboard Verification

1. Open `http://localhost:3000`
2. Your service should appear in the services table
3. Status should show "Connected"
4. Memory metrics should update every few seconds

### 3. Test Memory Monitoring

Add a test endpoint to verify monitoring:

```javascript
app.get('/test/memory-spike', (req, res) => {
  // Temporary memory allocation for testing
  const data = new Array(10000).fill(new Array(1000).fill('test'));
  
  setTimeout(() => {
    // Let it be garbage collected
    res.json({ message: 'Memory spike test completed' });
  }, 1000);
});
```

## ❌ Troubleshooting

### Connection Issues

**Problem**: Service not appearing in dashboard

**Solutions**:
1. Check dashboard server is running on port 4000
2. Verify `dashboardUrl` configuration
3. Check firewall/network connectivity
4. Review console for error messages

### Memory Detection Issues

**Problem**: Memory leaks not being detected

**Solutions**:
1. Lower `leakThresholdMB` for testing
2. Reduce `checkInterval` for faster detection
3. Increase `historySize` for better trend analysis
4. Verify actual memory growth with `node --expose-gc`

### TypeScript Issues

**Problem**: Type errors when importing

**Solutions**:
```bash
npm install --save-dev @types/node
```

Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  }
}
```

### Performance Concerns

**Problem**: Monitoring overhead

**Solutions**:
1. Increase `checkInterval` to reduce frequency
2. Disable `enableHeapSnapshots` in production
3. Use separate monitoring environment
4. Configure appropriate thresholds

## 📞 Support

If you encounter issues:

1. Check the [Troubleshooting Guide](https://github.com/zupee/memwatch/wiki/troubleshooting)
2. Review [GitHub Issues](https://github.com/zupee/memwatch/issues)
3. Contact Zupee Engineering Team

## 📚 Additional Resources

- [Configuration Reference](https://github.com/zupee/memwatch/wiki/configuration)
- [API Documentation](https://github.com/zupee/memwatch/wiki/api)
- [Best Practices](https://github.com/zupee/memwatch/wiki/best-practices)
- [Performance Guide](https://github.com/zupee/memwatch/wiki/performance)

---

Happy monitoring! 🚀
