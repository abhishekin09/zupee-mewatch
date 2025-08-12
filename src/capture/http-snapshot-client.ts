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

      const snapshotData = fs.readFileSync(snapshotPath);
      const filename = path.basename(snapshotPath);

      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append('serviceName', serviceName);
      formData.append('containerId', containerId);
      formData.append('phase', phase);
      formData.append('snapshot', new Blob([snapshotData]), filename);

      const response = await fetch(`${this.dashboardUrl}/api/snapshots/upload`, {
        method: 'POST',
        body: formData
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

  // Comparison functionality removed - analysis happens on dashboard side

  /**
   * Simple health check - try to access the snapshots endpoint
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.dashboardUrl}/api/snapshots`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Convenience functions removed - only upload functionality needed
