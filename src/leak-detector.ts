import { MemWatchAgent } from './index.js';
import v8 from 'v8';
import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Configuration for the automated leak detector
 */
export interface LeakDetectorConfig {
  /** Target container ID or pod name */
  containerId: string;
  /** Minutes between before and after snapshots */
  delay: number;
  /** Output directory for snapshots and reports */
  outputDir?: string;
  /** Container image to use for replacement */
  image?: string;
  /** Replacement strategy: docker or k8s */
  replaceStrategy?: 'docker' | 'k8s';
  /** Keep replacement container after test */
  cleanup?: boolean;
  /** Bytes or percentage increase considered a leak */
  analysisThreshold?: number;
  /** Webhook URL to POST final report */
  webhook?: string;
  /** Namespace for Kubernetes operations */
  namespace?: string;
  /** Grace period for draining traffic (seconds) */
  drainGracePeriod?: number;
}

/**
 * Container metadata discovered from target
 */
interface ContainerMetadata {
  id: string;
  image: string;
  env: Record<string, string>;
  ports: string[];
  labels?: Record<string, string>;
  name?: string;
}

/**
 * Snapshot analysis result
 */
export interface SnapshotAnalysis {
  before: HeapSnapshotSummary;
  after: HeapSnapshotSummary;
  offenders: LeakOffender[];
  summary: {
    totalGrowthMB: number;
    suspiciousGrowth: boolean;
    likelyLeakSource?: string;
  };
  metadata: {
    containerId: string;
    image: string;
    delayMinutes: number;
    timestamp: string;
  };
}

/**
 * Heap snapshot summary
 */
interface HeapSnapshotSummary {
  totalSize: number;
  nodeCount: number;
  timestamp: string;
  filename: string;
}

/**
 * Memory leak offender from analysis
 */
export interface LeakOffender {
  type: string;
  countBefore: number;
  countAfter: number;
  retainedSizeBefore: number;
  retainedSizeAfter: number;
  deltaSize: number;
  deltaCount: number;
  suspiciousRetainers?: string[];
}

/**
 * In-container snapshot trigger with maintenance mode
 */
export class InContainerSnapshotTrigger {
  private maintenanceMode = false;
  private readonly gracePeriodMs = 5000; // 5 seconds for in-flight requests
  private onBeforeSnapshot?: () => Promise<void>;
  private onAfterSnapshot?: () => Promise<void>;

  /**
   * Set hooks for before/after snapshot events
   */
  setHooks(hooks: {
    onBeforeSnapshot?: () => Promise<void>;
    onAfterSnapshot?: () => Promise<void>;
  }): void {
    this.onBeforeSnapshot = hooks.onBeforeSnapshot;
    this.onAfterSnapshot = hooks.onAfterSnapshot;
  }

  /**
   * Take a heap snapshot with maintenance mode
   */
  async takeSnapshot(outputPath: string): Promise<boolean> {
    try {
      console.log('[LeakDetector] Starting snapshot process with maintenance mode');
      
      // Enter maintenance mode
      this.maintenanceMode = true;
      console.log('[LeakDetector] Entered maintenance mode - blocking new requests');

      // Execute before hook
      if (this.onBeforeSnapshot) {
        await this.onBeforeSnapshot();
      }

      // Grace period for in-flight requests
      await new Promise(resolve => setTimeout(resolve, this.gracePeriodMs));

      // Take heap snapshot
      console.log('[LeakDetector] Taking heap snapshot...');
      const snapshot = v8.getHeapSnapshot();
      const writeStream = fs.createWriteStream(outputPath);
      
      snapshot.pipe(writeStream);

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => {
          console.log(`[LeakDetector] Snapshot saved: ${outputPath}`);
          resolve();
        });
        writeStream.on('error', reject);
      });

      // Execute after hook
      if (this.onAfterSnapshot) {
        await this.onAfterSnapshot();
      }

      // Exit maintenance mode
      this.maintenanceMode = false;
      console.log('[LeakDetector] Exited maintenance mode - accepting requests');

      return true;
    } catch (error) {
      this.maintenanceMode = false;
      console.error('[LeakDetector] Error taking snapshot:', error);
      return false;
    }
  }

  /**
   * Check if in maintenance mode
   */
  isInMaintenanceMode(): boolean {
    return this.maintenanceMode;
  }

  /**
   * Express middleware to handle maintenance mode
   */
  maintenanceMiddleware() {
    return (req: any, res: any, next: any) => {
      if (this.maintenanceMode) {
        res.status(503).json({
          error: 'Service temporarily unavailable',
          reason: 'Taking memory snapshot',
          retryAfter: '10'
        });
        return;
      }
      next();
    };
  }
}

