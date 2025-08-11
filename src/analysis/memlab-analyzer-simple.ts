import { getFullHeapFromFile } from '@memlab/heap-analysis';
import fs from 'fs';
import path from 'path';

/**
 * Simplified memlab analyzer that works with available APIs
 */
export interface MemlabAnalysisConfig {
  threshold: number;
  outputDir?: string;
  verbose?: boolean;
}

export interface MemlabLeakInfo {
  id: string;
  type: string;
  retainedSize: number;
  count: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface MemlabAnalysisResult {
  summary: {
    totalLeaksMB: number;
    leakCount: number;
    suspiciousGrowth: boolean;
    confidence: number;
    analysisTime: number;
    memoryEfficiency: number;
  };
  leaks: MemlabLeakInfo[];
  allocations: {
    topAllocators: Array<{
      name: string;
      size: number;
      count: number;
    }>;
    growthPatterns: Array<{
      type: string;
      growth: number;
      trend: 'increasing' | 'stable' | 'decreasing';
    }>;
  };
  recommendations: string[];
  metadata: {
    analysisTimestamp: string;
    beforeSnapshotSize: number;
    afterSnapshotSize: number;
    memlabVersion: string;
  };
}

/**
 * Simplified memlab heap analyzer
 */
export class MemlabHeapAnalyzer {
  private config: Required<MemlabAnalysisConfig>;

