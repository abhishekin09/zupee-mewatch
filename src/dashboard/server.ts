import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import type WebSocket from 'ws';

interface ServiceInfo {
  name: string;
  status: 'connected' | 'disconnected';
  connection: WebSocket;
  registeredAt: number;
  lastSeen: number;
  totalAlerts: number;
}

interface MetricData {
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

interface Alert {
  id: number;
  service: string;
  type: 'leak' | 'snapshot';
  message: string;
  timestamp: number;
  severity: 'critical' | 'warning' | 'info';
  heapUsedMB?: number;
  memoryGrowthMB?: number;
  filename?: string;
  filepath?: string;
}

interface SnapshotData {
  id: string;
  serviceName: string;
  containerId: string;
  phase: 'before' | 'after';
  timestamp: string;
  size: number;
  filename: string;
  data?: string;
  chunks?: string[];
  totalChunks?: number;
  receivedChunks?: number;
}

interface ComparisonSession {
  id: string;
  serviceName: string;
  containerId: string;
  beforeSnapshotId: string;
  afterSnapshotId: string;
  timeframe: number;
  status: 'waiting' | 'analyzing' | 'completed' | 'failed';
  result?: any;
  createdAt: number;
}

type IncomingMessage = 
  | { type: 'registration'; service: string; timestamp: number }
  | MetricData
  | { type: 'snapshot'; service: string; filename: string; filepath: string; timestamp: number }
  | { type: 'capture-agent-registration'; serviceName: string; containerId: string; timestamp: number }
  | { type: 'snapshot-metadata'; snapshot: SnapshotData }
  | { type: 'snapshot-chunk'; snapshotId: string; chunkIndex: number; totalChunks: number; data: string }
  | { type: 'snapshot-complete'; snapshotId: string }
  | { type: 'comparison-ready'; serviceName: string; containerId: string; beforeSnapshotId: string; afterSnapshotId: string; timeframe: number; timestamp: string };

/**
 * MemWatch Dashboard Server
 * Central hub for collecting and distributing memory metrics
 */
export class MemWatchDashboard {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer;
  
  // In-memory storage for PoC (use InfluxDB/TimescaleDB for production)
  private services = new Map<string, ServiceInfo>();
  private metrics = new Map<string, MetricData[]>();
  private alerts: Alert[] = [];
  private dashboardClients = new Set<WebSocket>();
  private snapshots = new Map<string, SnapshotData>();
  private comparisonSessions = new Map<string, ComparisonSession>();
  private alertCounter = 1;
  
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    this.setupExpress();
    this.setupWebSocket();
    this.setupRoutes();
  }

  private setupExpress(): void {
    this.app.use(compression());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.static('public'));

    // Request logging middleware
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('New WebSocket connection from:', req.socket.remoteAddress);
      
