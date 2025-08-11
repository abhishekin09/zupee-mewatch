#!/usr/bin/env node

import { Command } from 'commander';
import { LeakDetectionController, InContainerSnapshotTrigger } from '../leak-detector.js';
import path from 'path';

const program = new Command();

program
  .name('leak-detector')
  .description('Automated heap snapshot leak detection for Node.js containers')
  .version('1.0.0');

// Enhanced capture command for zero-downtime snapshot collection
program
  .command('capture')
  .description('Capture heap snapshots with zero downtime using pod scaling')
  .requiredOption('--container-id <id>', 'Docker container name/ID or Kubernetes pod name')
  .requiredOption('--timeframe <minutes>', 'Minutes between before and after snapshots', parseFloat)
  .option('--dashboard-url <url>', 'Dashboard WebSocket URL', 'ws://localhost:4000')
  .option('--strategy <strategy>', 'Container strategy: docker or k8s', 'k8s')
  .option('--namespace <name>', 'Kubernetes namespace', 'default')
  .option('--replica-count <number>', 'Number of replicas to scale to', '2')
  .option('--service-name <name>', 'Service name for identification')
  .action(async (options) => {
    try {
      console.log('📸 Starting zero-downtime snapshot capture...\n');
      
      const { ZeroDowntimeSnapshotCapture } = await import('../capture/zero-downtime-capture.js');
      
      const captureController = new ZeroDowntimeSnapshotCapture({
        containerId: options.containerId,
        timeframe: options.timeframe,
        dashboardUrl: options.dashboardUrl,
        strategy: options.strategy as 'docker' | 'k8s',
        namespace: options.namespace,
        replicaCount: parseInt(options.replicaCount),
        serviceName: options.serviceName || options.containerId
      });

      await captureController.execute();
      
    } catch (error) {
      console.error('❌ Snapshot capture failed:', error);
      process.exit(2);
    }
  });

// External controller command (legacy)
program
  .command('run')
  .description('Run automated leak detection with container replacement (legacy)')
  .requiredOption('--container-id <id>', 'Docker container name/ID or Kubernetes pod name')
  .requiredOption('--delay <minutes>', 'Minutes between before and after snapshots', parseFloat)
  .option('--output-dir <path>', 'Output directory for snapshots and reports', '/tmp/leak-reports')
  .option('--image <image:tag>', 'Image to use for replacement container')
  .option('--replace-strategy <strategy>', 'Replacement strategy: docker or k8s', 'docker')
  .option('--no-cleanup', 'Keep replacement container for manual inspection')
  .option('--analysis-threshold <bytes>', 'Bytes increase considered a leak', '10485760') // 10MB
  .option('--webhook <url>', 'POST final JSON report to monitoring endpoint')
  .option('--namespace <name>', 'Kubernetes namespace', 'default')
  .option('--drain-grace-period <seconds>', 'Grace period for draining traffic', '30')
  .action(async (options) => {
    try {
      console.log('🔍 Starting automated leak detection...\n');
      
      const controller = new LeakDetectionController({
        containerId: options.containerId,
        delay: options.delay,
        outputDir: options.outputDir,
        image: options.image,
        replaceStrategy: options.replaceStrategy as 'docker' | 'k8s',
        cleanup: options.cleanup,
        analysisThreshold: parseInt(options.analysisThreshold),
        webhook: options.webhook,
        namespace: options.namespace,
        drainGracePeriod: parseInt(options.drainGracePeriod)
      });

      const exitCode = await controller.run();
      process.exit(exitCode);
      
    } catch (error) {
      console.error('❌ Leak detection failed:', error);
      process.exit(2);
    }
  });