  constructor(config: MemlabAnalysisConfig) {
    this.config = {
      outputDir: './memlab-analysis',
      verbose: false,
      ...config
    };

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Analyze heap snapshots using memlab
   */
  async analyze(beforeSnapshotPath: string, afterSnapshotPath: string): Promise<MemlabAnalysisResult> {
    const startTime = Date.now();
    
    try {
      console.log('🔬 Starting memlab heap analysis...');
      
      // Load heap snapshots using memlab
      const beforeHeap = await getFullHeapFromFile(beforeSnapshotPath);
      const afterHeap = await getFullHeapFromFile(afterSnapshotPath);
      
      console.log('📊 Analyzing memory growth patterns...');
      
      // Simplified analysis using heap data
      const leaks = this.detectMemoryGrowth(beforeHeap, afterHeap);
      const allocations = this.analyzeAllocations(beforeHeap, afterHeap);
      const summary = this.generateSummary(leaks, beforeHeap, afterHeap, startTime);
      const recommendations = this.generateRecommendations(leaks, allocations);
      
      // Get file sizes
      const beforeStats = fs.statSync(beforeSnapshotPath);
      const afterStats = fs.statSync(afterSnapshotPath);
      
      const result: MemlabAnalysisResult = {
        summary,
        leaks,
        allocations,
        recommendations,
        metadata: {
          analysisTimestamp: new Date().toISOString(),
          beforeSnapshotSize: beforeStats.size,
          afterSnapshotSize: afterStats.size,
          memlabVersion: this.getMemlabVersion()
        }
      };
      
      // Save detailed analysis
      const outputPath = path.join(this.config.outputDir, `memlab-analysis-${Date.now()}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      
      console.log(`✅ Memlab analysis complete. Report saved to: ${outputPath}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Memlab analysis failed:', error);
      throw new Error(`Memlab analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Detect memory growth between heaps (simplified)
   */
  private detectMemoryGrowth(beforeHeap: any, afterHeap: any): MemlabLeakInfo[] {
    const leaks: MemlabLeakInfo[] = [];
    
    try {
      // Get basic heap statistics
      const beforeSize = this.getHeapSize(beforeHeap);
      const afterSize = this.getHeapSize(afterHeap);
      const growth = afterSize - beforeSize;
      
      if (growth > this.config.threshold) {
        // Create a simplified leak entry
        leaks.push({
          id: 'heap_growth_1',
          type: 'General Memory Growth',
          retainedSize: growth,
          count: 1,
          severity: this.calculateSeverity(growth)
        });
      }
      
      // Try to get more detailed information if available
      if (beforeHeap.nodes && afterHeap.nodes) {
        const nodeGrowth = this.analyzeNodeGrowth(beforeHeap.nodes, afterHeap.nodes);
        leaks.push(...nodeGrowth);
      }
      
    } catch (error) {
      console.warn('Warning: Could not detect memory growth:', (error as Error).message);
    }
    
    return leaks.slice(0, 10); // Limit to top 10
  }

  /**
   * Analyze node growth patterns
   */
  private analyzeNodeGrowth(beforeNodes: any[], afterNodes: any[]): MemlabLeakInfo[] {
    const leaks: MemlabLeakInfo[] = [];
    
    try {
      // Group nodes by type
      const beforeTypes = this.groupNodesByType(beforeNodes);
      const afterTypes = this.groupNodesByType(afterNodes);
      
      let leakId = 1;
      
      for (const [type, afterData] of afterTypes) {
        const beforeData = beforeTypes.get(type) || { count: 0, size: 0 };
        const sizeGrowth = afterData.size - beforeData.size;
        const countGrowth = afterData.count - beforeData.count;
        
        if (sizeGrowth > this.config.threshold / 10 && countGrowth > 0) {
          leaks.push({
            id: `node_growth_${leakId++}`,
            type: type || 'Unknown',
            retainedSize: sizeGrowth,
            count: countGrowth,
            severity: this.calculateSeverity(sizeGrowth)
          });
        }
      }
      
    } catch (error) {
      console.warn('Warning: Could not analyze node growth:', (error as Error).message);
    }
    
    return leaks.sort((a, b) => b.retainedSize - a.retainedSize).slice(0, 5);
  }

  /**
   * Group nodes by type
   */
  private groupNodesByType(nodes: any[]): Map<string, {count: number; size: number}> {
    const groups = new Map();
    
    for (const node of nodes) {
      const type = node.type || node.name || 'Unknown';
      if (!groups.has(type)) {
        groups.set(type, { count: 0, size: 0 });
      }
      const group = groups.get(type);
      group.count++;
      group.size += node.size || node.selfSize || 0;
    }
    
    return groups;
  }

  /**
   * Analyze allocation patterns
   */
  private analyzeAllocations(beforeHeap: any, afterHeap: any): any {
    const allocations = {
      topAllocators: [] as Array<{name: string; size: number; count: number}>,
      growthPatterns: [] as Array<{type: string; growth: number; trend: 'increasing' | 'stable' | 'decreasing'}>
    };
    
    try {
      if (beforeHeap.nodes && afterHeap.nodes) {
        const beforeTypes = this.groupNodesByType(beforeHeap.nodes);
        const afterTypes = this.groupNodesByType(afterHeap.nodes);
        
        for (const [type, afterData] of afterTypes) {
          const beforeData = beforeTypes.get(type) || { count: 0, size: 0 };
          const growth = afterData.size - beforeData.size;
          
          if (growth > 0) {
            allocations.topAllocators.push({
              name: type,
              size: growth,
              count: afterData.count - beforeData.count
            });
          }
          
          if (Math.abs(growth) > this.config.threshold / 100) {
            allocations.growthPatterns.push({
              type,
              growth,
              trend: growth > this.config.threshold / 100 ? 'increasing' :
                     growth < -this.config.threshold / 100 ? 'decreasing' : 'stable'
            });
          }
        }
        
        // Sort by size
        allocations.topAllocators.sort((a, b) => b.size - a.size);
        allocations.growthPatterns.sort((a, b) => Math.abs(b.growth) - Math.abs(a.growth));
        
        // Limit results
        allocations.topAllocators = allocations.topAllocators.slice(0, 10);
        allocations.growthPatterns = allocations.growthPatterns.slice(0, 10);
      }
    } catch (error) {
      console.warn('Warning: Could not analyze allocations:', (error as Error).message);
    }
    
    return allocations;
  }

  /**
   * Generate analysis summary
   */
  private generateSummary(leaks: MemlabLeakInfo[], beforeHeap: any, afterHeap: any, startTime: number): any {
    const totalLeakSize = leaks.reduce((sum, leak) => sum + leak.retainedSize, 0);
    const totalLeaksMB = totalLeakSize / (1024 * 1024);
    
    const beforeSize = this.getHeapSize(beforeHeap);
    const afterSize = this.getHeapSize(afterHeap);
    const growth = afterSize - beforeSize;
    const memoryEfficiency = beforeSize > 0 ? Math.max(0, (1 - (growth / beforeSize)) * 100) : 100;
    
    return {
      totalLeaksMB,
      leakCount: leaks.length,
      suspiciousGrowth: totalLeaksMB > (this.config.threshold / (1024 * 1024)) || leaks.length > 3,
      confidence: this.calculateConfidence(leaks, totalLeaksMB),
      analysisTime: Date.now() - startTime,
      memoryEfficiency: Math.round(memoryEfficiency * 100) / 100
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(leaks: MemlabLeakInfo[], allocations: any): string[] {
    const recommendations: string[] = [];
    
    if (leaks.length > 0) {
      const criticalLeaks = leaks.filter(leak => leak.severity === 'critical');
      if (criticalLeaks.length > 0) {
        recommendations.push(`🚨 ${criticalLeaks.length} critical memory leaks detected. Review object retention immediately.`);
      }
      
      const mostCommonType = leaks.reduce((acc, leak) => {
        acc[leak.type] = (acc[leak.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const topType = Object.entries(mostCommonType).sort(([,a], [,b]) => b - a)[0];
      if (topType && topType[1] > 1) {
        recommendations.push(`⚠️ Multiple ${topType[0]} objects are leaking. Check for event listener cleanup and circular references.`);
      }
    }
    
    if (allocations.topAllocators.length > 0) {
      const topAllocator = allocations.topAllocators[0];
      recommendations.push(`📈 Highest growth in ${topAllocator.name} (+${(topAllocator.size / (1024 * 1024)).toFixed(2)}MB). Review allocation patterns.`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ No significant memory issues detected. Memory usage appears stable.');
    }
    
    recommendations.push('💡 Use weak references for caches and consider object pooling for frequently allocated objects.');
    recommendations.push('🔍 Enable heap profiling in production with sampling to monitor long-term trends.');
    
    return recommendations;
  }

  /**
   * Helper methods
   */
  private getHeapSize(heap: any): number {
    try {
      return heap.totalSize || heap.size || (heap.nodes ? heap.nodes.length * 100 : 0);
    } catch {
      return 0;
    }
  }

  private calculateSeverity(retainedSize: number): 'critical' | 'high' | 'medium' | 'low' {
    const sizeMB = retainedSize / (1024 * 1024);
    if (sizeMB > 50) return 'critical';
    if (sizeMB > 10) return 'high';
    if (sizeMB > 1) return 'medium';
    return 'low';
  }

  private calculateConfidence(leaks: MemlabLeakInfo[], totalLeaksMB: number): number {
    let confidence = 0.7; // Higher base confidence for memlab
    
    if (leaks.length > 0) {
      confidence += Math.min(leaks.length * 0.05, 0.2);
    }
    
    if (totalLeaksMB > 1) {
      confidence += Math.min(totalLeaksMB * 0.02, 0.1);
    }
    
    return Math.min(confidence, 1.0);
  }

  private getMemlabVersion(): string {
    try {
      const packageJson = require('@memlab/core/package.json');
      return packageJson.version;
    } catch {
      return 'unknown';
    }
  }
}

/**
 * Convenience function for quick analysis
 */
export async function analyzeWithMemlab(
  beforeSnapshotPath: string, 
  afterSnapshotPath: string,
  config: MemlabAnalysisConfig = { threshold: 1024 * 1024 }
): Promise<MemlabAnalysisResult> {
  const analyzer = new MemlabHeapAnalyzer(config);
  return analyzer.analyze(beforeSnapshotPath, afterSnapshotPath);
}
