import { monitorEventLoopDelay } from 'perf_hooks';
import WebSocket from 'ws';
import v8 from 'v8';
import fs from 'fs';
import path from 'path';

/**
 * Configuration options for the MemWatch agent
 */
export interface MemWatchConfig {
  /** Name of the service being monitored */
  serviceName: string;
  /** WebSocket URL of the dashboard server */
  dashboardUrl?: string;
  /** Interval in milliseconds to check memory usage */
  checkInterval?: number;
  /** Memory growth threshold in MB to detect leaks */
  leakThresholdMB?: number;
  /** Whether to generate heap snapshots on leak detection */
  enableHeapSnapshots?: boolean;
  /** Directory to store heap snapshots */
  snapshotPath?: string;
  /** Number of memory readings to keep for trend analysis */
  historySize?: number;
}

/**
 * Memory usage metrics
 */
export interface MemoryMetrics {
  type: 'metrics';
  service: string;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  eventLoopDelayMs: number;
  timestamp: number;
  leakDetected: boolean;
  memoryGrowthMB: number;
}

/**
 * Historical memory data point
 */
interface MemoryHistoryPoint {
  heapUsed: number;
  timestamp: number;
}

/**
 * WebSocket message types
 */
type WebSocketMessage = 
  | { type: 'registration'; service: string; timestamp: number }
  | MemoryMetrics
  | { type: 'snapshot'; service: string; filename: string; filepath: string; timestamp: number };

/**
 * MemWatch Agent - Monitors memory usage and detects leaks
 */
export class MemWatchAgent {
  private config: Required<MemWatchConfig>;
  private ws: WebSocket | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private memoryHistory: MemoryHistoryPoint[] = [];
  private eventLoopMonitor: any = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Default configuration values
   */
  private static readonly DEFAULT_CONFIG: Omit<Required<MemWatchConfig>, 'serviceName'> = {
    dashboardUrl: 'ws://localhost:4000',
    checkInterval: 10000,
    leakThresholdMB: 50,
    enableHeapSnapshots: false,
    snapshotPath: './snapshots',
    historySize: 12,
  };

  constructor() {
    this.config = {} as Required<MemWatchConfig>;
  }

  /**
   * Start the memory leak monitoring agent
   */
  start(config: MemWatchConfig): void {
    if (this.isRunning) {
      console.warn('[MemWatch] Agent is already running');
      return;
    }

    this.config = {
      ...MemWatchAgent.DEFAULT_CONFIG,
      ...config,
    };

    this.isRunning = true;
    this.memoryHistory = [];
    
    console.log(`[MemWatch] Starting memory leak detection for: ${this.config.serviceName}`);
    
    this.setupEventLoopMonitor();
    this.connectToWebSocket();
    this.startMemoryMonitoring();

    if (this.config.enableHeapSnapshots) {
      this.ensureSnapshotDirectory();
    }
  }

  /**
   * Stop the memory leak monitoring agent
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn('[MemWatch] Agent is not running');
      return;
    }

    console.log('[MemWatch] Stopping memory leak detection');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.eventLoopMonitor) {
      this.eventLoopMonitor.disable();
      this.eventLoopMonitor = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.memoryHistory = [];
  }

  /**
   * Setup event loop delay monitoring
   */
  private setupEventLoopMonitor(): void {
    this.eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
    this.eventLoopMonitor.enable();
  }

