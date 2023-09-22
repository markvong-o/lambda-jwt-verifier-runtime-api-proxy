#!/usr/bin/env node
const RuntimeApiProxy = require('./runtimeApiProxy');
const ExtensionController = require('./extensionController');

const EventType = {
  INVOKE: 'INVOKE',
  SHUTDOWN: 'SHUTDOWN',
};
function handleShutdown(event) {
  console.log('shutdown', { event });
  process.exit(0);
}
function handleInvoke(event) {
  console.log('invoke');
}

(async function main() {
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  await new RuntimeApiProxy().start();

  console.log('Register extension');
  const extensionId = await new ExtensionController().register();
  console.log('Extension ID', extensionId);

  while (true) {
    const event = await new ExtensionController().next(extensionId);
    switch (event.eventType) {
      case EventType.SHUTDOWN:
        handleShutdown(event);
        break;
      case EventType.INVOKE:
        handleInvoke(event);
        break;
      default:
        throw new Error('unknown event: ' + event.eventType);
    }
  }
})();
