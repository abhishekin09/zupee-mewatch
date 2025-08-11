# Automated Heap Snapshot Leak Detection

This document describes the comprehensive heap snapshot-based memory leak detection system built into zupee-memwatch. This system provides zero-downtime container replacement and automated analysis for production environments.

## 🎯 Overview

The automated heap snapshot leak detection system addresses the need for thorough memory leak analysis in production environments without service interruption. It works by:

1. **Creating a replacement container** identical to the target
2. **Draining traffic** from the target container while keeping it running
3. **Taking before/after heap snapshots** during a controlled period
4. **Analyzing heap differences** to identify memory growth patterns
5. **Generating actionable reports** with leak severity and recommendations

## 🏗️ Architecture

### Core Components

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   External CLI      │    │  In-Container Agent  │    │  Analysis Engine    │
│                     │    │                      │    │                     │
│ • Orchestrates      │    │ • Maintenance Mode   │    │ • Heap Parsing      │
│ • Container Mgmt    │    │ • Snapshot Creation  │    │ • Diff Analysis     │
│ • Traffic Control   │    │ • Request Blocking   │    │ • Pattern Detection │
│ • Report Generation │    │ • WebSocket Commands │    │ • Severity Scoring  │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
          │                           │                           │
          │ docker/kubectl           │ WebSocket                 │ JSON/Files
          ▼                           ▼                           ▼
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│ Container Platform  │    │  Target Application  │    │    Report Output    │
│                     │    │                      │    │                     │
│ • Docker Engine     │    │ • Express/HTTP       │    │ • JSON Analysis     │
│ • Kubernetes API    │    │ • Graceful Shutdown  │    │ • Human Summary     │
│ • Load Balancer     │    │ • Memory Workload    │    │ • Jenkins Artifacts │
│ • Service Discovery │    │ • Heap Snapshots     │    │ • Webhook Alerts    │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
```

### Data Flow

1. **Discovery Phase**: Inspect target container metadata (image, env, ports)
2. **Replacement Phase**: Create and start replacement container
3. **Traffic Drain**: Remove target from load balancer/service discovery
4. **Snapshot Phase**: Take before snapshot → wait delay → take after snapshot
5. **Analysis Phase**: Parse heap snapshots and compare object growth
6. **Restoration Phase**: Restore target to traffic and cleanup replacement
7. **Reporting Phase**: Generate reports and send notifications

## 🚀 Quick Start

### Installation

```bash
npm install -g zupee-memwatch
```

### Basic Usage

```bash
# Docker container leak detection
leak-detector run \
  --container-id my-service \
  --delay 10 \
  --replace-strategy docker

# Kubernetes pod leak detection
leak-detector run \
  --container-id my-pod \
  --delay 15 \
  --replace-strategy k8s \
  --namespace production
```

### Quick Snapshot Analysis

```bash
# Take a snapshot of current process
leak-detector snapshot --output ./my-snapshot.heapsnapshot

# Analyze two snapshots
leak-detector analyze \
  --before ./before.heapsnapshot \
  --after ./after.heapsnapshot \
  --threshold 5242880  # 5MB
```

## 📋 Command Reference

### Main Commands

#### `leak-detector run`
Orchestrates the complete leak detection process with container replacement.

```bash
leak-detector run [options]

Options:
  --container-id <id>              Target container ID or pod name (required)
  --delay <minutes>                Minutes between snapshots (required)
  --output-dir <path>              Output directory (default: /tmp/leak-reports)
  --image <image:tag>              Replacement container image
  --replace-strategy <strategy>    docker | k8s (default: docker)
  --no-cleanup                     Keep replacement container
  --analysis-threshold <bytes>     Leak threshold in bytes (default: 10MB)
  --webhook <url>                  Webhook for notifications
  --namespace <name>               Kubernetes namespace (default: default)
  --drain-grace-period <seconds>   Traffic drain grace period (default: 30)
```

**Example:**
```bash
leak-detector run \
  --container-id api-service-pod-abc123 \
  --delay 12 \
  --replace-strategy k8s \
  --namespace production \
  --analysis-threshold 20971520 \
  --webhook https://hooks.slack.com/services/xxx \
  --output-dir ./leak-reports
```

#### `leak-detector internal-snapshot`
Internal command executed inside containers to take heap snapshots.

```bash
leak-detector internal-snapshot --file <path> [--maintenance-grace <ms>]
```

#### `leak-detector snapshot`
Quick heap snapshot utility for development.

```bash
leak-detector snapshot [--output <path>]
```

#### `leak-detector analyze`
Analyze existing heap snapshots for memory leaks.

```bash
leak-detector analyze \
  --before <path> \
  --after <path> \
  [--output <path>] \
  [--threshold <bytes>]