  /**
   * Connect to the dashboard WebSocket server
   */
  private connectToWebSocket(): void {
    try {
      this.ws = new WebSocket(this.config.dashboardUrl);

      this.ws.on('open', () => {
        console.log('[MemWatch] Connected to dashboard');
        // Send initial registration message
        this.sendMetric({
          type: 'registration',
          service: this.config.serviceName,
          timestamp: Date.now()
        });
      });

      this.ws.on('close', () => {
        console.log('[MemWatch] Disconnected from dashboard');
        if (this.isRunning) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: Error) => {
        console.error('[MemWatch] WebSocket error:', error.message);
        if (this.isRunning) {
          this.scheduleReconnect();
        }
      });

    } catch (error) {
      console.error('[MemWatch] Failed to connect to dashboard:', (error as Error).message);
      if (this.isRunning) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Schedule reconnection to WebSocket server
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      if (this.isRunning) {
        console.log('[MemWatch] Attempting to reconnect...');
        this.connectToWebSocket();
      }
    }, 5000); // Retry every 5 seconds
  }

  /**
   * Start memory monitoring interval
   */
  private startMemoryMonitoring(): void {
    this.intervalId = setInterval(() => {
      this.collectAndSendMetrics();
    }, this.config.checkInterval);

    // Send initial metrics immediately
    this.collectAndSendMetrics();
  }

  /**
   * Collect memory metrics and send to dashboard
   */
  private collectAndSendMetrics(): void {
    try {
      const memUsage = process.memoryUsage();
      const eventLoopDelay: number = this.eventLoopMonitor ? this.eventLoopMonitor.mean / 1000000 : 0; // Convert to ms
      
      const heapUsedMB: number = memUsage.heapUsed / (1024 * 1024);
      const rssMB: number = memUsage.rss / (1024 * 1024);
      const heapTotalMB: number = memUsage.heapTotal / (1024 * 1024);
      const externalMB: number = memUsage.external / (1024 * 1024);

      // Store in history for leak detection
      this.memoryHistory.push({
        heapUsed: memUsage.heapUsed,
        timestamp: Date.now()
      });

      // Keep only recent history
      if (this.memoryHistory.length > this.config.historySize) {
        this.memoryHistory.shift();
      }

      // Detect memory leak
      const leakDetected: boolean = this.detectLeak();
      
      if (leakDetected) {
        console.warn(`[MemWatch] Memory leak detected in ${this.config.serviceName}!`);
        if (this.config.enableHeapSnapshots) {
          this.generateHeapSnapshot();
        }
      }

      const metrics: MemoryMetrics = {
        type: 'metrics',
        service: this.config.serviceName,
        heapUsedMB: Math.round(heapUsedMB * 100) / 100,
        heapTotalMB: Math.round(heapTotalMB * 100) / 100,
        rssMB: Math.round(rssMB * 100) / 100,
        externalMB: Math.round(externalMB * 100) / 100,
        eventLoopDelayMs: Math.round(eventLoopDelay * 100) / 100,
        timestamp: Date.now(),
        leakDetected,
        memoryGrowthMB: this.getMemoryGrowth()
      };

      this.sendMetric(metrics);

      // Reset event loop monitor
      if (this.eventLoopMonitor) {
        this.eventLoopMonitor.reset();
      }

    } catch (error) {
      console.error('[MemWatch] Error collecting metrics:', error);
    }
  }

  /**
   * Detect memory leak based on historical data
   */
  private detectLeak(): boolean {
    if (this.memoryHistory.length < this.config.historySize) {
      return false; // Not enough data
    }

    const heapValues: number[] = this.memoryHistory.map(h => h.heapUsed);
    const minHeap: number = Math.min(...heapValues);
    const maxHeap: number = Math.max(...heapValues);
    const growthBytes: number = maxHeap - minHeap;
    const growthMB: number = growthBytes / (1024 * 1024);

    // Additional heuristic: check for consistent upward trend
    const recentGrowth: number = this.getRecentGrowthTrend();
    
    return growthMB > this.config.leakThresholdMB && recentGrowth > 0.7;
  }

  /**
   * Get recent memory growth trend (0-1, where 1 is consistent growth)
   */
  private getRecentGrowthTrend(): number {
    if (this.memoryHistory.length < 6) return 0;

    const recent = this.memoryHistory.slice(-6);
    let increases = 0;
    
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].heapUsed > recent[i-1].heapUsed) {
        increases++;
      }
    }

    return increases / (recent.length - 1);
  }

  /**
   * Get current memory growth in MB from baseline
   */
  private getMemoryGrowth(): number {
    if (this.memoryHistory.length < 2) return 0;

    const baseline: number = this.memoryHistory[0].heapUsed;
    const current: number = this.memoryHistory[this.memoryHistory.length - 1].heapUsed;
    return Math.round(((current - baseline) / (1024 * 1024)) * 100) / 100;
  }

  /**
   * Send metric data to dashboard
   */
  private sendMetric(data: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (error) {
        console.error('[MemWatch] Error sending metrics:', error);
      }
    }
  }

  /**
   * Generate heap snapshot when leak is detected
   */
  private generateHeapSnapshot(): void {
    try {
      const timestamp: string = new Date().toISOString().replace(/[:.]/g, '-');
      const filename: string = `${this.config.serviceName}-heap-${timestamp}.heapsnapshot`;
      const filepath: string = path.join(this.config.snapshotPath, filename);

      const snapshot = v8.getHeapSnapshot();
      const writeStream = fs.createWriteStream(filepath);
      
      snapshot.pipe(writeStream);
      
      writeStream.on('finish', () => {
        console.log(`[MemWatch] Heap snapshot saved: ${filepath}`);
        
        // Notify dashboard about snapshot
        this.sendMetric({
          type: 'snapshot',
          service: this.config.serviceName,
          filename,
          filepath,
          timestamp: Date.now()
        });
      });

      writeStream.on('error', (error: Error) => {
        console.error('[MemWatch] Error saving heap snapshot:', error);
      });

    } catch (error) {
      console.error('[MemWatch] Error generating heap snapshot:', error);
    }
  }

  /**
   * Ensure snapshot directory exists
   */
  private ensureSnapshotDirectory(): void {
    try {
      if (!fs.existsSync(this.config.snapshotPath)) {
        fs.mkdirSync(this.config.snapshotPath, { recursive: true });
        console.log(`[MemWatch] Created snapshot directory: ${this.config.snapshotPath}`);
      }
    } catch (error) {
      console.error('[MemWatch] Error creating snapshot directory:', error);
    }
  }
}

// Create singleton instance
const agent = new MemWatchAgent();

// Default export for ease of use
export default agent;

// Named exports for convenience
export const start = (config: MemWatchConfig): void => agent.start(config);
export const stop = (): void => agent.stop();

// Export leak detection functionality
export {
  LeakDetectionController,
  InContainerSnapshotTrigger,
  createLeakDetector,
  takeSnapshot,
  inContainerTrigger
} from './leak-detector.js';

export {
  HeapSnapshotAnalyzer,
  analyzeSnapshots
} from './analysis/snapshot-analyzer.js';

export type {
  LeakDetectorConfig,
  SnapshotAnalysis,
  LeakOffender
} from './leak-detector.js';
