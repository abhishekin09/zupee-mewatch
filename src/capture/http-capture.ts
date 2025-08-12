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
    console.log('🧹 About to call scaleUpContainers...');
    try {
      await scaleUpContainers(config);
      console.log('✅ scaleUpContainers completed successfully');
    } catch (error) {
      console.error('❌ scaleUpContainers failed:', error);
      throw error;
    }
    
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
    
    // Display completion message
    console.log('\n✅ SNAPSHOT CAPTURE COMPLETED');
    console.log('================================');
    console.log(`📸 Before snapshot: ${beforeUpload.snapshotId}`);
    console.log(`📸 After snapshot: ${afterUpload.snapshotId}`);
    console.log(`⏱️  Timeframe: ${config.timeframe} minutes`);
    console.log(`🔗 View in dashboard: ${config.dashboardUrl.replace('/api', '')}`);
    
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
  console.log('🚀 ENTERING scaleUpContainers function');
  console.log(`🔍 Strategy: ${config.strategy}`);
  console.log(`🔍 Container ID: ${config.containerId}`);
  
  // First, verify the original container is running and healthy
  console.log('🔍 Verifying original container is running...');
  try {
    const { stdout: containerStatus } = await execAsync(`docker ps --filter "name=${config.containerId}" --format "{{.Status}}"`);
    if (!containerStatus.trim() || !containerStatus.trim().startsWith('Up')) {
      throw new Error(`Original container ${config.containerId} is not running (status: ${containerStatus.trim()})`);
    }
    console.log(`✅ Original container ${config.containerId} is running`);
  } catch (error) {
    throw new Error(`Cannot access original container ${config.containerId}: ${error}`);
  }
  
  // For POC purposes, skip scaling to preserve the original container
  console.log('ℹ️  POC MODE: Skipping container scaling to preserve original container');
  console.log('ℹ️  Original container will remain untouched throughout the process');
  console.log('✅ Container scaling skipped (POC mode)');
  
  // TODO: Implement proper scaling when moving to production
  // if (config.strategy === 'k8s') {
  //   // Kubernetes scaling logic
  // } else {
  //   // Docker scaling logic
  // }
}

/**
 * Scale down containers
 */
async function scaleDownContainers(config: HttpCaptureConfig): Promise<void> {
  // For POC purposes, skip scaling down to preserve the original container
  console.log('ℹ️  POC MODE: Skipping container scale-down to preserve original container');
  console.log('✅ Container scale-down skipped (POC mode)');
  
  // TODO: Implement proper scale-down when moving to production
  // if (config.strategy === 'k8s') {
  //   // Kubernetes scale-down logic
  // } else {
  //   // Docker scale-down logic
  // }
}

/**
 * Take heap snapshot from container
 */
async function takeSnapshot(config: HttpCaptureConfig, phase: 'before' | 'after'): Promise<string> {
  // Safety check: verify the original container is still running before taking snapshot
  console.log(`🔍 Verifying container ${config.containerId} is accessible before ${phase} snapshot...`);
  try {
    const { stdout: containerStatus } = await execAsync(`docker ps --filter "name=${config.containerId}" --format "{{.Status}}"`);
    if (!containerStatus.trim() || !containerStatus.trim().startsWith('Up')) {
      throw new Error(`Container ${config.containerId} is not running (status: ${containerStatus.trim()}) - cannot take ${phase} snapshot`);
    }
    console.log(`✅ Container ${config.containerId} is running, proceeding with ${phase} snapshot`);
  } catch (error) {
    throw new Error(`Cannot access container ${config.containerId} for ${phase} snapshot: ${error}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionId = process.env.MEMWATCH_SESSION_ID || `session_${Date.now()}`;
  
  // Create a filename using the 3-digit unique key for easy grouping
  // Format: run_123_containerId_phase_timestamp.heapsnapshot
  const filename = `${sessionId}_${phase}_${timestamp}.heapsnapshot`;
  const containerPath = `/tmp/${filename}`;
  const localPath = path.resolve(`./snapshots/${config.containerId}/${filename}`);
  
  // Ensure snapshots directory exists
  const snapshotsDir = path.dirname(localPath);
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }
  
  // Create single-line Node.js command using writeHeapSnapshot
  const snapshotCmd = `node -e "const v8=require('v8');console.log('Taking snapshot...');const snapshot=v8.writeHeapSnapshot('${containerPath}');console.log('Snapshot saved:', snapshot);"`;
  
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
