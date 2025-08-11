# Jenkins Integration Guide for Automated Heap Snapshot Leak Detection

This guide demonstrates how to integrate the automated heap snapshot leak detection system into your Jenkins CI/CD pipelines.

## 📋 Prerequisites

1. **Jenkins Setup**:
   - Jenkins 2.400+ with Pipeline plugin
   - Docker or Kubernetes plugin (depending on your strategy)
   - Node.js 18+ available on build agents

2. **Permissions**:
   - Docker: Jenkins user can run Docker commands
   - Kubernetes: Jenkins service account has pod/deployment permissions

3. **Network Access**:
   - Jenkins agents can access your container orchestration platform
   - Target services are accessible for health checks

## 🚀 Quick Start

### 1. Install CLI Tool

Add to your Dockerfile or build environment:

```dockerfile
RUN npm install -g zupee-memwatch
```

Or in your pipeline:

```groovy
sh 'npm install -g zupee-memwatch'
```

### 2. Basic Pipeline Example

```groovy
pipeline {
    agent any
    
    parameters {
        string(name: 'CONTAINER_ID', defaultValue: 'my-service', description: 'Container ID or pod name')
        choice(name: 'STRATEGY', choices: ['docker', 'k8s'], description: 'Replacement strategy')
        string(name: 'DELAY_MINUTES', defaultValue: '10', description: 'Minutes between snapshots')
    }
    
    environment {
        LEAK_REPORTS_DIR = "${WORKSPACE}/leak-reports"
        WEBHOOK_URL = "${env.MONITORING_WEBHOOK_URL}"
    }
    
    stages {
        stage('Prepare') {
            steps {
                sh 'mkdir -p ${LEAK_REPORTS_DIR}'
                echo "Starting leak detection for ${params.CONTAINER_ID}"
            }
        }
        
        stage('Memory Leak Detection') {
            steps {
                script {
                    def exitCode = sh(
                        script: """
                            leak-detector run \\
                                --container-id ${params.CONTAINER_ID} \\
                                --delay ${params.DELAY_MINUTES} \\
                                --output-dir ${LEAK_REPORTS_DIR} \\
                                --replace-strategy ${params.STRATEGY} \\
                                --webhook ${WEBHOOK_URL} \\
                                --analysis-threshold 10485760
                        """,
                        returnStatus: true
                    )
                    
                    if (exitCode == 1) {
                        currentBuild.result = 'UNSTABLE'
                        error('Memory leak detected!')
                    } else if (exitCode > 1) {
                        currentBuild.result = 'FAILURE'
                        error('Leak detection failed with operational error')
                    }
                }
            }
        }
    }
    
    post {
        always {
            // Archive leak detection reports
            archiveArtifacts artifacts: 'leak-reports/**/*', fingerprint: true, allowEmptyArchive: true
            
            // Publish results
            publishHTML([
                allowMissing: false,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'leak-reports',
                reportFiles: '*.html',
                reportName: 'Memory Leak Report'
            ])
        }
        
        unstable {
            // Send notification for memory leaks
            slackSend(
                channel: '#alerts',
                color: 'warning',
                message: "⚠️ Memory leak detected in ${params.CONTAINER_ID}. Check ${BUILD_URL} for details."
            )
        }
        
        failure {
            slackSend(
                channel: '#alerts',
                color: 'danger',
                message: "❌ Leak detection failed for ${params.CONTAINER_ID}. Check ${BUILD_URL} for details."
            )
        }
        
        success {
            echo "✅ No memory leaks detected in ${params.CONTAINER_ID}"
        }
    }
}
```

## 🐳 Docker Strategy Examples

### Docker Compose Environment

```groovy
pipeline {
    agent any
    
    stages {
        stage('Leak Detection - Docker Compose') {
            steps {
                script {
                    // Get running container ID
                    def containerId = sh(
                        script: "docker-compose ps -q my-service",
                        returnStdout: true
                    ).trim()
                    
                    // Run leak detection
                    sh """
                        leak-detector run \\
                            --container-id ${containerId} \\
                            --delay 5 \\
                            --replace-strategy docker \\
                            --output-dir ./reports
                    """
                }
            }
        }
    }
}
```

### Docker Swarm

