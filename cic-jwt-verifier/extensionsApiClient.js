#!/usr/bin/env node
const AWS_LAMBDA_RUNTIME_API = process.env.AWS_LAMBDA_RUNTIME_API;
const EXTENSIONS_API_ENDPOINT = `http://${AWS_LAMBDA_RUNTIME_API}/2020-01-01/extension`;

const { basename } = require('path');

class ExtensionsApiClient {
  constructor() {
    this.extensionId = null;
  }

  async bootstrap() {
    console.info(`[CJV:ExtensionsApiClient] bootstrap `);
    await this.register();
    await this.next();
  }

  async register() {
    console.info(`[CJV:ExtensionsApiClient] register endpoint=${EXTENSIONS_API_ENDPOINT}`);
    const res = await fetch(`${EXTENSIONS_API_ENDPOINT}/register`, {
      method: 'POST',
      body: JSON.stringify({
        events: [], // You can register for INVOKE and SHUTDOWN events here
      }),
      headers: {
        'Content-Type': 'application/json',
        'Lambda-Extension-Name': basename(__dirname)
      }
    });

    if (!res.ok) {
      console.error('[CJV:ExtensionsApiClient] register failed:', await res.text());
    } else {
      this.extensionId = res.headers.get('lambda-extension-identifier');
      console.info(`[CJV:ExtensionsApiClient] register success extensionId=${this.extensionId}`);
    }
  }

  async next() {
    console.info('[CJV:ExtensionsApiClient] next waiting...');
    const res = await fetch(`${EXTENSIONS_API_ENDPOINT}/event/next`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Lambda-Extension-Identifier': this.extensionId
      }
    });

    if (!res.ok) {
      console.error('[CJV:ExtensionsApiClient] next failed', await res.text());
      return null;
    } else {
      const event = await res.json();
      console.info('[CJV:ExtensionsApiClient] next success');
      return event;
    }
  }
}

module.exports = ExtensionsApiClient;
