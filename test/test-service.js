import MemWatch from '../dist/index.js';

/**
 * Test Service for Zupee MemWatch
 * Simulates various memory usage patterns for testing leak detection
 */
class TestService {
  constructor() {
    this.leakData = [];
    this.intervalId = null;
    this.serviceName = 'test-service';
    this.shouldSimulateLeak = false;
    this.simulationIntensity = 1;
  }

  parseArgs() {
    const args = process.argv.slice(2);
    
    // Check for simulation mode
    if (args.includes('--simulate-leak')) {
      this.shouldSimulateLeak = true;
      console.log('🧪 Memory leak simulation enabled');
    }
    
    // Check for intensity level
    const intensityArg = args.find(arg => arg.startsWith('--intensity='));
    if (intensityArg) {
      this.simulationIntensity = parseInt(intensityArg.split('=')[1]) || 1;
      console.log(`🎛️  Simulation intensity: ${this.simulationIntensity}`);
    }
    
    // Check for custom service name
    const nameArg = args.find(arg => arg.startsWith('--name='));
    if (nameArg) {
      this.serviceName = nameArg.split('=')[1] || 'test-service';
      console.log(`🏷️  Service name: ${this.serviceName}`);
    }
  }

  start() {
    this.parseArgs();
    
    console.log(`🚀 Starting ${this.serviceName}...`);
    
    // Start Zupee MemWatch agent
    MemWatch.start({
      serviceName: this.serviceName,
      dashboardUrl: 'ws://localhost:4000',
      checkInterval: 5000, // Check every 5 seconds for demo
      leakThresholdMB: 20,  // Lower threshold for demo
      enableHeapSnapshots: true,
      snapshotPath: './snapshots'
    });

    // Start simulated workload
    this.startWorkload();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down test service...');
      this.stop();
      process.exit(0);
    });

    console.log(`✅ ${this.serviceName} is running`);
    console.log('💾 Zupee MemWatch monitoring active');
    console.log('📊 Dashboard: http://localhost:3000');
    console.log('🔌 Press Ctrl+C to stop');
    
    if (this.shouldSimulateLeak) {
      console.log('⚠️  Memory leak simulation in progress...');
    }
  }

  startWorkload() {
    let operationCount = 0;
    
    this.intervalId = setInterval(() => {
      operationCount++;
      
      // Normal workload - some memory allocation and deallocation
      this.simulateNormalWork();
      
      // Memory leak simulation
      if (this.shouldSimulateLeak) {
        this.simulateMemoryLeak();
      }
      
      // Log progress every 20 operations
      if (operationCount % 20 === 0) {
        const memUsage = process.memoryUsage();
        const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
        const rssMB = (memUsage.rss / 1024 / 1024).toFixed(1);
        
        console.log(`📈 Operation ${operationCount}: Heap ${heapUsedMB}MB, RSS ${rssMB}MB`);
        
        if (this.shouldSimulateLeak) {
          console.log(`🕳️  Leak data size: ${this.leakData.length} objects`);
        }
      }
      
    }, 1000); // Run every second
  }

  simulateNormalWork() {
    // Simulate normal application work with temporary allocations
    const tempData = [];
    
    // Create some temporary objects
    for (let i = 0; i < 100; i++) {
      tempData.push({
        id: Math.random(),
        data: new Array(100).fill('normal-work-data'),
        timestamp: Date.now()
      });
    }
    
    // Simulate some processing
    const processed = tempData.map(item => ({
      ...item,
      processed: true,
      hash: item.id.toString().slice(0, 8)
    }));
    
    // Let these objects be garbage collected naturally
  }

  simulateMemoryLeak() {
    // Create objects that are intentionally retained and never released
    const leakSize = 50 * this.simulationIntensity;
    
    for (let i = 0; i < leakSize; i++) {
      const objectSize = Math.floor(Math.random() * 1000) + 100;
      
      const leakedObject = {
        id: `leak-${Date.now()}-${i}`,
        data: new Array(objectSize).fill('leaked-data-' + Math.random()),
        timestamp: Date.now(),
        references: [],
        metadata: {
          type: 'simulated-leak',
          size: objectSize,
          created: new Date().toISOString()
        }
      };
      
      // Add circular references
      leakedObject.self = leakedObject;
      
      // Add to our leak array (this prevents GC)
      this.leakData.push(leakedObject);
      
      // Reference previous objects occasionally
      if (this.leakData.length > 10 && Math.random() > 0.7) {
        const randomPrevious = this.leakData[Math.floor(Math.random() * this.leakData.length)];
        leakedObject.references.push(randomPrevious);
      }
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    MemWatch.stop();
    
    console.log('🛑 Test service stopped');
    console.log(`📊 Final leak data size: ${this.leakData.length} objects`);
  }

  // Manual trigger methods for testing
  triggerMajorLeak() {
    console.log('💥 Triggering major memory leak...');
    
    for (let i = 0; i < 1000; i++) {
      this.leakData.push({
        id: `major-leak-${i}`,
        data: new Array(5000).fill('major-leak-data'),
        timestamp: Date.now()
      });
    }
  }

  clearLeaks() {
    console.log('🧹 Clearing simulated leaks...');
    this.leakData = [];
    
    if (global.gc) {
      global.gc();
      console.log('🗑️  Garbage collection triggered');
    }
  }
}

// Command-line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const testService = new TestService();
  
  // Expose methods for manual testing
  global.testService = testService;
  global.triggerLeak = () => testService.triggerMajorLeak();
  global.clearLeaks = () => testService.clearLeaks();
  
  console.log('🧪 Zupee MemWatch Test Service');
  console.log('');
  console.log('Usage:');
  console.log('  node test-service.js                    # Normal operation');
  console.log('  node test-service.js --simulate-leak    # Simulate memory leaks');
  console.log('  node test-service.js --intensity=2      # Increase leak intensity');
  console.log('  node test-service.js --name=my-service  # Custom service name');
  console.log('');
  console.log('Manual triggers (in Node.js REPL):');
  console.log('  triggerLeak()    # Trigger major leak');
  console.log('  clearLeaks()     # Clear all simulated leaks');
  console.log('');
  
  testService.start();
}
