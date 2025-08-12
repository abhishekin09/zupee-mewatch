# zupee-memwatch

🚀 **Memory Snapshot Capture Tool for Node.js Microservices**

A lightweight memory snapshot capture tool designed for Node.js microservices. Captures heap snapshots with zero downtime using container replacement strategy and uploads them to a centralized dashboard for analysis.

## ✨ Key Features

- 📸 **Zero-Downtime Snapshot Capture** - Container replacement strategy for production snapshot capture
- 🔄 **Simplified Workflow** - Capture snapshots with minimal flags
- 🌐 **Dashboard Integration** - Automatic upload to centralized analysis dashboard
- 🏗️ **Container Support** - Docker and Kubernetes container strategies
- 📊 **Session Grouping** - Before/After snapshots are automatically paired for analysis

## 🏗️ Architecture

```
┌─────────────────┐    HTTP/Upload    ┌─────────────────┐    Sessions     ┌─────────────────┐
│   CLI Capture   │ ─────────────────► │ Analysis Server │ ◄─────────────► │ React Dashboard │
│  zupee-memwatch │   (Snapshots)     │  (webapp)       │  (Analysis UI)  │   (Web UI)      │
└─────────────────┘                   └─────────────────┘                 └─────────────────┘
```

## 🚀 Quick Start

### 1. Install the CLI Tool
```bash
npm install -g zupee-memwatch
```

### 2. Capture Memory Snapshots
```bash
# Minimal command (uses smart defaults)
zupee-memwatch capture --container-id d71ae883f659 --timeframe 3

# With custom dashboard URL
zupee-memwatch capture \
  --container-id d71ae883f659 \
  --timeframe 5 \
  --dashboard-url https://your-analysis-dashboard.com
```

### 3. View Results
Open your analysis dashboard to see paired before/after snapshots organized by session.

## 🔧 CLI Commands

### Snapshot Capture (Recommended)

**Zero-downtime capture with automatic upload:**
```bash
# Production capture - minimal flags needed
zupee-memwatch capture --container-id <container-id> --timeframe <minutes>

# Full command with all options
zupee-memwatch capture \
  --container-id d71ae883f659 \
  --timeframe 5 \
  --strategy docker \
  --service-name my-service \
  --dashboard-url https://analysis.example.com
```

**Command Options:**
- `--container-id` - Target container ID (required)
- `--timeframe` - Minutes between before/after snapshots (required)
- `--strategy` - Container strategy: `docker` or `k8s` (default: docker)
- `--service-name` - Service identifier (default: container-id)
- `--dashboard-url` - Analysis dashboard URL (default: configured endpoint)

### Local Snapshot

**Quick local snapshot (no upload):**
```bash
zupee-memwatch snapshot --output ./heap.heapsnapshot
```

**Internal snapshot (from inside container):**
```bash
zupee-memwatch internal-snapshot --file /tmp/heap.heapsnapshot
```

## ⚙️ Configuration

### Environment Variables

Set defaults to reduce command flags:

```bash
export MEMWATCH_DASHBOARD_URL=https://your-analysis-dashboard.com
export MEMWATCH_STRATEGY=docker
export MEMWATCH_SESSION_ID=custom-session-name
```

### Docker Integration
```dockerfile
# Install globally in your build container
RUN npm install -g zupee-memwatch

# Set default dashboard
ENV MEMWATCH_DASHBOARD_URL=https://analysis.example.com
```

### Simplified Usage
With environment variables set:
```bash
# Just container ID and timeframe needed
zupee-memwatch capture --container-id d71ae883f659 --timeframe 3
```

## 📁 File Organization

Snapshots are automatically organized for easy analysis:

### Local Files (CLI side)
```
./snapshots/
├── d71ae883f659/
│   ├── session_d71ae883f659_1704934567890_before_2024-01-11T10-42-47-890Z.heapsnapshot
│   └── session_d71ae883f659_1704934567890_after_2024-01-11T10-45-47-891Z.heapsnapshot
└── another-container/
    └── ...
```

