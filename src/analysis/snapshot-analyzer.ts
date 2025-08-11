import fs from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { pipeline } from 'stream/promises';

/**
 * Configuration for heap snapshot analysis
 */
export interface AnalyzerConfig {
  /** Bytes increase threshold to consider suspicious */
  threshold: number;
  /** Maximum number of offenders to return */
  maxOffenders?: number;
  /** Whether to analyze retainer chains */
  analyzeRetainers?: boolean;
  /** Minimum object count to consider for analysis */
  minObjectCount?: number;
}

/**
 * Parsed heap snapshot data
 */
interface HeapSnapshot {
  meta: {
    node_fields: string[];
    node_types: string[][];
    edge_fields: string[];
    edge_types: string[][];
    trace_fields?: string[];
    trace_types?: string[][];
    samples?: number[];
  };
  nodeCount: number;
  edgeCount: number;
  traceCount?: number;
  nodes: HeapNode[];
  edges: HeapEdge[];
  strings: string[];
}

/**
 * Heap node representation
 */
interface HeapNode {
  type: number;
  name: number;
  id: number;
  selfSize: number;
  edgeCount: number;
  traceNodeId?: number;
  detachedness?: number;
}

/**
 * Heap edge representation
 */
interface HeapEdge {
  type: number;
  nameOrIndex: number;
  toNode: number;
}

/**
 * Object type statistics
 */
interface ObjectTypeStats {
  typeName: string;
  count: number;
  selfSize: number;
  retainedSize: number;
  instances: HeapNode[];
}

/**
 * Memory leak offender
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
  growthRate: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Complete analysis result
 */
export interface SnapshotAnalysis {
  before: {
    totalSize: number;
    nodeCount: number;
    timestamp: string;
    filename: string;
    typeStats: Record<string, ObjectTypeStats>;
  };
  after: {
    totalSize: number;
    nodeCount: number;
    timestamp: string;
    filename: string;
    typeStats: Record<string, ObjectTypeStats>;
  };
  offenders: LeakOffender[];
  summary: {
    totalGrowthMB: number;
    suspiciousGrowth: boolean;
    likelyLeakSource?: string;
    confidence: number;
    recommendations: string[];
  };
  metadata: {
    analysisTimestamp: string;
    thresholdBytes: number;
    analyzerVersion: string;
  };
}

/**
 * Advanced heap snapshot analyzer
 */
export class HeapSnapshotAnalyzer {
  private config: Required<AnalyzerConfig>;

  constructor(config: AnalyzerConfig) {
    this.config = {
      maxOffenders: 10,
      analyzeRetainers: true,
      minObjectCount: 5,
      ...config
    };
  }

  /**
   * Compare two heap snapshots and analyze for leaks
   */
  async compare(beforePath: string, afterPath: string): Promise<SnapshotAnalysis> {
    console.log('🔬 Parsing heap snapshots...');
    
    const [beforeSnapshot, afterSnapshot] = await Promise.all([
      this.parseSnapshot(beforePath),
      this.parseSnapshot(afterPath)
    ]);

    console.log('📊 Analyzing object types...');
    
    const beforeStats = this.analyzeObjectTypes(beforeSnapshot);
    const afterStats = this.analyzeObjectTypes(afterSnapshot);

    console.log('🔍 Detecting memory leaks...');
    
    const offenders = this.findLeakOffenders(beforeStats, afterStats);

    console.log('🎯 Analyzing retention patterns...');
    
    if (this.config.analyzeRetainers) {
      await this.analyzeRetainerChains(offenders, beforeSnapshot, afterSnapshot);
    }

    const summary = this.generateSummary(offenders, beforeStats, afterStats);

    return {
      before: {
        totalSize: this.calculateTotalSize(beforeSnapshot),
        nodeCount: beforeSnapshot.nodeCount,
        timestamp: fs.statSync(beforePath).mtime.toISOString(),
        filename: beforePath.split('/').pop() || '',
        typeStats: beforeStats
      },
      after: {
        totalSize: this.calculateTotalSize(afterSnapshot),
        nodeCount: afterSnapshot.nodeCount,
        timestamp: fs.statSync(afterPath).mtime.toISOString(),
        filename: afterPath.split('/').pop() || '',
        typeStats: afterStats
      },
      offenders: offenders.slice(0, this.config.maxOffenders),
      summary,
      metadata: {
        analysisTimestamp: new Date().toISOString(),
        thresholdBytes: this.config.threshold,
        analyzerVersion: '1.0.0'
      }
    };
  }