```

#### `leak-detector test`
Run test scenarios to verify leak detection.

```bash
leak-detector test [--scenario <name>]

Available scenarios:
  basic       - Normal workload without leaks
  leak        - Array-based memory leak simulation
  closure     - Closure-based leak simulation
  cleanup     - Cleanup verification test
```

## 🐳 Docker Integration

### Prerequisites

- Docker CLI access from Jenkins/CI environment
- Target container running and accessible
- Load balancer/proxy that can be updated (for traffic management)

### Docker Strategy Details

When using `--replace-strategy docker`, the system:

1. **Discovers metadata** via `docker inspect <container-id>`
2. **Creates replacement** with same image, environment, and configuration
3. **Requires manual traffic management** (see Traffic Management section)
4. **Takes snapshots** via `docker exec`
5. **Copies files** via `docker cp`
6. **Cleans up** replacement container

### Traffic Management for Docker

The Docker strategy requires external traffic management since Docker doesn't have built-in service discovery. Options include:

#### Option 1: Nginx/Traefik Configuration

```bash
# Remove target from upstream
curl -X DELETE http://nginx-admin/api/upstreams/backend/servers/target-ip:port

# Add replacement to upstream  
curl -X POST http://nginx-admin/api/upstreams/backend/servers \
  -d '{"server":"replacement-ip:port"}'
```

#### Option 2: Docker Compose Service Update

```bash
# Scale up the service
docker-compose up -d --scale my-service=2

# Remove specific container from load balancer
# (Implementation depends on your load balancer)
```

#### Option 3: Manual Health Check Toggles

```bash
# Set target container to unhealthy
docker exec target-container touch /tmp/maintenance

# Set replacement container to healthy
docker exec replacement-container rm -f /tmp/maintenance
```

## ☸️ Kubernetes Integration

### Prerequisites

- `kubectl` access with appropriate RBAC permissions
- Kubernetes service account with pod/deployment management rights
- Target pod running in accessible namespace

### Kubernetes Strategy Details

When using `--replace-strategy k8s`, the system:

1. **Discovers metadata** via `kubectl get pod -o json`
2. **Scales deployment** or creates identical pod
3. **Manages service endpoints** automatically via annotations
4. **Drains traffic** by setting pod readiness to false
5. **Takes snapshots** via `kubectl exec`
6. **Copies files** via `kubectl cp`
7. **Restores traffic** and scales down replacement

### Required RBAC Permissions

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: leak-detector
rules:
- apiGroups: [""]
  resources: ["pods", "pods/exec", "pods/log"]
  verbs: ["get", "list", "create", "delete", "patch", "update"]
- apiGroups: [""]
  resources: ["endpoints", "services"]
  verbs: ["get", "list", "patch", "update"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets"]
  verbs: ["get", "list", "patch", "update"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: leak-detector-binding
  namespace: production
subjects:
- kind: ServiceAccount
  name: jenkins-agent
  namespace: production
roleRef:
  kind: Role
  name: leak-detector
  apiGroup: rbac.authorization.k8s.io
```

### Traffic Draining Process

The Kubernetes strategy automatically handles traffic draining:

1. **Add annotation**: `leak-detector/drain: "true"`
2. **Set readiness**: Patch readiness probe status to `False`
3. **Wait grace period**: Allow in-flight requests to complete
4. **Take snapshots**: Container receives no new traffic
5. **Restore traffic**: Remove annotation and restore readiness

## 🔬 Analysis Engine

### Heap Snapshot Format

The analysis engine parses V8 heap snapshots in JSON format:

```json
{
  "snapshot": {
    "meta": {
      "node_fields": ["type", "name", "id", "self_size", "edge_count", "detachedness"],
      "node_types": [["hidden", "array", "string", "object", "code", ...], ...],
      "edge_fields": ["type", "name_or_index", "to_node"],
      "edge_types": [["context", "element", "property", ...], ...]
    },
    "node_count": 12345,
    "edge_count": 23456
  },
  "nodes": [0, 1, 2, 3, 4, 0, ...],
  "edges": [0, 1, 6, 1, 2, 12, ...],
  "strings": ["", "Array", "Object", ...]
}
```

### Analysis Methodology

#### 1. Object Type Grouping
- Group heap nodes by constructor/type name
- Calculate count and retained size for each type
- Track instances for detailed analysis

#### 2. Growth Detection
Objects are flagged as suspicious based on:
- **Absolute growth**: Size increase exceeding threshold (default: 10MB)
- **Relative growth**: Percentage increase relative to baseline
- **Count growth**: Large increase in object instances
- **Retention patterns**: Objects held by long-lived references

