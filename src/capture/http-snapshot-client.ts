import fs from 'fs';
import path from 'path';

/**
 * HTTP client for uploading snapshots to dashboard
 */
export class HttpSnapshotClient {
  private dashboardUrl: string;

  constructor(dashboardUrl: string) {
    // Convert WebSocket URL to HTTP
    this.dashboardUrl = dashboardUrl
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')
      .replace('/dashboard', '');
  }

  /**
   * Upload a snapshot via HTTP
   */
  async uploadSnapshot(
    serviceName: string,
    containerId: string,
    phase: 'before' | 'after',
    snapshotPath: string
  ): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    try {
      console.log(`📤 Uploading ${phase} snapshot via HTTP...`);

      const snapshotData = fs.readFileSync(snapshotPath, 'utf8');
      const filename = path.basename(snapshotPath);

      const response = await fetch(`${this.dashboardUrl}/api/snapshots/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serviceName,
          containerId,
          phase,
          snapshotData,
          filename
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      console.log(`✅ ${phase} snapshot uploaded: ${result.snapshotId} (${(result.size / 1024 / 1024).toFixed(2)} MB)`);

      return { success: true, snapshotId: result.snapshotId };

    } catch (error) {
      console.error(`❌ Failed to upload ${phase} snapshot:`, error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Trigger snapshot comparison via HTTP
   */
  async compareSnapshots(
    serviceName: string,
    containerId: string,
    beforeSnapshotId: string,
    afterSnapshotId: string,
    timeframe: number
  ): Promise<{ success: boolean; analysis?: any; error?: string }> {
    try {
      console.log(`🔬 Triggering HTTP comparison: ${beforeSnapshotId} vs ${afterSnapshotId}`);

      const response = await fetch(`${this.dashboardUrl}/api/snapshots/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serviceName,
          containerId,
          beforeSnapshotId,
          afterSnapshotId,
          timeframe
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Comparison failed');
      }

      console.log(`✅ Analysis complete: ${result.analysis.leakCount} leaks found, suspicious: ${result.analysis.suspiciousGrowth ? 'YES' : 'NO'}`);

      return { success: true, analysis: result.analysis };

    } catch (error) {
      console.error(`❌ Failed to compare snapshots:`, error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Simple health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.dashboardUrl}/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Convenience functions for HTTP snapshot operations
 */
export async function uploadSnapshotHttp(
  dashboardUrl: string,
  serviceName: string,
  containerId: string,
  phase: 'before' | 'after',
  snapshotPath: string
): Promise<string | null> {
  const client = new HttpSnapshotClient(dashboardUrl);
  const result = await client.uploadSnapshot(serviceName, containerId, phase, snapshotPath);
  return result.success ? result.snapshotId! : null;
}

export async function compareSnapshotsHttp(
  dashboardUrl: string,
  serviceName: string,
  containerId: string,
  beforeSnapshotId: string,
  afterSnapshotId: string,
  timeframe: number = 0
): Promise<any | null> {
  const client = new HttpSnapshotClient(dashboardUrl);
  const result = await client.compareSnapshots(serviceName, containerId, beforeSnapshotId, afterSnapshotId, timeframe);
  return result.success ? result.analysis : null;
}
