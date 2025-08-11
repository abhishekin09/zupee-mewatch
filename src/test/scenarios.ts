import { LeakDetectionController, InContainerSnapshotTrigger } from '../leak-detector.js';
import { analyzeSnapshots } from '../analysis/snapshot-analyzer.js';
import fs from 'fs';
import path from 'path';

/**
 * Test scenario configurations
 */
interface TestScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  simulate: () => Promise<void>;
  cleanup: () => Promise<void>;
  expectedResult: 'leak' | 'no-leak';
}

/**
 * Memory leak simulation class for testing
 */
class MemoryLeakSimulator {
  private leakyData: any[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private bigObjects: Map<string, any> = new Map();

  /**
   * Simulate a growing array leak
   */
  startArrayLeak(itemsPerSecond: number = 1000): void {
    this.intervalId = setInterval(() => {
      // Create objects that won't be garbage collected
      const leak = new Array(itemsPerSecond).fill(0).map((_, i) => ({
        id: Date.now() + i,
        data: 'x'.repeat(1024), // 1KB per object
        timestamp: new Date().toISOString(),
        metadata: {
          created: Date.now(),
          random: Math.random(),
          nested: {
            deep: {
              value: Math.random().toString(36)
            }
          }
        }
      }));
      
      this.leakyData.push(...leak);
      
      // Also leak some in the Map
      this.bigObjects.set(Date.now().toString(), leak);
      
    }, 1000);
  }

  /**
   * Simulate closure-based leak
   */
  startClosureLeak(): void {
    const createLeakyClosures = () => {
      const largeData = new Array(10000).fill('leaked-closure-data');
      
      // Create closures that capture largeData
      const closures = [];
      for (let i = 0; i < 100; i++) {
        closures.push(() => {
          return largeData.length + i; // Captures largeData
        });
      }
      
      // Store closures so they don't get GC'd
      this.leakyData.push(closures);
    };

    this.intervalId = setInterval(createLeakyClosures, 2000);
  }

  /**
   * Simulate EventEmitter leak
   */
  startEventEmitterLeak(): void {
    const { EventEmitter } = require('events');
    const emitters: any[] = [];

    this.intervalId = setInterval(() => {
      const emitter = new EventEmitter();
      
      // Add many listeners that won't be removed
      for (let i = 0; i < 50; i++) {
        const largeData = new Array(1000).fill(`listener-data-${i}`);
        emitter.on('event', () => {
          // This closure captures largeData
          return largeData.length;
        });
      }
      
      emitters.push(emitter);
      this.leakyData.push(emitter);
    }, 1000);
  }

  /**
   * Stop the leak simulation
   */
  stopLeak(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Clear all leaked data
   */
  clearLeaks(): void {
    this.stopLeak();
    this.leakyData = [];
    this.bigObjects.clear();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Get current leak statistics
   */
  getLeakStats(): {
    arrayItems: number;
    mapItems: number;
    totalMemoryMB: number;
  } {
    const memUsage = process.memoryUsage();
    
    return {
      arrayItems: this.leakyData.length,
      mapItems: this.bigObjects.size,
      totalMemoryMB: memUsage.heapUsed / (1024 * 1024)
    };
  }
}

// Global simulator instance
const simulator = new MemoryLeakSimulator();

/**
 * Define test scenarios
 */
const testScenarios: Record<string, TestScenario> = {
  basic: {
    name: 'Basic Snapshot Test',
    description: 'Test snapshot creation without memory leaks',
    setup: async () => {
      console.log('🔧 Setting up basic test scenario');
    },
    simulate: async () => {
      console.log('⚡ Running normal workload simulation');
      // Just normal memory allocation that will be GC'd
      for (let i = 0; i < 10; i++) {
        const temp = new Array(1000).fill('temp-data');
        await new Promise(resolve => setTimeout(resolve, 100));
        // temp goes out of scope and can be GC'd
      }
      
      if (global.gc) {
        global.gc();
      }
    },
    cleanup: async () => {
      console.log('🧹 Cleaning up basic test');
    },
    expectedResult: 'no-leak'
  },

  leak: {
    name: 'Memory Leak Simulation',
    description: 'Simulate various types of memory leaks',
    setup: async () => {
      console.log('🔧 Setting up memory leak simulation');
    },
    simulate: async () => {
      console.log('💣 Starting memory leak simulation');
      
      // Start array leak
      simulator.startArrayLeak(2000); // 2000 items per second
      
      // Let it run for a bit
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
      
      console.log('📊 Leak stats:', simulator.getLeakStats());
    },
    cleanup: async () => {
      console.log('🧹 Cleaning up leak simulation');
      simulator.clearLeaks();
    },
    expectedResult: 'leak'
  },

  closure: {
    name: 'Closure Leak Test',
    description: 'Test detection of closure-based memory leaks',
    setup: async () => {
      console.log('🔧 Setting up closure leak test');
    },
    simulate: async () => {
      console.log('🔗 Starting closure leak simulation');
      simulator.startClosureLeak();
      
      await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds
      
      console.log('📊 Leak stats:', simulator.getLeakStats());
    },
    cleanup: async () => {
      console.log('🧹 Cleaning up closure test');
      simulator.clearLeaks();
    },
    expectedResult: 'leak'
  },

  eventEmitter: {
    name: 'EventEmitter Leak Test',
    description: 'Test detection of EventEmitter listener leaks',
    setup: async () => {
      console.log('🔧 Setting up EventEmitter leak test');
    },
    simulate: async () => {
      console.log('📡 Starting EventEmitter leak simulation');
      simulator.startEventEmitterLeak();
      
      await new Promise(resolve => setTimeout(resolve, 12000)); // 12 seconds
      
      console.log('📊 Leak stats:', simulator.getLeakStats());
    },
    cleanup: async () => {
      console.log('🧹 Cleaning up EventEmitter test');
      simulator.clearLeaks();
    },
    expectedResult: 'leak'
  },

  cleanup: {
    name: 'Cleanup Verification',
    description: 'Verify that memory returns to baseline after cleanup',
    setup: async () => {
      console.log('🔧 Setting up cleanup verification');
      // Start with a leak
      simulator.startArrayLeak(1000);
      await new Promise(resolve => setTimeout(resolve, 5000));
    },
    simulate: async () => {
      console.log('🧽 Testing cleanup effectiveness');
      
      const beforeCleanup = simulator.getLeakStats();
      console.log('Before cleanup:', beforeCleanup);
      
      // Clean up
      simulator.clearLeaks();
      
      // Wait for GC
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const afterCleanup = simulator.getLeakStats();
      console.log('After cleanup:', afterCleanup);
      
      // Verify cleanup was effective
      if (afterCleanup.arrayItems === 0 && afterCleanup.mapItems === 0) {
        console.log('✅ Cleanup successful');
      } else {
        console.log('❌ Cleanup may not have been fully effective');
      }
    },
    cleanup: async () => {
      console.log('🧹 Final cleanup');
      simulator.clearLeaks();
    },
    expectedResult: 'no-leak'
  }
};

/**
 * Run a specific test scenario
 */
export async function runTestScenario(scenarioName: string): Promise<void> {
  const scenario = testScenarios[scenarioName];
  
  if (!scenario) {
    throw new Error(`Unknown test scenario: ${scenarioName}. Available: ${Object.keys(testScenarios).join(', ')}`);
  }

  console.log(`\n🧪 Running Test Scenario: ${scenario.name}`);
  console.log(`📝 Description: ${scenario.description}`);
  console.log(`🎯 Expected Result: ${scenario.expectedResult}\n`);

  try {
    // Setup
    await scenario.setup();

    // Take before snapshot
    const trigger = new InContainerSnapshotTrigger();
    const outputDir = './test-snapshots';
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const beforePath = path.join(outputDir, `before_${scenarioName}_${Date.now()}.heapsnapshot`);
    console.log('📸 Taking before snapshot...');
    
    const beforeSuccess = await trigger.takeSnapshot(beforePath);
    if (!beforeSuccess) {
      throw new Error('Failed to take before snapshot');
    }

    // Run simulation
    await scenario.simulate();

    // Take after snapshot
    const afterPath = path.join(outputDir, `after_${scenarioName}_${Date.now()}.heapsnapshot`);
    console.log('📸 Taking after snapshot...');
    
    const afterSuccess = await trigger.takeSnapshot(afterPath);
    if (!afterSuccess) {
      throw new Error('Failed to take after snapshot');
    }

    // Analyze snapshots
    console.log('🔬 Analyzing snapshots...');
    const analysis = await analyzeSnapshots(beforePath, afterPath, {
      threshold: 5 * 1024 * 1024 // 5MB threshold for tests
    });

    // Verify results
    const actualResult = analysis.summary.suspiciousGrowth ? 'leak' : 'no-leak';
    const testPassed = actualResult === scenario.expectedResult;

    console.log('\n📊 TEST RESULTS');
    console.log('===============');
    console.log(`Expected: ${scenario.expectedResult}`);
    console.log(`Actual: ${actualResult}`);
    console.log(`Growth: ${analysis.summary.totalGrowthMB.toFixed(2)} MB`);
    console.log(`Confidence: ${(analysis.summary.confidence * 100).toFixed(1)}%`);
    console.log(`Status: ${testPassed ? '✅ PASSED' : '❌ FAILED'}`);

    if (analysis.offenders.length > 0) {
      console.log('\nTop Offenders:');
      analysis.offenders.slice(0, 3).forEach((offender, i) => {
        console.log(`${i + 1}. ${offender.type}: +${(offender.deltaSize / (1024 * 1024)).toFixed(2)} MB (${offender.severity})`);
      });
    }

    if (analysis.summary.recommendations.length > 0) {
      console.log('\nRecommendations:');
      analysis.summary.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }

    // Cleanup
    await scenario.cleanup();

    if (!testPassed) {
      throw new Error(`Test failed: expected ${scenario.expectedResult}, got ${actualResult}`);
    }

  } catch (error) {
    // Ensure cleanup runs even on error
    try {
      await scenario.cleanup();
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    
    throw error;
  }
}

/**
 * Run all test scenarios
 */
export async function runAllTestScenarios(): Promise<void> {
  const scenarios = Object.keys(testScenarios);
  let passed = 0;
  let failed = 0;

  console.log(`🚀 Running ${scenarios.length} test scenarios...\n`);

  for (const scenarioName of scenarios) {
    try {
      await runTestScenario(scenarioName);
      passed++;
      console.log(`✅ ${scenarioName} PASSED\n`);
    } catch (error) {
      failed++;
      console.error(`❌ ${scenarioName} FAILED:`, error);
      console.log(''); // Empty line for spacing
    }
  }

  console.log('📈 FINAL RESULTS');
  console.log('================');
  console.log(`Passed: ${passed}/${scenarios.length}`);
  console.log(`Failed: ${failed}/${scenarios.length}`);
  console.log(`Success Rate: ${((passed / scenarios.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    throw new Error(`${failed} test scenarios failed`);
  }
}

/**
 * Export the simulator for external use
 */
export { MemoryLeakSimulator, simulator };