#### 3. Severity Classification

```typescript
type Severity = 'low' | 'medium' | 'high' | 'critical';

// Classification logic:
if (sizeMB > 100 || growthRate > 10) return 'critical';
if (sizeMB > 50 || growthRate > 5) return 'high';  
if (sizeMB > 10 || growthRate > 2) return 'medium';
return 'low';
```

#### 4. Pattern Recognition

The engine identifies common leak patterns:
- **Array growth**: Unbounded arrays/lists
- **Closure retention**: Event listeners, callbacks
- **Map/Set accumulation**: Cache-like structures
- **Promise chains**: Unresolved async operations
- **DOM references**: Browser-specific leaks (in hybrid environments)

### Sample Analysis Output

```json
{
  "before": {
    "totalSize": 52428800,
    "nodeCount": 15432,
    "timestamp": "2024-08-11T10:30:00.000Z",
    "filename": "before_1754910432185.heapsnapshot"
  },
  "after": {
    "totalSize": 67108864,
    "nodeCount": 18234,
    "timestamp": "2024-08-11T10:40:00.000Z", 
    "filename": "after_1754910438274.heapsnapshot"
  },
  "offenders": [
    {
      "type": "Array",
      "countBefore": 1205,
      "countAfter": 2847,
      "retainedSizeBefore": 2457600,
      "retainedSizeAfter": 12582912,
      "deltaSize": 10125312,
      "deltaCount": 1642,
      "growthRate": 4.12,
      "severity": "critical",
      "suspiciousRetainers": [
        "High instance count detected",
        "Potentially retained by EventEmitter"
      ]
    }
  ],
  "summary": {
    "totalGrowthMB": 14.06,
    "suspiciousGrowth": true,
    "likelyLeakSource": "Array",
    "confidence": 0.9,
    "recommendations": [
      "Immediate investigation required - critical memory growth detected",
      "Focus on: Array",
      "Check for growing arrays or lists that are not being cleared",
      "Review event listeners and callback functions for proper cleanup"
    ]
  }
}
```

## 📊 Report Generation

### Report Formats

#### 1. JSON Analysis Report
Complete machine-readable analysis with all data points.

#### 2. Human-Readable Summary
```
MEMORY LEAK DETECTION REPORT
============================

Container: api-service-pod-abc123  
Image: my-app:v1.2.3
Analysis Time: 2024-08-11T10:45:00.000Z
Delay Period: 10 minutes

HEAP SNAPSHOTS
--------------
Before: before_1754910432185.heapsnapshot (50.0 MB)
After:  after_1754910438274.heapsnapshot (64.1 MB)

ANALYSIS RESULTS
----------------
Total Growth: 14.06 MB
Suspicious Growth: YES
Likely Source: Array

STATUS
------
⚠️  POTENTIAL MEMORY LEAK DETECTED

TOP OFFENDERS
-------------
1. Array: +9.66 MB (1642 objects)
2. String: +2.1 MB (524 objects)  
3. Object: +1.8 MB (312 objects)
```

#### 3. Jenkins-Compatible XML (Optional)
```xml
<?xml version="1.0"?>
<testsuites>
  <testsuite name="memory-leak-detection" tests="1" failures="1">
    <testcase name="heap-growth-analysis" classname="leak-detector">
      <failure message="Memory leak detected: 14.06 MB growth">
        Critical growth in Array objects: +9.66 MB
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

### Webhook Integration

Send reports to monitoring systems:

```bash
leak-detector run \
  --container-id my-service \
  --webhook https://hooks.slack.com/services/xxx \
  --delay 10
```

Webhook payload:
```json
{
  "type": "memory-leak-detection",
  "container": "my-service",
  "status": "leak-detected",
  "growthMB": 14.06,
  "confidence": 0.9,
  "severity": "critical", 
  "timestamp": "2024-08-11T10:45:00.000Z",
  "reportUrl": "https://jenkins.company.com/job/leak-detection/123/artifact/reports/"
}
```

## 🧪 Testing and Validation

### Built-in Test Scenarios

The system includes several test scenarios for validation:

```bash
# Test normal workload (should not detect leaks)
leak-detector test --scenario basic

# Test memory leak simulation (should detect leaks)  
leak-detector test --scenario leak

# Test closure-based leaks
leak-detector test --scenario closure

# Test cleanup effectiveness
leak-detector test --scenario cleanup
```

### Custom Test Integration

```javascript
import { MemoryLeakSimulator } from 'zupee-memwatch';

const simulator = new MemoryLeakSimulator();

// Simulate array leak
simulator.startArrayLeak(1000); // 1000 items/second

