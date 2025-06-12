import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svc = new Service({
  name: 'DeepResearchService',
  description: 'Deep Research web crawler and summarization service.',
  script: path.join(__dirname, 'server.js')
});

svc.on('uninstall', function () {
  console.log('Uninstall complete.');
  console.log('The service exists: ', svc.exists);
});

svc.on('error', function (err) {
  console.error('Service uninstallation error:', err);
});

svc.on('notuninstalled', function () {
    console.log('Service is not installed or could not be uninstalled.');
});

console.log('Attempting to uninstall DeepResearchService...');
svc.uninstall();
