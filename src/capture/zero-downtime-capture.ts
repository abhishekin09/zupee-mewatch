import { exec } from 'child_process';
import { promisify } from 'util';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Configuration for zero-downtime snapshot capture
 */
export interface ZeroDowntimeCaptureConfig {
  /** Target container ID or pod name */
  containerId: string;
  /** Minutes between before and after snapshots */
  timeframe: number;
  /** Dashboard WebSocket URL for pushing snapshots */
  dashboardUrl: string;
  /** Container strategy: docker or k8s */
  strategy: 'docker' | 'k8s';
  /** Kubernetes namespace */
  namespace?: string;
  /** Number of replicas to scale to */
  replicaCount?: number;
  /** Service name for identification */
  serviceName: string;
}

/**
 * Snapshot metadata for dashboard
 */
interface SnapshotMetadata {
  id: string;
  serviceName: string;
  containerId: string;
  phase: 'before' | 'after';
  timestamp: string;
  size: number;
  filename: string;
}

/**
 * Zero-downtime snapshot capture with pod scaling
 */
export class ZeroDowntimeSnapshotCapture {
  private config: Required<ZeroDowntimeCaptureConfig>;
  private ws: WebSocket | null = null;
  private deploymentName?: string;
  private originalReplicas?: number;

  constructor(config: ZeroDowntimeCaptureConfig) {
    this.config = {
      namespace: 'default',
      replicaCount: 2,
      ...config
    };
  }

  /**
   * Execute the complete zero-downtime capture process
   */
  async execute(): Promise<void> {
    try {
      console.log(`🚀 Starting zero-downtime capture for ${this.config.containerId}`);
      console.log(`⏱️  Timeframe: ${this.config.timeframe} minutes`);
      console.log(`📡 Dashboard: ${this.config.dashboardUrl}`);
      
      // Step 1: Connect to dashboard
      await this.connectToDashboard();
      
      // Step 2: Discover deployment and scale up
      await this.scaleUpPods();
      
      // Step 3: Take before snapshot
      const beforeSnapshot = await this.takeSnapshot('before');
      
      // Step 4: Push before snapshot to dashboard
      await this.pushSnapshotToDashboard(beforeSnapshot);
      
      // Step 5: Wait timeframe
      console.log(`⏳ Waiting ${this.config.timeframe} minutes for memory activity...`);
      await new Promise(resolve => setTimeout(resolve, this.config.timeframe * 60 * 1000));
      
      // Step 6: Take after snapshot
      const afterSnapshot = await this.takeSnapshot('after');
      
      // Step 7: Push after snapshot to dashboard
      await this.pushSnapshotToDashboard(afterSnapshot);
      
      // Step 8: Notify dashboard that comparison can begin
      await this.notifyComparisonReady(beforeSnapshot.id, afterSnapshot.id);
      
      // Step 9: Scale down to original replicas
      await this.scaleDownPods();
      
      console.log('✅ Zero-downtime capture completed successfully!');
      console.log(`📊 Check dashboard at: ${this.config.dashboardUrl.replace('ws://', 'http://').replace('wss://', 'https://')}`);
      
    } catch (error) {
      console.error('❌ Capture failed:', error);
      
      // Cleanup: restore original replica count
      try {
        await this.scaleDownPods();
      } catch (cleanupError) {
        console.error('❌ Failed to cleanup pods:', cleanupError);
      }
      
      throw error;
    } finally {
      if (this.ws) {
        this.ws.close();
      }
    }
  }

