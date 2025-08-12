import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { HttpSnapshotClient } from './http-snapshot-client.js';

const execAsync = promisify(exec);

export interface HttpCaptureConfig {
  containerId: string;
  timeframe: number;
  dashboardUrl: string;
  strategy: 'docker' | 'k8s';
  namespace?: string;
  replicaCount?: number;
  serviceName: string;
}

/**
 * Execute zero-downtime capture using HTTP API
 */
export async function executeHttpCapture(config: HttpCaptureConfig): Promise<void> {
  const client = new HttpSnapshotClient(config.dashboardUrl);
  
  try {
    console.log(`🚀 Starting HTTP-based zero-downtime capture for ${config.containerId}`);
    console.log(`⏱️  Timeframe: ${config.timeframe} minutes`);
    console.log(`📡 Dashboard: ${config.dashboardUrl}`);
    
    // Health check
    console.log('🔌 Checking dashboard connection...');
    const isHealthy = await client.healthCheck();
    if (!isHealthy) {
      throw new Error('Dashboard is not accessible');
    }
    console.log('✅ Dashboard is accessible');
    
    // Scale up containers for zero downtime
    await scaleUpContainers(config);
    
    // Take before snapshot
    console.log('📸 Taking before snapshot...');
    const beforeSnapshotPath = await takeSnapshot(config, 'before');
    
    // Upload before snapshot
    const beforeUpload = await client.uploadSnapshot(
      config.serviceName,
      config.containerId,
      'before',
      beforeSnapshotPath
    );
    
    if (!beforeUpload.success) {
      throw new Error(`Failed to upload before snapshot: ${beforeUpload.error}`);
    }
    
    // Wait timeframe
    console.log(`⏳ Waiting ${config.timeframe} minutes for memory activity...`);
    await new Promise(resolve => setTimeout(resolve, config.timeframe * 60 * 1000));
    
    // Take after snapshot
    console.log('📸 Taking after snapshot...');
    const afterSnapshotPath = await takeSnapshot(config, 'after');
    
    // Upload after snapshot
    const afterUpload = await client.uploadSnapshot(
      config.serviceName,
      config.containerId,
      'after',
      afterSnapshotPath
    );
    
    if (!afterUpload.success) {
      throw new Error(`Failed to upload after snapshot: ${afterUpload.error}`);
    }
    
    // Trigger comparison
    console.log('🔬 Triggering snapshot comparison...');
    const comparison = await client.compareSnapshots(
      config.serviceName,
      config.containerId,
      beforeUpload.snapshotId!,
      afterUpload.snapshotId!,
      config.timeframe
    );
    
    if (!comparison.success) {
      throw new Error(`Failed to compare snapshots: ${comparison.error}`);
    }
    
    // Display results
    console.log('\n📊 ANALYSIS RESULTS');
    console.log('===================');
    console.log(`Leak Count: ${comparison.analysis.leakCount}`);
    console.log(`Suspicious Growth: ${comparison.analysis.suspiciousGrowth ? 'YES' : 'NO'}`);
    
    if (comparison.analysis.recommendations && comparison.analysis.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      comparison.analysis.recommendations.slice(0, 3).forEach((rec: string, index: number) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    // Scale down containers
    await scaleDownContainers(config);
    
    console.log('\n✅ HTTP capture completed successfully!');
    console.log(`📊 Check dashboard at: ${config.dashboardUrl.replace('/api', '')}`);
    
    // Cleanup local files
    try {
      fs.unlinkSync(beforeSnapshotPath);
      fs.unlinkSync(afterSnapshotPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
  } catch (error) {
    console.error('❌ HTTP capture failed:', error);
    
    // Try to scale down on error
    try {
      await scaleDownContainers(config);
    } catch (cleanupError) {
      console.error('❌ Failed to cleanup containers:', cleanupError);
    }
    
    throw error;
  }
}

/**
 * Scale up containers for zero downtime
 */
async function scaleUpContainers(config: HttpCaptureConfig): Promise<void> {
  if (config.strategy === 'k8s') {
    console.log('📈 Scaling Kubernetes pods...');
    
    // Get deployment name from pod
    const { stdout: podInfo } = await execAsync(
      `kubectl get pod ${config.containerId} -n ${config.namespace || 'default'} -o json`
    );
    
    const pod = JSON.parse(podInfo);
    const ownerRef = pod.metadata.ownerReferences?.find((ref: any) => ref.kind === 'ReplicaSet');
    
    if (ownerRef) {
      const { stdout: rsInfo } = await execAsync(
        `kubectl get replicaset ${ownerRef.name} -n ${config.namespace || 'default'} -o json`
      );
      
      const replicaSet = JSON.parse(rsInfo);
      const deploymentRef = replicaSet.metadata.ownerReferences?.find((ref: any) => ref.kind === 'Deployment');
      
      if (deploymentRef) {
        await execAsync(
          `kubectl scale deployment ${deploymentRef.name} -n ${config.namespace || 'default'} --replicas=${config.replicaCount || 2}`
        );
        
        await execAsync(
          `kubectl wait --for=condition=ready pod -l app=${deploymentRef.name} -n ${config.namespace || 'default'} --timeout=120s`
        );
        
        console.log('✅ Kubernetes pods scaled up');
      }
    }
  } else {
    console.log('🐳 Scaling Docker containers...');
    
    // Get container info
    const { stdout: containerInfo } = await execAsync(`docker inspect ${config.containerId}`);
    const container = JSON.parse(containerInfo)[0];
    
    const image = container.Config.Image;
    const env = container.Config.Env || [];
    
    // Start additional containers
    const additionalContainers = (config.replicaCount || 2) - 1;
    
    for (let i = 0; i < additionalContainers; i++) {
      const envArgs = env.map((envVar: string) => `-e "${envVar}"`).join(' ');
      const containerName = `${config.containerId}-scale-${i + 1}`;
      
      await execAsync(
        `docker run -d --name ${containerName} ${envArgs} ${image}`
      );
      
      console.log(`✅ Started additional container: ${containerName}`);
    }
    
    console.log('✅ Docker containers scaled up');
  }
}

/**
 * Scale down containers
 */
async function scaleDownContainers(config: HttpCaptureConfig): Promise<void> {
  if (config.strategy === 'k8s') {
    console.log('📉 Scaling down Kubernetes pods...');
    // Implementation would restore original replica count
    // For now, log only
    console.log('ℹ️  Kubernetes scale-down not implemented in HTTP mode');
  } else {
    console.log('📉 Scaling down Docker containers...');
    
    // Remove additional containers
    const additionalContainers = (config.replicaCount || 2) - 1;
    
    for (let i = 0; i < additionalContainers; i++) {
      const containerName = `${config.containerId}-scale-${i + 1}`;
      
      try {
        await execAsync(`docker rm -f ${containerName}`);
        console.log(`✅ Removed container: ${containerName}`);
      } catch (error) {
        console.warn(`⚠️  Could not remove ${containerName}`);
      }
    }
    
    console.log('✅ Docker containers scaled down');
  }
}

/**
 * Take heap snapshot from container
 */
async function takeSnapshot(config: HttpCaptureConfig, phase: 'before' | 'after'): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionId = process.env.MEMWATCH_SESSION_ID || `session_${Date.now()}`;
  const filename = `${sessionId}_${phase}_${timestamp}.heapsnapshot`;
  const containerPath = `/tmp/${filename}`;
  const localPath = path.resolve(`./snapshots/${config.containerId}/${filename}`);
  
  // Ensure snapshots directory exists
  const snapshotsDir = path.dirname(localPath);
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }
  
  // Create single-line Node.js command
  const snapshotCmd = `node -e "const v8=require('v8');const fs=require('fs');console.log('Taking snapshot...');const s=v8.getHeapSnapshot();const w=fs.createWriteStream('${containerPath}');s.pipe(w);w.on('finish',()=>{console.log('Done');process.exit(0)});w.on('error',(e)=>{console.error(e);process.exit(1)});"`;
  
  if (config.strategy === 'k8s') {
    await execAsync(
      `kubectl exec ${config.containerId} -n ${config.namespace || 'default'} -- ${snapshotCmd}`
    );
    await execAsync(
      `kubectl cp ${config.namespace || 'default'}/${config.containerId}:${containerPath} ${localPath}`
    );
  } else {
    await execAsync(`docker exec ${config.containerId} ${snapshotCmd}`);
    await execAsync(`docker cp ${config.containerId}:${containerPath} ${localPath}`);
  }
  
  const stats = fs.statSync(localPath);
  console.log(`✅ ${phase} snapshot captured: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  
  return localPath;
}