```groovy
stage('Leak Detection - Docker Swarm') {
    steps {
        script {
            // Get service task container
            def containerId = sh(
                script: """
                    docker service ps my-service --format '{{.ID}}' \\
                        --filter 'desired-state=running' | head -1
                """,
                returnStdout: true
            ).trim()
            
            sh """
                leak-detector run \\
                    --container-id ${containerId} \\
                    --delay 15 \\
                    --replace-strategy docker \\
                    --analysis-threshold 20971520
            """
        }
    }
}
```

## ☸️ Kubernetes Strategy Examples

### Basic Kubernetes

```groovy
pipeline {
    agent any
    
    environment {
        KUBECONFIG = credentials('k8s-config')
        NAMESPACE = 'production'
    }
    
    stages {
        stage('Leak Detection - Kubernetes') {
            steps {
                sh """
                    leak-detector run \\
                        --container-id my-service-pod \\
                        --delay 10 \\
                        --replace-strategy k8s \\
                        --namespace ${NAMESPACE} \\
                        --output-dir ./k8s-reports
                """
            }
        }
    }
}
```

### Kubernetes with Helm

```groovy
stage('Leak Detection - Helm Deployment') {
    steps {
        script {
            // Get pod name from Helm release
            def podName = sh(
                script: """
                    kubectl get pods -l app.kubernetes.io/instance=my-release \\
                        -o jsonpath='{.items[0].metadata.name}' \\
                        -n ${NAMESPACE}
                """,
                returnStdout: true
            ).trim()
            
            sh """
                leak-detector run \\
                    --container-id ${podName} \\
                    --delay 12 \\
                    --replace-strategy k8s \\
                    --namespace ${NAMESPACE}
            """
        }
    }
}
```

## 📊 Advanced Pipeline Features

### Multi-Service Testing

```groovy
pipeline {
    agent any
    
    parameters {
        string(name: 'SERVICES', defaultValue: 'api,worker,cache', description: 'Comma-separated service list')
    }
    
    stages {
        stage('Multi-Service Leak Detection') {
            steps {
                script {
                    def services = params.SERVICES.split(',')
                    def jobs = [:]
                    
                    services.each { service ->
                        jobs[service] = {
                            sh """
                                leak-detector run \\
                                    --container-id ${service.trim()} \\
                                    --delay 8 \\
                                    --output-dir ./reports/${service.trim()} \\
                                    --replace-strategy k8s
                            """
                        }
                    }
                    
                    parallel jobs
                }
            }
        }
    }
}
```

### Conditional Execution

```groovy
stage('Conditional Leak Detection') {
    when {
        anyOf {
            branch 'main'
            changeRequest target: 'main'
            triggeredBy 'TimerTrigger'
        }
    }
    steps {
        sh """
            leak-detector run \\
                --container-id \${JOB_NAME}-\${BUILD_NUMBER} \\
                --delay 10 \\
                --replace-strategy docker
        """
    }
}
```

### Custom Analysis Thresholds

```groovy
stage('Tiered Analysis') {
    steps {
        script {
            // Critical services get stricter thresholds
            def threshold = env.SERVICE_TIER == 'critical' ? '5242880' : '10485760' // 5MB vs 10MB
            
            sh """
                leak-detector run \\
                    --container-id ${CONTAINER_ID} \\
                    --delay ${DELAY_MINUTES} \\
                    --analysis-threshold ${threshold} \\
                    --webhook ${WEBHOOK_URL}
            """
        }
    }
}
```

## 🔧 Configuration Management

### Environment-Specific Configs

Create `leak-detection-config.json`:

```json
{
  "staging": {
    "delay": 5,
    "threshold": "20971520",
    "webhook": "https://hooks.slack.com/staging"
  },
  "production": {
    "delay": 15,
    "threshold": "5242880",
    "webhook": "https://hooks.slack.com/production"
  }
}
```

Use in pipeline:

```groovy
stage('Environment-Specific Detection') {
    steps {
        script {
            def config = readJSON file: 'leak-detection-config.json'
            def envConfig = config[env.ENVIRONMENT]
            
            sh """
                leak-detector run \\
                    --container-id ${CONTAINER_ID} \\
                    --delay ${envConfig.delay} \\
                    --analysis-threshold ${envConfig.threshold} \\
                    --webhook ${envConfig.webhook}
            """
        }
    }
}
```

## 📈 Reporting and Notifications

### Slack Integration

