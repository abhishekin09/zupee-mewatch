import MemWatch from 'zupee-memwatch';

const serviceName = process.env.MEMWATCH_SERVICE_NAME || 'simple-test-service';
const dashboardUrl = process.env.MEMWATCH_DASHBOARD_URL || 'ws://localhost:4000';

console.log(`[demo] starting ${serviceName}, dashboard: ${dashboardUrl}`);

MemWatch.start({
  serviceName,
  dashboardUrl,
  checkInterval: 5000,
  leakThresholdMB: 20,
  enableHeapSnapshots: false,
});

let bag = [];
setInterval(() => {
  // normal work
  const tmp = Array.from({ length: 5000 }, (_, i) => ({ i, s: 'x'.repeat(50) }));
  // occasional retained refs to simulate growth
  if (Math.random() > 0.7) bag.push(tmp);
  if (bag.length > 50) bag.shift();
}, 1000);

process.on('SIGINT', () => { MemWatch.stop(); process.exit(0); });
