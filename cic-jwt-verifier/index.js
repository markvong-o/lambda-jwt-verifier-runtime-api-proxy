#!/usr/bin/env node
const ExtensionsApiClient = require('./extensionsApiClient');
const RuntimeApiProxy = require('./runtimeApiProxy');

(async function main() {
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  
  console.log('[CJV] starting...');

  new RuntimeApiProxy().start();
  new ExtensionsApiClient().bootstrap();

})();