/**
 * External controller for orchestrating leak detection
 */
export class LeakDetectionController {
  private config: Required<LeakDetectorConfig>;
  private replacementId?: string;

  constructor(config: LeakDetectorConfig) {
    this.config = {
      outputDir: '/tmp/leak-reports',
      image: '',
      replaceStrategy: 'docker',
      cleanup: true,
      analysisThreshold: 10 * 1024 * 1024, // 10MB
      webhook: '',
      namespace: 'default',
      drainGracePeriod: 30,
      ...config
    };
  }

  /**
   * Run the complete leak detection flow
   */
  async run(): Promise<number> {
    try {
      console.log('[LeakDetector] Starting automated leak detection');
      console.log(`[LeakDetector] Target: ${this.config.containerId}`);
      console.log(`[LeakDetector] Strategy: ${this.config.replaceStrategy}`);
      console.log(`[LeakDetector] Delay: ${this.config.delay} minutes`);

      // Ensure output directory exists
      this.ensureOutputDir();

      // Step 1: Discover target metadata
      const metadata = await this.discoverTargetMetadata();
      console.log(`[LeakDetector] Discovered target: ${metadata.image}`);

      // Step 2: Start replacement container
      this.replacementId = await this.startReplacementContainer(metadata);
      console.log(`[LeakDetector] Started replacement: ${this.replacementId}`);

      // Step 3: Wait for replacement readiness
      await this.waitForReplacementReadiness();
      console.log('[LeakDetector] Replacement is ready');

      // Step 4: Drain target
      await this.drainTarget();
      console.log('[LeakDetector] Target drained from traffic');

      // Step 5: Take BEFORE snapshot
      const beforePath = await this.takeSnapshot('before');
      console.log(`[LeakDetector] Before snapshot: ${beforePath}`);

      // Step 6: Wait delay period
      console.log(`[LeakDetector] Waiting ${this.config.delay} minutes...`);
      await new Promise(resolve => setTimeout(resolve, this.config.delay * 60 * 1000));

      // Step 7: Take AFTER snapshot
      const afterPath = await this.takeSnapshot('after');
      console.log(`[LeakDetector] After snapshot: ${afterPath}`);

      // Step 8: Restore target to rotation
      await this.restoreTarget();
      console.log('[LeakDetector] Target restored to traffic');

      // Step 9: Analyze snapshots
      const analysis = await this.analyzeSnapshots(beforePath, afterPath, metadata);
      
      // Step 10: Generate report
      const reportPath = await this.generateReport(analysis);
      console.log(`[LeakDetector] Report generated: ${reportPath}`);

      // Send webhook if configured
      if (this.config.webhook) {
        await this.sendWebhook(analysis);
      }

      // Cleanup
      if (this.config.cleanup && this.replacementId) {
        await this.cleanupReplacement();
      }

      // Return exit code
      const exitCode = analysis.summary.suspiciousGrowth ? 1 : 0;
      console.log(`[LeakDetector] Analysis complete. Exit code: ${exitCode}`);
      
      return exitCode;

    } catch (error) {
      console.error('[LeakDetector] Error in leak detection:', error);
      
      // Cleanup on error
      if (this.config.cleanup && this.replacementId) {
        try {
          await this.cleanupReplacement();
        } catch (cleanupError) {
          console.error('[LeakDetector] Error during cleanup:', cleanupError);
        }
      }
      
      return 2; // Operational error
    }
  }

