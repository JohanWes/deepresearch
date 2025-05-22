import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a new service object (needs the same name and script path as install)
const svc = new Service({
  name: 'DeepResearchService', // Must match the install script
  description: 'Deep Research web crawler and summarization service.', // Must match the install script
  script: path.join(__dirname, 'server.js') // Must match the install script
});

// Listen for the "uninstall" event so we know when it's done.
svc.on('uninstall', function () {
  console.log('Uninstall complete.');
  console.log('The service exists: ', svc.exists);
});

// Listen for the "error" event
svc.on('error', function (err) {
  console.error('Service uninstallation error:', err);
});

// Listen for the "notuninstalled" event
svc.on('notuninstalled', function () {
    console.log('Service is not installed or could not be uninstalled.');
});

// Uninstall the service.
console.log('Attempting to uninstall DeepResearchService...');
svc.uninstall();