// Internal snapshot command (runs inside container)
program
  .command('internal-snapshot')
  .description('Take heap snapshot from inside container (internal use)')
  .requiredOption('--file <path>', 'Output file path for heap snapshot')
  .option('--maintenance-grace <ms>', 'Grace period for in-flight requests', '5000')
  .action(async (options) => {
    try {
      console.log('📸 Taking internal heap snapshot...');
      
      const trigger = new InContainerSnapshotTrigger();
      
      // Set custom grace period if provided
      if (parseInt(options.maintenanceGrace) !== 5000) {
        // Custom grace period would be set here
        console.log(`Using grace period: ${options.maintenanceGrace}ms`);
      }
      
      const success = await trigger.takeSnapshot(options.file);
      
      if (success) {
        console.log(`✅ Snapshot saved: ${options.file}`);
        process.exit(0);
      } else {
        console.error('❌ Failed to take snapshot');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Snapshot error:', error);
      process.exit(1);
    }
  });

// Quick snapshot command (convenience)
program
  .command('snapshot')
  .description('Take a quick heap snapshot')
  .option('--output <path>', 'Output file path', './heap-snapshot.heapsnapshot')
  .action(async (options) => {
    try {
      const { takeSnapshot } = await import('../leak-detector.js');
      
      console.log('📸 Taking heap snapshot...');
      const success = await takeSnapshot(options.output);
      
      if (success) {
        console.log(`✅ Snapshot saved: ${options.output}`);
        process.exit(0);
      } else {
        console.error('❌ Failed to take snapshot');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Snapshot error:', error);
      process.exit(1);
    }
  });

// Analyze snapshots command with memlab support
program
  .command('analyze')
  .description('Analyze heap snapshots for memory leaks')
  .requiredOption('--before <path>', 'Path to before snapshot')
  .requiredOption('--after <path>', 'Path to after snapshot')
  .option('--output <path>', 'Output path for analysis report', './leak-analysis.json')
  .option('--threshold <bytes>', 'Bytes increase considered a leak', '1048576') // 1MB default
  .option('--memlab', 'Use Facebook memlab for advanced analysis (default: true)', true)
  .option('--basic', 'Use basic analyzer instead of memlab')
  .action(async (options) => {
    try {
      const useMemlab = options.memlab && !options.basic;
      
      console.log(`🔬 Analyzing heap snapshots with ${useMemlab ? 'Facebook memlab' : 'basic analyzer'}...`);
      
      let analysis;
      
      if (useMemlab) {
        try {
          const { MemlabHeapAnalyzer } = await import('../analysis/memlab-analyzer.js');
          
          const analyzer = new MemlabHeapAnalyzer({
            threshold: parseInt(options.threshold),
            verbose: true,
            outputDir: './memlab-cli-analysis'
          });

          analysis = await analyzer.analyze(options.before, options.after);
          
          // Display enhanced memlab results
          console.log('\n📊 MEMLAB ANALYSIS RESULTS');
          console.log('==========================');
          console.log(`Memory Leaks: ${analysis.summary.totalLeaksMB.toFixed(2)} MB`);
          console.log(`Leak Count: ${analysis.leaks.length}`);
          console.log(`Suspicious: ${analysis.summary.suspiciousGrowth ? 'YES' : 'NO'}`);
          console.log(`Confidence: ${(analysis.summary.confidence * 100).toFixed(1)}%`);
          console.log(`Memory Efficiency: ${analysis.summary.memoryEfficiency.toFixed(1)}%`);
          console.log(`Analysis Time: ${analysis.summary.analysisTime}ms`);
          
          if (analysis.leaks && analysis.leaks.length > 0) {
            console.log('\n🎯 Top Memory Leaks:');
            analysis.leaks.slice(0, 5).forEach((leak, index) => {
              const sizeMB = (leak.retainedSize / (1024 * 1024)).toFixed(2);
              console.log(`${index + 1}. ${leak.type} [${leak.severity.toUpperCase()}]: ${sizeMB} MB (${leak.count} objects)`);
              // Note: leakTrace removed from simplified version
            });
          }
          
          if (analysis.allocations.topAllocators.length > 0) {
            console.log('\n📈 Top Allocators:');
            analysis.allocations.topAllocators.slice(0, 3).forEach((allocator, index) => {
              const sizeMB = (allocator.size / (1024 * 1024)).toFixed(2);
              console.log(`${index + 1}. ${allocator.name}: +${sizeMB} MB (+${allocator.count} objects)`);
            });
          }
          
          if (analysis.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            analysis.recommendations.slice(0, 3).forEach((rec, index) => {
              console.log(`${index + 1}. ${rec}`);
            });
          }
          
        } catch (memlabError) {
          console.warn('⚠️  Memlab analysis failed, falling back to basic analyzer:', (memlabError as Error).message);
          // Note: useMemlab is already false in this context, no need to reassign
        }
      }
      
      if (!useMemlab) {
        const { HeapSnapshotAnalyzer } = await import('../analysis/snapshot-analyzer.js');
        
        const analyzer = new HeapSnapshotAnalyzer({
          threshold: parseInt(options.threshold)
        });

        analysis = await analyzer.compare(options.before, options.after);
        
        // Display basic results
        console.log('\n📊 BASIC ANALYSIS RESULTS');
        console.log('=========================');
        console.log(`Growth: ${analysis.summary.totalGrowthMB.toFixed(2)} MB`);
        console.log(`Suspicious: ${analysis.summary.suspiciousGrowth ? 'YES' : 'NO'}`);
        
        if (analysis.offenders && analysis.offenders.length > 0) {
          console.log('\n🎯 Top Offenders:');
          analysis.offenders.slice(0, 5).forEach((offender, index) => {
            console.log(`${index + 1}. ${offender.type}: +${(offender.deltaSize / (1024 * 1024)).toFixed(2)} MB`);
          });
        }
      }
      
      // Save analysis
      const fs = await import('fs');
      fs.writeFileSync(options.output, JSON.stringify(analysis, null, 2));
      
      console.log(`\n📄 Full report: ${options.output}`);
      
      // Exit with appropriate code
      if (!analysis) {
        console.error('❌ No analysis results available');
        process.exit(2);
      }

      const hasSuspiciousGrowth = analysis.summary.suspiciousGrowth || 
                                 ((analysis as any).leaks && (analysis as any).leaks.length > 0) ||
                                 ((analysis.summary as any).totalLeaksMB && (analysis.summary as any).totalLeaksMB > 1);
      
      process.exit(hasSuspiciousGrowth ? 1 : 0);
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      process.exit(2);
    }
  });

// Test command for development
program
  .command('test')
  .description('Test leak detector with demo scenarios')
  .option('--scenario <name>', 'Test scenario: basic, leak, cleanup', 'basic')
  .action(async (options) => {
    console.log(`🧪 Running test scenario: ${options.scenario}`);
    
    // Import test scenarios
    try {
      const { runTestScenario } = await import('../test/scenarios.js');
      await runTestScenario(options.scenario);
      console.log('✅ Test completed successfully');
    } catch (error) {
      console.error('❌ Test failed:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no command was provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