```groovy
post {
    unstable {
        script {
            def reportFiles = sh(
                script: "ls leak-reports/*.json 2>/dev/null || echo ''",
                returnStdout: true
            ).trim()
            
            if (reportFiles) {
                def report = readJSON file: reportFiles.split('\n')[0]
                
                slackSend(
                    channel: '#memory-alerts',
                    color: 'warning',
                    message: """
                        ⚠️ Memory Leak Alert
                        Service: ${report.metadata.containerId}
                        Growth: ${report.summary.totalGrowthMB}MB
                        Confidence: ${(report.summary.confidence * 100).toFixed(1)}%
                        Report: ${BUILD_URL}artifact/leak-reports/
                    """
                )
            }
        }
    }
}
```

### Email Reports

```groovy
post {
    always {
        script {
            emailext(
                subject: "Memory Leak Detection - ${params.CONTAINER_ID}",
                body: '''
                    <h2>Memory Leak Detection Report</h2>
                    <p><strong>Container:</strong> ${CONTAINER_ID}</p>
                    <p><strong>Status:</strong> ${BUILD_RESULT}</p>
                    <p><strong>Reports:</strong> <a href="${BUILD_URL}artifact/leak-reports/">View Reports</a></p>
                ''',
                recipientProviders: [developers(), requestor()],
                attachmentsPattern: 'leak-reports/*.json'
            )
        }
    }
}
```

## 🛡️ Security and Permissions

### Jenkins Credentials

```groovy
environment {
    DOCKER_CREDS = credentials('docker-registry')
    K8S_TOKEN = credentials('k8s-service-account-token')
    WEBHOOK_SECRET = credentials('monitoring-webhook-secret')
}
```

### Kubernetes RBAC

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: default
  name: leak-detector
rules:
- apiGroups: [""]
  resources: ["pods", "pods/exec"]
  verbs: ["get", "list", "create", "delete", "patch"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets"]
  verbs: ["get", "list", "patch", "update"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: leak-detector-binding
  namespace: default
subjects:
- kind: ServiceAccount
  name: jenkins
  namespace: default
roleRef:
  kind: Role
  name: leak-detector
  apiGroup: rbac.authorization.k8s.io
```

## 🔍 Troubleshooting

### Common Issues

1. **Permission Denied**:
   ```bash
   # Check Docker permissions
   docker ps
   # Check Kubernetes access
   kubectl auth can-i create pods
   ```

2. **Container Not Found**:
   ```bash
   # Verify container ID
   docker ps | grep my-service
   kubectl get pods -n namespace
   ```

3. **Snapshot Timeout**:
   ```groovy
   timeout(time: 30, unit: 'MINUTES') {
       sh 'leak-detector run --delay 5 ...'
   }
   ```

### Debug Mode

Enable verbose logging:

```bash
leak-detector run --container-id my-service --delay 5 --verbose
```

### Manual Cleanup

If containers are left running:

```bash
# Docker
docker ps | grep "leak-detector-replacement" | awk '{print $1}' | xargs docker stop
docker ps -a | grep "leak-detector-replacement" | awk '{print $1}' | xargs docker rm

# Kubernetes
kubectl get pods -l leak-detector=replacement
kubectl delete pods -l leak-detector=replacement
```

## 📚 Best Practices

1. **Timing**: Run leak detection during low-traffic periods
2. **Thresholds**: Start with conservative thresholds and adjust based on your service patterns
3. **Frequency**: Don't run too frequently - memory leaks develop over time
4. **Cleanup**: Always enable cleanup to avoid resource waste
5. **Monitoring**: Set up proper alerting and dashboard integration
6. **Documentation**: Document your thresholds and expected memory patterns

## 🎯 Integration Examples

### GitHub Actions Integration

```yaml
name: Memory Leak Detection
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  leak-detection:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install leak detector
        run: npm install -g zupee-memwatch
      
      - name: Run leak detection
        run: |
          leak-detector run \
            --container-id ${{ vars.CONTAINER_ID }} \
            --delay 10 \
            --replace-strategy docker \
            --webhook ${{ secrets.WEBHOOK_URL }}
```

### GitLab CI Integration

```yaml
memory-leak-detection:
  stage: test
  image: node:18
  script:
    - npm install -g zupee-memwatch
    - |
      leak-detector run \
        --container-id ${CI_PROJECT_NAME} \
        --delay 8 \
        --replace-strategy k8s \
        --namespace ${KUBE_NAMESPACE}
  artifacts:
    reports:
      junit: leak-reports/*.xml
    paths:
      - leak-reports/
  only:
    - schedules
    - main
```

This comprehensive integration guide should help you successfully implement automated memory leak detection in your Jenkins pipelines!
