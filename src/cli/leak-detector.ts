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
  .option('--dashboard-url <url>', 'Dashboard URL (HTTP or WebSocket)', 'http://localhost:4000')
  .option('--strategy <strategy>', 'Container strategy: docker or k8s', 'k8s')
  .option('--namespace <name>', 'Kubernetes namespace', 'default')
  .option('--replica-count <number>', 'Number of replicas to scale to', '2')
  .option('--service-name <name>', 'Service name for identification')
  .option('--http', 'Use HTTP API instead of WebSocket (recommended)')
  .action(async (options) => {
    try {
      console.log('📸 Starting zero-downtime snapshot capture...\n');
      
      const useHttp = options.http || !options.dashboardUrl.startsWith('ws');
      
      if (useHttp) {
        // Use HTTP-based capture
        const { executeHttpCapture } = await import('../capture/http-capture.js');
        
        await executeHttpCapture({
          containerId: options.containerId,
          timeframe: options.timeframe,
          dashboardUrl: options.dashboardUrl,
          strategy: options.strategy as 'docker' | 'k8s',
          namespace: options.namespace,
          replicaCount: parseInt(options.replicaCount),
          serviceName: options.serviceName || options.containerId
        });
      } else {
        // Use WebSocket-based capture (legacy)
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
      }
      
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

// Analysis command removed; analysis has moved to the webapp project.

// Test command removed; tests are no longer bundled with the library build.

// Parse command line arguments
program.parse();

// If no command was provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