  /**
   * Connect to dashboard WebSocket
   */
  private async connectToDashboard(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to dashboard...');
      
      this.ws = new WebSocket(this.config.dashboardUrl);
      
      this.ws.on('open', () => {
        console.log('✅ Connected to dashboard');
        
        // Register as snapshot capture agent
        this.ws!.send(JSON.stringify({
          type: 'capture-agent-registration',
          serviceName: this.config.serviceName,
          containerId: this.config.containerId,
          timestamp: Date.now()
        }));
        
        resolve();
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ Dashboard connection failed:', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log('📤 Dashboard connection closed');
      });
    });
  }

  /**
   * Scale up pods for zero downtime
   */
  private async scaleUpPods(): Promise<void> {
    if (this.config.strategy === 'k8s') {
      await this.scaleKubernetesPods();
    } else {
      await this.scaleDockerContainers();
    }
  }

  /**
   * Scale down pods to original count
   */
  private async scaleDownPods(): Promise<void> {
    if (!this.deploymentName || this.originalReplicas === undefined) {
      console.log('ℹ️  No scaling changes to revert');
      return;
    }

    try {
      if (this.config.strategy === 'k8s') {
        console.log(`📉 Scaling ${this.deploymentName} back to ${this.originalReplicas} replicas...`);
        
        await execAsync(
          `kubectl scale deployment ${this.deploymentName} -n ${this.config.namespace} --replicas=${this.originalReplicas}`
        );
        
        console.log('✅ Scaled back to original replica count');
      } else {
        // Docker scaling down logic would go here
        console.log('📉 Scaling down Docker containers...');
      }
    } catch (error) {
      console.error('❌ Failed to scale down:', error);
      throw error;
    }
  }

  /**
   * Scale Kubernetes pods
   */
  private async scaleKubernetesPods(): Promise<void> {
    try {
      // Get deployment name from pod
      console.log('🔍 Discovering deployment information...');
      const { stdout: podInfo } = await execAsync(
        `kubectl get pod ${this.config.containerId} -n ${this.config.namespace} -o json`
      );
      
      const pod = JSON.parse(podInfo);
      const ownerRef = pod.metadata.ownerReferences?.find((ref: any) => ref.kind === 'ReplicaSet');
      
      if (!ownerRef) {
        throw new Error('Pod is not managed by a deployment');
      }
      
      // Get ReplicaSet to find Deployment
      const { stdout: rsInfo } = await execAsync(
        `kubectl get replicaset ${ownerRef.name} -n ${this.config.namespace} -o json`
      );
      
      const replicaSet = JSON.parse(rsInfo);
      const deploymentRef = replicaSet.metadata.ownerReferences?.find((ref: any) => ref.kind === 'Deployment');
      
      if (!deploymentRef) {
        throw new Error('ReplicaSet is not managed by a deployment');
      }
      
      this.deploymentName = deploymentRef.name;
      
      // Get current replica count
      const { stdout: deploymentInfo } = await execAsync(
        `kubectl get deployment ${this.deploymentName} -n ${this.config.namespace} -o json`
      );
      
      const deployment = JSON.parse(deploymentInfo);
      this.originalReplicas = deployment.spec.replicas;
      
      console.log(`📈 Current replicas: ${this.originalReplicas}, scaling to: ${this.config.replicaCount}`);
      
      if (this.originalReplicas !== undefined && this.originalReplicas >= this.config.replicaCount) {
        console.log('ℹ️  Already at or above target replica count, no scaling needed');
        return;
      }
      
      // Scale up
      await execAsync(
        `kubectl scale deployment ${this.deploymentName} -n ${this.config.namespace} --replicas=${this.config.replicaCount}`
      );
      
      console.log('⏳ Waiting for new pods to be ready...');
      
      // Wait for pods to be ready
      await execAsync(
        `kubectl wait --for=condition=ready pod -l app=${this.deploymentName} -n ${this.config.namespace} --timeout=120s`
      );
      
      console.log('✅ Pods scaled up and ready');
      
    } catch (error) {
      console.error('❌ Failed to scale Kubernetes pods:', error);
      throw error;
    }
  }

  /**
   * Scale Docker containers
   */
  private async scaleDockerContainers(): Promise<void> {
    try {
      console.log('🐳 Scaling Docker containers...');
      
      // Get container info
      const { stdout: containerInfo } = await execAsync(`docker inspect ${this.config.containerId}`);
      const container = JSON.parse(containerInfo)[0];
      
      const image = container.Config.Image;
      const env = container.Config.Env || [];
      const ports = container.Config.ExposedPorts || {};
      
      // Start additional containers
      const additionalContainers = this.config.replicaCount - 1;
      
      for (let i = 0; i < additionalContainers; i++) {
        const envArgs = env.map((envVar: string) => `-e "${envVar}"`).join(' ');
        const containerName = `${this.config.containerId}-scale-${i + 1}`;
        
        await execAsync(
          `docker run -d --name ${containerName} ${envArgs} ${image}`
        );
        
        console.log(`✅ Started additional container: ${containerName}`);
      }
      
      console.log('✅ Docker containers scaled up');
      
    } catch (error) {
      console.error('❌ Failed to scale Docker containers:', error);
      throw error;
    }
  }

  /**
   * Take heap snapshot from target container
   */
  private async takeSnapshot(phase: 'before' | 'after'): Promise<SnapshotMetadata> {
    try {
      console.log(`📸 Taking ${phase} snapshot...`);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${phase}_${this.config.serviceName}_${timestamp}.heapsnapshot`;
      const containerPath = `/tmp/${filename}`;
      const localPath = path.resolve(`./snapshots/${filename}`);
      
      // Ensure snapshots directory exists
      const snapshotsDir = path.dirname(localPath);
      if (!fs.existsSync(snapshotsDir)) {
        fs.mkdirSync(snapshotsDir, { recursive: true });
      }
      
      // Create a single-line Node.js command
      const snapshotCmd = `node -e "const v8=require('v8');const fs=require('fs');console.log('Taking snapshot...');const s=v8.getHeapSnapshot();const w=fs.createWriteStream('${containerPath}');s.pipe(w);w.on('finish',()=>{console.log('Done');process.exit(0)});w.on('error',(e)=>{console.error(e);process.exit(1)});"`;
      
      if (this.config.strategy === 'k8s') {
        await execAsync(
          `kubectl exec ${this.config.containerId} -n ${this.config.namespace} -- ${snapshotCmd}`
        );
        await execAsync(
          `kubectl cp ${this.config.namespace}/${this.config.containerId}:${containerPath} ${localPath}`
        );
      } else {
        await execAsync(`docker exec ${this.config.containerId} ${snapshotCmd}`);
        await execAsync(`docker cp ${this.config.containerId}:${containerPath} ${localPath}`);
      }
      
      const stats = fs.statSync(localPath);
      const snapshotId = `${phase}_${this.config.serviceName}_${Date.now()}`;
      
      console.log(`✅ ${phase} snapshot captured: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      return {
        id: snapshotId,
        serviceName: this.config.serviceName,
        containerId: this.config.containerId,
        phase,
        timestamp: new Date().toISOString(),
        size: stats.size,
        filename: localPath
      };
      
    } catch (error) {
      console.error(`❌ Failed to take ${phase} snapshot:`, error);
      throw error;
    }
  }

  /**
   * Push snapshot to dashboard via WebSocket
   */
  private async pushSnapshotToDashboard(snapshot: SnapshotMetadata): Promise<void> {
    try {
      console.log(`📤 Pushing ${snapshot.phase} snapshot to dashboard...`);
      
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Dashboard connection not available');
      }
      
      // Read snapshot file
      const snapshotData = fs.readFileSync(snapshot.filename, 'utf8');
      
      // Send snapshot metadata first
      this.ws.send(JSON.stringify({
        type: 'snapshot-metadata',
        snapshot: {
          id: snapshot.id,
          serviceName: snapshot.serviceName,
          containerId: snapshot.containerId,
          phase: snapshot.phase,
          timestamp: snapshot.timestamp,
          size: snapshot.size,
          filename: path.basename(snapshot.filename)
        }
      }));
      
      // Send snapshot data in chunks (WebSocket has size limits)
      const chunkSize = 64 * 1024; // 64KB chunks
      const totalChunks = Math.ceil(snapshotData.length / chunkSize);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, snapshotData.length);
        const chunk = snapshotData.slice(start, end);
        
        this.ws.send(JSON.stringify({
          type: 'snapshot-chunk',
          snapshotId: snapshot.id,
          chunkIndex: i,
          totalChunks,
          data: chunk
        }));
        
        // Small delay to prevent overwhelming WebSocket
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Send completion message
      this.ws.send(JSON.stringify({
        type: 'snapshot-complete',
        snapshotId: snapshot.id
      }));
      
      console.log(`✅ ${snapshot.phase} snapshot pushed to dashboard`);
      
    } catch (error) {
      console.error(`❌ Failed to push ${snapshot.phase} snapshot:`, error);
      throw error;
    }
  }

  /**
   * Notify dashboard that comparison can begin
   */
  private async notifyComparisonReady(beforeId: string, afterId: string): Promise<void> {
    try {
      console.log('🔬 Notifying dashboard that comparison is ready...');
      
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Dashboard connection not available');
      }
      
      this.ws.send(JSON.stringify({
        type: 'comparison-ready',
        serviceName: this.config.serviceName,
        containerId: this.config.containerId,
        beforeSnapshotId: beforeId,
        afterSnapshotId: afterId,
        timeframe: this.config.timeframe,
        timestamp: new Date().toISOString()
      }));
      
      console.log('✅ Dashboard notified - comparison analysis will begin');
      
    } catch (error) {
      console.error('❌ Failed to notify dashboard:', error);
      throw error;
    }
  }
}

/**
 * Export for CLI usage
 */
export { ZeroDowntimeSnapshotCapture as default };