// Run for some time...
await new Promise(resolve => setTimeout(resolve, 30000));

// Check stats
console.log(simulator.getLeakStats());

// Cleanup
simulator.clearLeaks();
```

### Integration Testing

For comprehensive testing in CI/CD:

```bash
# Run all test scenarios
leak-detector test

# Test specific functionality
leak-detector snapshot --output ./test.heapsnapshot
leak-detector analyze --before ./test1.heapsnapshot --after ./test2.heapsnapshot
```

## ⚡ Performance Considerations

### Snapshot Size
- Heap snapshots can be **50-500MB** for typical applications
- Plan storage accordingly in CI/CD environments
- Consider cleanup policies for old snapshots

### Memory Impact
- Taking snapshots temporarily **blocks the event loop**
- Modern V8 engines optimize this to ~100-500ms
- Test in staging with your traffic patterns first

### Analysis Time
- Parsing large snapshots can take **30-120 seconds**
- Run analysis on separate machines if possible
- Consider parallel analysis for multiple services

### Resource Requirements

| Component | CPU | Memory | Disk | Network |
|-----------|-----|--------|------|---------|
| Snapshot Creation | Low | Medium | High | Low |
| Analysis Engine | High | High | Medium | Low |
| Container Replacement | Low | Low | Low | Medium |
| Traffic Management | Low | Low | Low | High |

## 🛡️ Security and Best Practices

### Security Considerations

1. **Snapshot Content**: Heap snapshots may contain sensitive data (tokens, passwords)
2. **Access Control**: Restrict access to snapshot files and reports
3. **Transmission**: Use HTTPS for webhooks and report uploads
4. **Retention**: Implement data retention policies for snapshots

### Best Practices

#### For CI/CD Integration
- Run during low-traffic periods
- Use dedicated test environments when possible
- Set appropriate timeouts (30+ minutes for full flow)
- Monitor replacement container resource usage

#### For Production Use
- Start with conservative thresholds (50MB+)
- Test traffic draining mechanisms thoroughly
- Have rollback procedures ready
- Monitor service health during testing

#### For Analysis
- Focus on top 3-5 offenders initially
- Correlate with application logs and metrics
- Track trends over time, not just single runs
- Validate findings with developers

### Troubleshooting

#### Common Issues

**"Container not found"**
```bash
# Verify container exists and is accessible
docker ps | grep my-service
kubectl get pods -n namespace | grep my-pod
```

**"Permission denied"**
```bash
# Check Docker permissions
docker exec my-container echo "test"

# Check Kubernetes permissions  
kubectl auth can-i create pods
kubectl auth can-i exec pods
```

**"Snapshot timeout"**
```bash
# Check available memory
docker exec my-container free -h

# Monitor during snapshot
docker stats my-container
```

**"Analysis failed"**
```bash
# Verify snapshot format
file snapshot.heapsnapshot
head -c 100 snapshot.heapsnapshot

# Check available disk space
df -h
```

#### Debug Mode

Enable verbose logging:
```bash
export DEBUG=leak-detector:*
leak-detector run --container-id my-service --delay 5
```

#### Manual Recovery

If containers are left in inconsistent state:
```bash
# Docker cleanup
docker ps | grep "leak-detector-replacement" | awk '{print $1}' | xargs docker stop
docker ps -a | grep "leak-detector-replacement" | awk '{print $1}' | xargs docker rm

# Kubernetes cleanup  
kubectl get pods -l leak-detector=replacement
kubectl delete pods -l leak-detector=replacement
kubectl patch pods my-pod --type='json' -p='[{"op": "remove", "path": "/metadata/annotations/leak-detector~1drain"}]'
```

## 🔗 Integration Examples

See [JENKINS_INTEGRATION.md](./JENKINS_INTEGRATION.md) for comprehensive Jenkins pipeline examples.

## 📚 API Reference

For programmatic usage:

```typescript
import { 
  LeakDetectionController, 
  InContainerSnapshotTrigger,
  HeapSnapshotAnalyzer 
} from 'zupee-memwatch';

// External orchestration
const controller = new LeakDetectionController({
  containerId: 'my-service',
  delay: 10,
  replaceStrategy: 'docker'
});

const exitCode = await controller.run();

// In-container snapshot
const trigger = new InContainerSnapshotTrigger();
await trigger.takeSnapshot('./my-snapshot.heapsnapshot');

// Analysis only
const analyzer = new HeapSnapshotAnalyzer({ threshold: 10485760 });
const analysis = await analyzer.compare('./before.heapsnapshot', './after.heapsnapshot');
```

This comprehensive system provides production-ready memory leak detection with zero downtime and actionable insights for Node.js applications.