  /**
   * Parse a heap snapshot file
   */
  private async parseSnapshot(filePath: string): Promise<HeapSnapshot> {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Parse the V8 heap snapshot format
    const snapshot: HeapSnapshot = {
      meta: data.snapshot.meta,
      nodeCount: data.snapshot.node_count,
      edgeCount: data.snapshot.edge_count,
      traceCount: data.snapshot.trace_function_count,
      nodes: [],
      edges: [],
      strings: data.strings || []
    };

    // Parse nodes
    const nodeFields = snapshot.meta.node_fields;
    const nodeFieldCount = nodeFields.length;
    for (let i = 0; i < data.nodes.length; i += nodeFieldCount) {
      const node: HeapNode = {
        type: data.nodes[i],
        name: data.nodes[i + 1],
        id: data.nodes[i + 2],
        selfSize: data.nodes[i + 3],
        edgeCount: data.nodes[i + 4],
        traceNodeId: data.nodes[i + 5],
        detachedness: data.nodes[i + 6]
      };
      snapshot.nodes.push(node);
    }

    // Parse edges  
    const edgeFields = snapshot.meta.edge_fields;
    const edgeFieldCount = edgeFields.length;
    for (let i = 0; i < data.edges.length; i += edgeFieldCount) {
      const edge: HeapEdge = {
        type: data.edges[i],
        nameOrIndex: data.edges[i + 1],
        toNode: data.edges[i + 2]
      };
      snapshot.edges.push(edge);
    }

    return snapshot;
  }

  /**
   * Analyze object types in a snapshot
   */
  private analyzeObjectTypes(snapshot: HeapSnapshot): Record<string, ObjectTypeStats> {
    const typeStats: Record<string, ObjectTypeStats> = {};

    snapshot.nodes.forEach(node => {
      const typeName = this.getNodeTypeName(node, snapshot);
      
      if (!typeStats[typeName]) {
        typeStats[typeName] = {
          typeName,
          count: 0,
          selfSize: 0,
          retainedSize: 0,
          instances: []
        };
      }

      typeStats[typeName].count++;
      typeStats[typeName].selfSize += node.selfSize;
      typeStats[typeName].instances.push(node);
    });

    // Calculate retained sizes (simplified - would need full retainer analysis)
    Object.values(typeStats).forEach(stats => {
      stats.retainedSize = stats.selfSize; // Simplified
    });

    return typeStats;
  }

  /**
   * Find potential memory leak offenders
   */
  private findLeakOffenders(
    beforeStats: Record<string, ObjectTypeStats>,
    afterStats: Record<string, ObjectTypeStats>
  ): LeakOffender[] {
    const offenders: LeakOffender[] = [];

    // Get all types that exist in either snapshot
    const allTypes = new Set([
      ...Object.keys(beforeStats),
      ...Object.keys(afterStats)
    ]);

    allTypes.forEach(typeName => {
      const before = beforeStats[typeName] || { count: 0, retainedSize: 0 };
      const after = afterStats[typeName] || { count: 0, retainedSize: 0 };

      const deltaSize = after.retainedSize - before.retainedSize;
      const deltaCount = after.count - before.count;

      // Only consider types with significant changes
      if (Math.abs(deltaSize) >= this.config.threshold || 
          Math.abs(deltaCount) >= this.config.minObjectCount) {
        
        const growthRate = before.retainedSize > 0 ? 
          (deltaSize / before.retainedSize) : 
          (deltaSize > 0 ? Infinity : 0);

        const severity = this.calculateSeverity(deltaSize, deltaCount, growthRate);

        offenders.push({
          type: typeName,
          countBefore: before.count,
          countAfter: after.count,
          retainedSizeBefore: before.retainedSize,
          retainedSizeAfter: after.retainedSize,
          deltaSize,
          deltaCount,
          growthRate,
          severity,
          suspiciousRetainers: []
        });
      }
    });

    // Sort by absolute delta size (descending)
    return offenders.sort((a, b) => Math.abs(b.deltaSize) - Math.abs(a.deltaSize));
  }

  /**
   * Analyze retainer chains for suspicious patterns
   */
  private async analyzeRetainerChains(
    offenders: LeakOffender[],
    beforeSnapshot: HeapSnapshot,
    afterSnapshot: HeapSnapshot
  ): Promise<void> {
    // This is a simplified version - full retainer analysis would be more complex
    for (const offender of offenders.slice(0, 5)) { // Analyze top 5 offenders
      const suspiciousRetainers = this.findSuspiciousRetainers(
        offender.type,
        afterSnapshot
      );
      
      offender.suspiciousRetainers = suspiciousRetainers;
    }
  }