      ws.on('message', (data: Buffer) => {
        try {
          const message: IncomingMessage = JSON.parse(data.toString());
          this.handleAgentMessage(ws, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({ error: 'Invalid JSON message' }));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.dashboardClients.delete(ws);
        
        // Remove service if this was an agent connection
        for (const [serviceName, service] of this.services.entries()) {
          if (service.connection === ws) {
            service.status = 'disconnected';
            service.lastSeen = Date.now();
            this.broadcastToClients({
              type: 'serviceUpdate',
              service: serviceName,
              status: 'disconnected'
            });
            break;
          }
        }
      });

      ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
      });

      // Send initial data to dashboard clients
      if (req.url?.includes('dashboard')) {
        this.dashboardClients.add(ws);
        ws.send(JSON.stringify({
          type: 'initial',
          services: this.getServicesData(),
          alerts: this.getRecentAlerts()
        }));
      }
    });
  }

  private handleAgentMessage(ws: WebSocket, message: IncomingMessage): void {
    const { type } = message;

    switch (type) {
      case 'registration':
        this.handleServiceRegistration(ws, message);
        break;
      
      case 'metrics':
        this.handleMetrics(ws, message);
        break;
      
      case 'snapshot':
        this.handleSnapshot(ws, message);
        break;
      
      case 'capture-agent-registration':
        this.handleCaptureAgentRegistration(ws, message);
        break;
      
      case 'snapshot-metadata':
        this.handleSnapshotMetadata(ws, message);
        break;
      
      case 'snapshot-chunk':
        this.handleSnapshotChunk(ws, message);
        break;
      
      case 'snapshot-complete':
        this.handleSnapshotComplete(ws, message);
        break;
      
      case 'comparison-ready':
        this.handleComparisonReady(ws, message);
        break;
      
      default:
        console.warn('Unknown message type:', type);
    }
  }

  private handleServiceRegistration(ws: WebSocket, message: { type: 'registration'; service: string; timestamp: number }): void {
    const { service, timestamp } = message;
    
    console.log(`Service registered: ${service}`);
    
    this.services.set(service, {
      name: service,
      status: 'connected',
      connection: ws,
      registeredAt: timestamp,
      lastSeen: timestamp,
      totalAlerts: 0
    });

    if (!this.metrics.has(service)) {
      this.metrics.set(service, []);
    }

    this.broadcastToClients({
      type: 'serviceRegistered',
      service,
      timestamp
    });
  }

  private handleMetrics(ws: WebSocket, message: MetricData): void {
    const { service, timestamp, leakDetected } = message;
    
    // Update service metadata
    const serviceInfo = this.services.get(service);
    if (serviceInfo) {
      serviceInfo.lastSeen = timestamp;
      serviceInfo.status = 'connected';
    }

    // Store metrics
    const serviceMetrics = this.metrics.get(service) || [];
    serviceMetrics.push(message);
    
    // Keep only last 1000 metrics per service (for PoC)
    if (serviceMetrics.length > 1000) {
      serviceMetrics.shift();
    }
    
    this.metrics.set(service, serviceMetrics);

    // Handle leak detection
    if (leakDetected) {
      this.handleLeakAlert(message);
    }

    // Broadcast to dashboard clients
    this.broadcastToClients({
      ...message,
      type: 'metricsUpdate'
    });
  }

  private handleSnapshot(ws: WebSocket, message: { type: 'snapshot'; service: string; filename: string; filepath: string; timestamp: number }): void {
    const { service, filename, filepath, timestamp } = message;
    
    console.log(`Heap snapshot generated for ${service}: ${filename}`);
    
    const alert: Alert = {
      id: Date.now() + Math.random(),
      service,
      type: 'snapshot',
      message: `Heap snapshot generated: ${filename}`,
      filename,
      filepath,
      timestamp,
      severity: 'info'
    };

    this.alerts.push(alert);
    this.trimAlerts();

    this.broadcastToClients({
      type: 'snapshotAlert',
      alert
    });
  }

  private handleLeakAlert(metrics: MetricData): void {
    const { service, heapUsedMB, memoryGrowthMB, timestamp } = metrics;
    
    console.warn(`MEMORY LEAK DETECTED: ${service} - Current heap: ${heapUsedMB}MB, Growth: ${memoryGrowthMB}MB`);
    
    const serviceInfo = this.services.get(service);
    if (serviceInfo) {
      serviceInfo.totalAlerts++;
    }

    const alert: Alert = {
      id: Date.now() + Math.random(),
      service,
      type: 'leak',
      message: `Memory leak detected - Heap: ${heapUsedMB}MB (Growth: +${memoryGrowthMB}MB)`,
      heapUsedMB,
      memoryGrowthMB,
      timestamp,
      severity: 'critical'
    };

    this.alerts.push(alert);
    this.trimAlerts();

    this.broadcastToClients({
      type: 'leakAlert',
      alert
    });
  }

  private broadcastToClients(message: any): void {
    const messageStr: string = JSON.stringify(message);
    this.dashboardClients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
          this.dashboardClients.delete(client);
        }
      }
    });
  }

  private trimAlerts(): void {
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: Date.now(),
        services: this.services.size,
        alerts: this.alerts.length
      });
    });

    // Get all services
    this.app.get('/api/services', (req, res) => {
      res.json(this.getServicesData());
    });

    // Get metrics for a specific service
    this.app.get('/api/services/:serviceName/metrics', (req, res) => {
      const { serviceName } = req.params;
      const { limit = '100', from, to } = req.query;
      
      const serviceMetrics = this.metrics.get(serviceName) || [];
      let filteredMetrics = serviceMetrics;

      // Apply time filters if provided
      if (from || to) {
        const fromTime: number = from ? parseInt(from as string) : 0;
        const toTime: number = to ? parseInt(to as string) : Date.now();
        
        filteredMetrics = serviceMetrics.filter(m => 
          m.timestamp >= fromTime && m.timestamp <= toTime
        );
      }

      // Apply limit
      const limitedMetrics = filteredMetrics.slice(-parseInt(limit as string));

      res.json({
        service: serviceName,
        metrics: limitedMetrics,
        total: filteredMetrics.length
      });
    });

    // Get alerts
    this.app.get('/api/alerts', (req, res) => {
      const { limit = '50', service, severity } = req.query;
      
      let filteredAlerts = this.alerts;

      if (service) {
        filteredAlerts = filteredAlerts.filter(a => a.service === service);
      }

      if (severity) {
        filteredAlerts = filteredAlerts.filter(a => a.severity === severity);
      }

      const limitedAlerts = filteredAlerts.slice(-parseInt(limit as string)).reverse();

      res.json({
        alerts: limitedAlerts,
        total: filteredAlerts.length
      });
    });

    // Get system stats
    this.app.get('/api/stats', (req, res) => {
      const stats = {
        totalServices: this.services.size,
        connectedServices: Array.from(this.services.values()).filter(s => s.status === 'connected').length,
        totalAlerts: this.alerts.length,
        criticalAlerts: this.alerts.filter(a => a.severity === 'critical').length,
        dashboardClients: this.dashboardClients.size,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      };

      res.json(stats);
    });

    // Download heap snapshot (if available)
    this.app.get('/api/snapshots/:filename', (req, res) => {
      const { filename } = req.params;
      // In production, this would serve from S3 or file storage
      res.json({ 
        message: 'Snapshot download not implemented in PoC',
        filename,
        note: 'In production, this would serve the actual .heapsnapshot file'
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Express error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private getServicesData(): any[] {
    return Array.from(this.services.values())
      .filter(service => service.status === 'connected') // Only show connected services
      .map(service => ({
        ...service,
        connection: undefined, // Don't serialize WebSocket connection
        lastMetrics: this.getLastMetrics(service.name)
      }));
  }

  private getLastMetrics(serviceName: string): MetricData | null {
    const serviceMetrics = this.metrics.get(serviceName) || [];
    return serviceMetrics.length > 0 ? serviceMetrics[serviceMetrics.length - 1] : null;
  }

  private getRecentAlerts(limit: number = 10): Alert[] {
    return this.alerts.slice(-limit).reverse();
  }

  start(port: number = 4000): void {
    this.server.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Zupee MemWatch Dashboard Server running on port ${port}`);
      console.log(`📊 Dashboard available at http://localhost:${port}`);
      console.log(`🔌 WebSocket server listening for agents on ws://localhost:${port}`);
      console.log(`📡 REST API available at http://localhost:${port}/api`);
    });

    // Cleanup disconnected services periodically
    setInterval(() => {
      const now: number = Date.now();
      const timeout: number = 60000; // 1 minute timeout

      for (const [serviceName, service] of this.services.entries()) {
        if (service.status === 'connected' && (now - service.lastSeen) > timeout) {
          service.status = 'disconnected';
          console.log(`Service ${serviceName} marked as disconnected (timeout)`);
          
          this.broadcastToClients({
            type: 'serviceUpdate',
            service: serviceName,
            status: 'disconnected'
          });
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Handle capture agent registration
   */
  private handleCaptureAgentRegistration(ws: WebSocket, message: { type: 'capture-agent-registration'; serviceName: string; containerId: string; timestamp: number }): void {
    const { serviceName, containerId, timestamp } = message;
    
    console.log(`Capture agent registered: ${serviceName} (${containerId})`);
    
    // Store as a special service type
    this.services.set(`capture-${serviceName}`, {
      name: `capture-${serviceName}`,
      status: 'connected',
      connection: ws,
      registeredAt: timestamp,
      lastSeen: timestamp,
      totalAlerts: 0
    });

    this.broadcastToClients({
      type: 'captureAgentRegistered',
      serviceName,
      containerId,
      timestamp
    });
  }

  /**
   * Handle snapshot metadata
   */
  private handleSnapshotMetadata(ws: WebSocket, message: { type: 'snapshot-metadata'; snapshot: SnapshotData }): void {
    const { snapshot } = message;
    
    console.log(`Receiving snapshot metadata: ${snapshot.id} (${snapshot.phase})`);
    
    // Initialize snapshot with chunks array
    this.snapshots.set(snapshot.id, {
      ...snapshot,
      chunks: [],
      receivedChunks: 0
    });

    this.broadcastToClients({
      type: 'snapshotStarted',
      snapshot: {
        id: snapshot.id,
        serviceName: snapshot.serviceName,
        phase: snapshot.phase,
        timestamp: snapshot.timestamp,
        size: snapshot.size
      }
    });
  }

  /**
   * Handle snapshot chunk data
   */
  private handleSnapshotChunk(ws: WebSocket, message: { type: 'snapshot-chunk'; snapshotId: string; chunkIndex: number; totalChunks: number; data: string }): void {
    const { snapshotId, chunkIndex, totalChunks, data } = message;
    
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      console.error(`Snapshot not found: ${snapshotId}`);
      return;
    }

    // Initialize chunks array if needed
    if (!snapshot.chunks) {
      snapshot.chunks = new Array(totalChunks);
      snapshot.totalChunks = totalChunks;
      snapshot.receivedChunks = 0;
    }

    // Store chunk
    snapshot.chunks[chunkIndex] = data;
    snapshot.receivedChunks = (snapshot.receivedChunks || 0) + 1;

    // Update progress
    const progress = (snapshot.receivedChunks / totalChunks) * 100;
    
    this.broadcastToClients({
      type: 'snapshotProgress',
      snapshotId,
      progress: Math.round(progress),
      receivedChunks: snapshot.receivedChunks,
      totalChunks
    });
  }

  /**
   * Handle snapshot completion
   */
  private handleSnapshotComplete(ws: WebSocket, message: { type: 'snapshot-complete'; snapshotId: string }): void {
    const { snapshotId } = message;
    
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot || !snapshot.chunks) {
      console.error(`Snapshot not found or incomplete: ${snapshotId}`);
      return;
    }

    // Combine chunks into complete data
    snapshot.data = snapshot.chunks.join('');
    
    console.log(`Snapshot completed: ${snapshotId} (${snapshot.data.length} chars)`);

    // Save to file
    const fs = require('fs');
    const path = require('path');
    
    const snapshotsDir = './dashboard-snapshots';
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }
    
    const filepath = path.join(snapshotsDir, snapshot.filename);
    fs.writeFileSync(filepath, snapshot.data);
    
    console.log(`Snapshot saved locally: ${filepath}`);

    this.broadcastToClients({
      type: 'snapshotCompleted',
      snapshot: {
        id: snapshot.id,
        serviceName: snapshot.serviceName,
        phase: snapshot.phase,
        timestamp: snapshot.timestamp,
        size: snapshot.size,
        filepath
      }
    });
  }

  /**
   * Handle comparison ready notification
   */
  private async handleComparisonReady(ws: WebSocket, message: { type: 'comparison-ready'; serviceName: string; containerId: string; beforeSnapshotId: string; afterSnapshotId: string; timeframe: number; timestamp: string }): Promise<void> {
    const { serviceName, containerId, beforeSnapshotId, afterSnapshotId, timeframe, timestamp } = message;
    
    console.log(`Comparison ready for ${serviceName}: ${beforeSnapshotId} vs ${afterSnapshotId}`);
    
    const sessionId = `comparison_${serviceName}_${Date.now()}`;
    
    // Create comparison session
    const session: ComparisonSession = {
      id: sessionId,
      serviceName,
      containerId,
      beforeSnapshotId,
      afterSnapshotId,
      timeframe,
      status: 'waiting',
      createdAt: Date.now()
    };
    
    this.comparisonSessions.set(sessionId, session);

    // Check if both snapshots are available
    const beforeSnapshot = this.snapshots.get(beforeSnapshotId);
    const afterSnapshot = this.snapshots.get(afterSnapshotId);
    
    if (beforeSnapshot?.data && afterSnapshot?.data) {
      // Start analysis
      session.status = 'analyzing';
      
      this.broadcastToClients({
        type: 'comparisonStarted',
        sessionId,
        serviceName,
        beforeSnapshotId,
        afterSnapshotId
      });

      try {
        // Perform analysis
        const analysis = await this.performSnapshotAnalysis(beforeSnapshot, afterSnapshot);
        
        session.status = 'completed';
        session.result = analysis;
        
        this.broadcastToClients({
          type: 'comparisonCompleted',
          sessionId,
          serviceName,
          analysis
        });

        // Create alert if leak detected
        if (analysis.summary.suspiciousGrowth) {
          this.alerts.push({
            id: this.alertCounter++,
            service: serviceName,
            type: 'leak',
            message: `Memory leak detected: ${analysis.summary.totalGrowthMB.toFixed(2)}MB growth`,
            timestamp: Date.now(),
            severity: analysis.summary.totalGrowthMB > 50 ? 'critical' : 'warning'
          });
        }
        
      } catch (error) {
        console.error('Analysis failed:', error);
        session.status = 'failed';
        
        this.broadcastToClients({
          type: 'comparisonFailed',
          sessionId,
          serviceName,
          error: (error as Error).message
        });
      }
    } else {
      this.broadcastToClients({
        type: 'comparisonPending',
        sessionId,
        serviceName,
        missingSnapshots: {
          before: !beforeSnapshot?.data,
          after: !afterSnapshot?.data
        }
      });
    }
  }

  /**
   * Perform snapshot analysis using Facebook's memlab
   */
  private async performSnapshotAnalysis(beforeSnapshot: SnapshotData, afterSnapshot: SnapshotData): Promise<any> {
    const { MemlabHeapAnalyzer } = await import('../analysis/memlab-analyzer.js');
    
    // Write temporary files for analysis
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const tmpDir = os.tmpdir();
    const beforePath = path.join(tmpDir, `before_${beforeSnapshot.id}.heapsnapshot`);
    const afterPath = path.join(tmpDir, `after_${afterSnapshot.id}.heapsnapshot`);
    
    fs.writeFileSync(beforePath, beforeSnapshot.data);
    fs.writeFileSync(afterPath, afterSnapshot.data);
    
    try {
      console.log('🧪 Using Facebook memlab for advanced heap analysis...');
      
      const analyzer = new MemlabHeapAnalyzer({
        threshold: 1024 * 1024, // 1MB threshold
        verbose: false,
        outputDir: './memlab-dashboard-analysis'
      });
      
      const analysis = await analyzer.analyze(beforePath, afterPath);
      
      // Cleanup temp files
      fs.unlinkSync(beforePath);
      fs.unlinkSync(afterPath);
      
      console.log(`✅ Memlab analysis complete: ${analysis.leaks.length} leaks found, ${analysis.summary.totalLeaksMB.toFixed(2)}MB total`);
      
      return analysis;
    } catch (error) {
      console.warn('⚠️  Memlab analysis failed, falling back to basic analyzer:', (error as Error).message);
      
      // Fallback to basic analyzer
      try {
        const { HeapSnapshotAnalyzer } = await import('../analysis/snapshot-analyzer.js');
        
        const basicAnalyzer = new HeapSnapshotAnalyzer({
          threshold: 1024 * 1024
        });
        
        const analysis = await basicAnalyzer.compare(beforePath, afterPath);
        
        // Cleanup temp files
        fs.unlinkSync(beforePath);
        fs.unlinkSync(afterPath);
        
        return analysis;
      } catch (fallbackError) {
        // Cleanup temp files on error
        try {
          fs.unlinkSync(beforePath);
          fs.unlinkSync(afterPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        
        throw fallbackError;
      }
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const dashboard = new MemWatchDashboard();
  const port: number = parseInt(process.env.PORT || '4000');
  dashboard.start(port);
}

export default MemWatchDashboard;
