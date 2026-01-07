import 'dotenv/config';
import { startAllWorkers } from '@insight-os/jobs';

console.log('🚀 Starting InsightOS Worker...');

const workers = startAllWorkers();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down workers...');
  await Promise.all([
    workers.documentWorker.close(),
    workers.workflowWorker.close(),
  ]);
  process.exit(0);
});

