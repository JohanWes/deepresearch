import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a new service object
const svc = new Service({
  name: 'DeepResearchService', // Updated service name
  description: 'Deep Research web crawler and summarization service.', // Updated description
  // Point to the main server script in the project root
  script: path.join(__dirname, 'server.js'),
  // Set the working directory to the project root
  workingDirectory: __dirname,
  // Optional: Set environment variables if needed directly by the service wrapper
  // (server.js should handle dotenv loading itself)
  // env: [
  //   {
  //     name: "NODE_ENV",
  //     value: "production"
  //   },
  //   // Add other critical env vars if server.js doesn't load .env early enough
  // ],
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096' // Optional: Adjust memory limit if needed
  ]
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install', function () {
  console.log('Install complete.');
  console.log('Starting the service...');
  svc.start();
  console.log('Service started. Check Windows Services (services.msc) or Event Viewer for logs.');
});

// Listen for the "alreadyinstalled" event
svc.on('alreadyinstalled', function () {
  console.log('This service is already installed.');
});

// Listen for the "error" event
svc.on('error', function (err) {
  console.error('Service installation error:', err);
});

// Install the service.
console.log('Attempting to install DeepResearchService...');
svc.install();