  /**
   * Discover metadata about the target container
   */
  private async discoverTargetMetadata(): Promise<ContainerMetadata> {
    if (this.config.replaceStrategy === 'docker') {
      const { stdout } = await execAsync(`docker inspect ${this.config.containerId}`);
      const inspection = JSON.parse(stdout)[0];
      
      return {
        id: inspection.Id,
        image: inspection.Config.Image,
        env: inspection.Config.Env.reduce((acc: Record<string, string>, envVar: string) => {
          const [key, value] = envVar.split('=');
          acc[key] = value;
          return acc;
        }, {}),
        ports: Object.keys(inspection.Config.ExposedPorts || {}),
        labels: inspection.Config.Labels || {}
      };
    } else {
      // Kubernetes
      const { stdout } = await execAsync(
        `kubectl get pod ${this.config.containerId} -n ${this.config.namespace} -o json`
      );
      const pod = JSON.parse(stdout);
      const container = pod.spec.containers[0];
      
      return {
        id: pod.metadata.name,
        image: container.image,
        env: container.env?.reduce((acc: Record<string, string>, envVar: any) => {
          acc[envVar.name] = envVar.value;
          return acc;
        }, {}) || {},
        ports: container.ports?.map((p: any) => `${p.containerPort}/${p.protocol}`) || [],
        labels: pod.metadata.labels || {},
        name: pod.metadata.name
      };
    }
  }

  /**
   * Start replacement container
   */
  private async startReplacementContainer(metadata: ContainerMetadata): Promise<string> {
    const image = this.config.image || metadata.image;
    const timestamp = Date.now();

    if (this.config.replaceStrategy === 'docker') {
      const envArgs = Object.entries(metadata.env)
        .map(([key, value]) => `-e ${key}="${value}"`)
        .join(' ');
      
      const { stdout } = await execAsync(
        `docker run -d --name leak-detector-replacement-${timestamp} ${envArgs} ${image}`
      );
      
      return stdout.trim();
    } else {
      // Kubernetes - scale up deployment or create pod
      const { stdout } = await execAsync(
        `kubectl get pod ${metadata.id} -n ${this.config.namespace} -o jsonpath='{.metadata.ownerReferences[0].name}'`
      );
      const deploymentName = stdout.trim();
      
      if (deploymentName) {
        // Scale up deployment
        await execAsync(
          `kubectl scale deployment ${deploymentName} -n ${this.config.namespace} --replicas=2`
        );
        
        // Wait for new pod and get its name
        const { stdout: podName } = await execAsync(
          `kubectl get pods -n ${this.config.namespace} -l app=${deploymentName} --field-selector=status.phase=Running -o jsonpath='{.items[?(@.metadata.name!="${metadata.id}")].metadata.name}' | head -1`
        );
        
        return podName.trim();
      } else {
        throw new Error('Unable to determine deployment for scaling');
      }
    }
  }

  /**
   * Wait for replacement container to be ready
   */
  private async waitForReplacementReadiness(): Promise<void> {
    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        if (this.config.replaceStrategy === 'docker') {
          const { stdout } = await execAsync(`docker inspect ${this.replacementId} --format='{{.State.Status}}'`);
          if (stdout.trim() === 'running') {
            // Additional health check could go here
            return;
          }
        } else {
          const { stdout } = await execAsync(
            `kubectl get pod ${this.replacementId} -n ${this.config.namespace} -o jsonpath='{.status.phase}'`
          );
          if (stdout.trim() === 'Running') {
            return;
          }
        }
      } catch (error) {
        // Continue waiting
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }

