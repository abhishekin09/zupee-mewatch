#!/usr/bin/env node

import { Command } from 'commander';
import { LeakDetectionController, InContainerSnapshotTrigger } from '../leak-detector.js';
import path from 'path';

const program = new Command();

program
  .name('leak-detector')
  .description('Automated heap snapshot leak detection for Node.js containers')
  .version('1.0.0');

// External controller command
program
  .command('run')
  .description('Run automated leak detection with container replacement')
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

// Analyze snapshots command
program
  .command('analyze')
  .description('Analyze heap snapshots for memory leaks')
  .requiredOption('--before <path>', 'Path to before snapshot')
  .requiredOption('--after <path>', 'Path to after snapshot')
  .option('--output <path>', 'Output path for analysis report', './leak-analysis.json')
  .option('--threshold <bytes>', 'Bytes increase considered a leak', '10485760')
  .action(async (options) => {
    try {
      console.log('🔬 Analyzing heap snapshots...');
      
      // Import the analysis engine (to be implemented)
      const { HeapSnapshotAnalyzer } = await import('../analysis/snapshot-analyzer.js');
      
      const analyzer = new HeapSnapshotAnalyzer({
        threshold: parseInt(options.threshold)
      });
      
      const analysis = await analyzer.compare(options.before, options.after);
      
      // Save analysis
      const fs = await import('fs');
      fs.writeFileSync(options.output, JSON.stringify(analysis, null, 2));
      
      // Print summary
      console.log('\n📊 ANALYSIS RESULTS');
      console.log('==================');
      console.log(`Growth: ${analysis.summary.totalGrowthMB.toFixed(2)} MB`);
      console.log(`Suspicious: ${analysis.summary.suspiciousGrowth ? 'YES' : 'NO'}`);
      
      if (analysis.offenders.length > 0) {
        console.log('\nTop Offenders:');
        analysis.offenders.slice(0, 3).forEach((offender, i) => {
          console.log(`${i + 1}. ${offender.type}: +${(offender.deltaSize / (1024 * 1024)).toFixed(2)} MB`);
        });
      }
      
      console.log(`\n📄 Full report: ${options.output}`);
      
      process.exit(analysis.summary.suspiciousGrowth ? 1 : 0);
      
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