### Dashboard Files (Analysis server)
```
./dashboard-snapshots/
├── my-service/
│   ├── session_d71ae883f659_1704934567890_before_...
│   └── session_d71ae883f659_1704934567890_after_...
└── another-service/
    └── ...
```

## 🎯 Workflow

1. **Capture**: Run capture command targeting your container
2. **Before Snapshot**: Tool takes initial heap snapshot
3. **Wait Period**: Specified timeframe passes (e.g., 3 minutes)
4. **After Snapshot**: Tool takes second heap snapshot
5. **Upload**: Both snapshots automatically uploaded to dashboard
6. **Analysis**: Use dashboard UI to compare and analyze paired snapshots

## 🔍 Container Strategies

### Docker Strategy (Default)
```bash
zupee-memwatch capture --container-id d71ae883f659 --timeframe 3 --strategy docker
```
- Works with Docker containers
- Uses `docker exec` for snapshot capture
- Suitable for local development and Docker-based deployments

### Kubernetes Strategy
```bash
zupee-memwatch capture --container-id my-pod --timeframe 5 --strategy k8s --namespace production
```
- Works with Kubernetes pods
- Uses `kubectl exec` for snapshot capture
- Suitable for Kubernetes deployments

## 📊 Session Management

Snapshots are automatically grouped into sessions for easier analysis:

- **Session ID**: Automatically generated timestamp-based identifier
- **Before/After Pairing**: Snapshots from same capture run are linked
- **Service Grouping**: Organized by service name for multi-service monitoring
- **Custom Sessions**: Override with `MEMWATCH_SESSION_ID` environment variable

## 🚀 Production Usage

### Basic Production Capture
```bash
# Set once in your environment
export MEMWATCH_DASHBOARD_URL=https://memory-analysis.yourcompany.com
export MEMWATCH_STRATEGY=k8s

# Simple capture command
zupee-memwatch capture --container-id production-pod-xyz --timeframe 10
```

### Automated Monitoring
```bash
#!/bin/bash
# Weekly memory capture script
containers=("service-a-pod" "service-b-pod" "service-c-pod")

for container in "${containers[@]}"; do
  echo "Capturing $container..."
  zupee-memwatch capture --container-id "$container" --timeframe 5
  sleep 300  # Wait 5 minutes between captures
done
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Memory Snapshot Capture
  run: |
    zupee-memwatch capture \
      --container-id ${{ env.CONTAINER_ID }} \
      --timeframe 3 \
      --service-name ${{ env.SERVICE_NAME }}
```

## 🛠️ Development

### Building from Source
```bash
git clone https://github.com/your-org/zupee-memwatch
cd zupee-memwatch
npm install
npm run build
```

### Local Testing
```bash
# Build and test locally
npm run build
node dist/cli/leak-detector.js snapshot --output ./test.heapsnapshot

# Test capture (requires running container)
node dist/cli/leak-detector.js capture \
  --container-id test-container \
  --timeframe 0.1 \
  --dashboard-url http://localhost:4000
```

## 📦 Package Information

- **Package Name**: `zupee-memwatch`
- **Latest Version**: `2.0.2`
- **Install**: `npm install -g zupee-memwatch`
- **CLI Command**: `zupee-memwatch`

## 🔄 Migration from v1.x

v2.0+ focuses on snapshot capture only. Analysis features have been moved to the separate webapp:

**v1.x (deprecated):**
```bash
leak-detector analyze --before ./before.heapsnapshot --after ./after.heapsnapshot
```

**v2.0+ (current):**
```bash
# Capture snapshots
zupee-memwatch capture --container-id xyz --timeframe 3

# Analysis is done in the web dashboard
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

- **Issues**: [GitHub Issues](https://github.com/your-org/zupee-memwatch/issues)
- **Documentation**: [GitHub Wiki](https://github.com/your-org/zupee-memwatch/wiki)
- **Team**: Your Engineering Team

---

Made with ❤️ for efficient memory debugging