  /**
   * Find suspicious retainer patterns
   */
  private findSuspiciousRetainers(typeName: string, snapshot: HeapSnapshot): string[] {
    const retainers: string[] = [];
    
    // Common patterns that indicate leaks
    const suspiciousPatterns = [
      'Array',
      'Map',
      'Set',
      'WeakMap',
      'WeakSet',
      'EventEmitter',
      'Promise',
      'Timer',
      'Closure'
    ];

    // Simplified retainer detection
    const instances = snapshot.nodes.filter(node => 
      this.getNodeTypeName(node, snapshot) === typeName
    );

    if (instances.length > 100) { // Many instances might indicate a leak
      retainers.push('High instance count detected');
    }

    // Check for retention by suspicious types
    suspiciousPatterns.forEach(pattern => {
      const hasRetainer = snapshot.nodes.some(node => 
        this.getNodeTypeName(node, snapshot).includes(pattern)
      );
      
      if (hasRetainer) {
        retainers.push(`Potentially retained by ${pattern}`);
      }
    });

    return retainers.slice(0, 3); // Return top 3 suspicious patterns
  }

  /**
   * Calculate severity level
   */
  private calculateSeverity(
    deltaSize: number, 
    deltaCount: number, 
    growthRate: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const sizeMB = Math.abs(deltaSize) / (1024 * 1024);
    
    if (sizeMB > 100 || growthRate > 10) return 'critical';
    if (sizeMB > 50 || growthRate > 5) return 'high';
    if (sizeMB > 10 || growthRate > 2) return 'medium';
    return 'low';
  }

  /**
   * Generate analysis summary
   */
  private generateSummary(
    offenders: LeakOffender[],
    beforeStats: Record<string, ObjectTypeStats>,
    afterStats: Record<string, ObjectTypeStats>
  ): SnapshotAnalysis['summary'] {
    const totalGrowth = Object.values(afterStats).reduce((sum, stats) => sum + stats.retainedSize, 0) -
                      Object.values(beforeStats).reduce((sum, stats) => sum + stats.retainedSize, 0);
    
    const totalGrowthMB = totalGrowth / (1024 * 1024);
    const suspiciousGrowth = Math.abs(totalGrowthMB) > (this.config.threshold / (1024 * 1024));
    
    const criticalOffenders = offenders.filter(o => o.severity === 'critical');
    const highOffenders = offenders.filter(o => o.severity === 'high');
    
    let confidence = 0.5; // Base confidence
    if (criticalOffenders.length > 0) confidence = 0.9;
    else if (highOffenders.length > 0) confidence = 0.7;
    else if (offenders.length > 5) confidence = 0.6;

    const recommendations: string[] = [];
    
    if (criticalOffenders.length > 0) {
      recommendations.push('Immediate investigation required - critical memory growth detected');
      recommendations.push(`Focus on: ${criticalOffenders[0].type}`);
    }
    
    if (offenders.some(o => o.type.includes('Array'))) {
      recommendations.push('Check for growing arrays or lists that are not being cleared');
    }
    
    if (offenders.some(o => o.type.includes('Closure'))) {
      recommendations.push('Review event listeners and callback functions for proper cleanup');
    }
    
    if (offenders.some(o => o.suspiciousRetainers?.some(r => r.includes('EventEmitter')))) {
      recommendations.push('Check EventEmitter instances for memory leaks due to unremoved listeners');
    }

    const likelyLeakSource = criticalOffenders.length > 0 ? 
      criticalOffenders[0].type : 
      (highOffenders.length > 0 ? highOffenders[0].type : undefined);

    return {
      totalGrowthMB,
      suspiciousGrowth,
      likelyLeakSource,
      confidence,
      recommendations: recommendations.slice(0, 5)
    };
  }

  /**
   * Get human-readable type name for a node
   */
  private getNodeTypeName(node: HeapNode, snapshot: HeapSnapshot): string {
    const nodeTypes = snapshot.meta.node_types;
    const typeNames = nodeTypes?.[0] || [];
    const typeName = typeNames[node.type] || 'Unknown';
    
    if (node.name < snapshot.strings.length) {
      const name = snapshot.strings[node.name];
      return name ? `${typeName}(${name})` : typeName;
    }
    
    return typeName;
  }

  /**
   * Calculate total heap size
   */
  private calculateTotalSize(snapshot: HeapSnapshot): number {
    return snapshot.nodes.reduce((total, node) => total + node.selfSize, 0);
  }
}

/**
 * Quick analysis function for CLI usage
 */
export async function analyzeSnapshots(
  beforePath: string, 
  afterPath: string, 
  config?: Partial<AnalyzerConfig>
): Promise<SnapshotAnalysis> {
  const analyzer = new HeapSnapshotAnalyzer({
    threshold: 10 * 1024 * 1024, // 10MB default
    ...config
  });
  
  return analyzer.compare(beforePath, afterPath);
}

/**
 * Export utilities
 */
export { HeapSnapshotAnalyzer as default };