    throw new Error('Replacement container failed to become ready');
  }

  /**
   * Drain target container from traffic
   */
  private async drainTarget(): Promise<void> {
    if (this.config.replaceStrategy === 'docker') {
      // For Docker, this would typically involve updating a proxy configuration
      // This is a placeholder - actual implementation depends on your setup
      console.log('[LeakDetector] Docker traffic draining requires proxy configuration');
      console.log('[LeakDetector] Please ensure your load balancer/proxy is configured to remove the target');
    } else {
      // Kubernetes - remove pod from service endpoints
      await execAsync(
        `kubectl patch pod ${this.config.containerId} -n ${this.config.namespace} ` +
        `-p '{"metadata":{"annotations":{"leak-detector/drain":"true"}}}'`
      );
      
      // Set pod readiness to false
      await execAsync(
        `kubectl patch pod ${this.config.containerId} -n ${this.config.namespace} ` +
        `--type='json' -p='[{"op": "replace", "path": "/status/conditions/1/status", "value": "False"}]'`
      );
    }

    // Grace period for in-flight requests
    await new Promise(resolve => setTimeout(resolve, this.config.drainGracePeriod * 1000));
  }

  /**
   * Take snapshot from target container
   */
  private async takeSnapshot(phase: 'before' | 'after'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${phase}_${timestamp}.heapsnapshot`;
    const containerPath = `/tmp/${filename}`;
    const hostPath = path.join(this.config.outputDir, filename);

    // Execute snapshot command in container
    const snapshotCmd = `node -e "
      const trigger = require('./leak-detector').InContainerSnapshotTrigger;
      const instance = new trigger();
      instance.takeSnapshot('${containerPath}').then(success => {
        process.exit(success ? 0 : 1);
      }).catch(() => process.exit(1));
    "`;

    if (this.config.replaceStrategy === 'docker') {
      await execAsync(`docker exec ${this.config.containerId} ${snapshotCmd}`);
      await execAsync(`docker cp ${this.config.containerId}:${containerPath} ${hostPath}`);
    } else {
      await execAsync(
        `kubectl exec ${this.config.containerId} -n ${this.config.namespace} -- ${snapshotCmd}`
      );
      await execAsync(
        `kubectl cp ${this.config.namespace}/${this.config.containerId}:${containerPath} ${hostPath}`
      );
    }

    return hostPath;
  }

  /**
   * Restore target container to traffic
   */
  private async restoreTarget(): Promise<void> {
    if (this.config.replaceStrategy === 'docker') {
      console.log('[LeakDetector] Docker traffic restoration requires proxy configuration');
    } else {
      // Remove drain annotation and restore readiness
      await execAsync(
        `kubectl patch pod ${this.config.containerId} -n ${this.config.namespace} ` +
        `--type='json' -p='[{"op": "remove", "path": "/metadata/annotations/leak-detector~1drain"}]'`
      );
      
      await execAsync(
        `kubectl patch pod ${this.config.containerId} -n ${this.config.namespace} ` +
        `--type='json' -p='[{"op": "replace", "path": "/status/conditions/1/status", "value": "True"}]'`
      );
    }
  }

  /**
   * Analyze heap snapshots and find leaks
   */
  private async analyzeSnapshots(
    beforePath: string, 
    afterPath: string, 
    metadata: ContainerMetadata
  ): Promise<SnapshotAnalysis> {
    // This is a simplified analysis - in a real implementation,
    // you would parse the .heapsnapshot JSON format and do detailed analysis
    const beforeStats = fs.statSync(beforePath);
    const afterStats = fs.statSync(afterPath);
    
    const growthMB = (afterStats.size - beforeStats.size) / (1024 * 1024);
    const suspiciousGrowth = Math.abs(growthMB) > (this.config.analysisThreshold / (1024 * 1024));

    // Mock analysis for now - real implementation would parse heap snapshot JSON
    const analysis: SnapshotAnalysis = {
      before: {
        totalSize: beforeStats.size,
        nodeCount: 0,
        timestamp: beforeStats.mtime.toISOString(),
        filename: path.basename(beforePath)
      },
      after: {
        totalSize: afterStats.size,
        nodeCount: 0,
        timestamp: afterStats.mtime.toISOString(),
        filename: path.basename(afterPath)
      },
      offenders: [],
      summary: {
        totalGrowthMB: growthMB,
        suspiciousGrowth,
        likelyLeakSource: suspiciousGrowth ? 'Unknown - detailed analysis required' : undefined
      },
      metadata: {
        containerId: this.config.containerId,
        image: metadata.image,
        delayMinutes: this.config.delay,
        timestamp: new Date().toISOString()
      }
    };

    return analysis;
  }

  /**
   * Generate JSON and human-readable reports
   */
  private async generateReport(analysis: SnapshotAnalysis): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(this.config.outputDir, `leak-report-${timestamp}.json`);
    
    // Write JSON report
    fs.writeFileSync(reportPath, JSON.stringify(analysis, null, 2));
    
    // Write human-readable summary
    const summaryPath = path.join(this.config.outputDir, `leak-summary-${timestamp}.txt`);
    const summary = this.formatHumanReadableReport(analysis);
    fs.writeFileSync(summaryPath, summary);
    
    console.log('\n' + summary);
    
    return reportPath;
  }

  /**
   * Format human-readable report
   */
  private formatHumanReadableReport(analysis: SnapshotAnalysis): string {
    const { summary, metadata, before, after } = analysis;
    
    return `
MEMORY LEAK DETECTION REPORT
============================

Container: ${metadata.containerId}
Image: ${metadata.image}
Analysis Time: ${metadata.timestamp}
Delay Period: ${metadata.delayMinutes} minutes

HEAP SNAPSHOTS
--------------
Before: ${before.filename} (${(before.totalSize / (1024 * 1024)).toFixed(2)} MB)
After:  ${after.filename} (${(after.totalSize / (1024 * 1024)).toFixed(2)} MB)

ANALYSIS RESULTS
----------------
Total Growth: ${summary.totalGrowthMB.toFixed(2)} MB
Suspicious Growth: ${summary.suspiciousGrowth ? 'YES' : 'NO'}
${summary.likelyLeakSource ? `Likely Source: ${summary.likelyLeakSource}` : ''}

STATUS
------
${summary.suspiciousGrowth ? '⚠️  POTENTIAL MEMORY LEAK DETECTED' : '✅ NO SIGNIFICANT MEMORY GROWTH'}

${analysis.offenders.length > 0 ? `
TOP OFFENDERS
-------------
${analysis.offenders.slice(0, 5).map(o => 
  `${o.type}: +${(o.deltaSize / (1024 * 1024)).toFixed(2)} MB (${o.deltaCount} objects)`
).join('\n')}
` : ''}
`;
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(analysis: SnapshotAnalysis): Promise<void> {
    try {
      const response = await fetch(this.config.webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(analysis)
      });
      
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }
      
      console.log('[LeakDetector] Webhook notification sent successfully');
    } catch (error) {
      console.error('[LeakDetector] Failed to send webhook:', error);
    }
  }

  /**
   * Cleanup replacement container
   */
  private async cleanupReplacement(): Promise<void> {
    if (!this.replacementId) return;

    try {
      if (this.config.replaceStrategy === 'docker') {
        await execAsync(`docker stop ${this.replacementId}`);
        await execAsync(`docker rm ${this.replacementId}`);
      } else {
        // Scale down or remove pod
        await execAsync(
          `kubectl delete pod ${this.replacementId} -n ${this.config.namespace}`
        );
      }
      
      console.log(`[LeakDetector] Cleaned up replacement: ${this.replacementId}`);
    } catch (error) {
      console.error('[LeakDetector] Error during cleanup:', error);
    }
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }
}

// Export singleton instances
export const inContainerTrigger = new InContainerSnapshotTrigger();

// CLI command interface
export function createLeakDetector(config: LeakDetectorConfig): LeakDetectionController {
  return new LeakDetectionController(config);
}

// Convenience function for taking manual snapshots
export async function takeSnapshot(outputPath: string): Promise<boolean> {
  return inContainerTrigger.takeSnapshot(outputPath);
}
