import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svc = new Service({
  name: 'DeepResearchService',
  description: 'Deep Research web crawler and summarization service.',
  script: path.join(__dirname, 'server.js'),
  workingDirectory: __dirname,
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ]
});

svc.on('install', function () {
  console.log('Install complete.');
  console.log('Starting the service...');
  svc.start();
  console.log('Service started. Check Windows Services (services.msc) or Event Viewer for logs.');
});

svc.on('alreadyinstalled', function () {
  console.log('This service is already installed.');
});

svc.on('error', function (err) {
  console.error('Service installation error:', err);
});

console.log('Attempting to install DeepResearchService...');
svc.install();
