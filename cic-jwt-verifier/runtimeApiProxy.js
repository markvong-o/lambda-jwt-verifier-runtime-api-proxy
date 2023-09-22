#!/usr/bin/env node
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const AWS_LAMBDA_RUNTIME_API = process.env.AWS_LAMBDA_RUNTIME_API;
const RUNTIME_API_ENDPOINT =
  process.env.LRAP_RUNTIME_API_ENDPOINT || process.env.AWS_LAMBDA_RUNTIME_API;
const RUNTIME_API_URL = `http://${RUNTIME_API_ENDPOINT}/2018-06-01/runtime`;

export class RuntimeApiProxy {
  constructor() {
    console.info(`[LambdaProxy:RuntimeApiProxy:constructor]`);

    this.runtimeApiProxyEnabled = process.env.AWS_LRAP_ENABLED === 'true';

    this.nextEvent = null;

    this.continue = true;
  }

  async start() {
    console.info(
      `[LambdaProxy:RuntimeApiProxy:start enabled=${this.runtimeApiProxyEnabled}]`
    );

    const listener = express();
    listener.use(express.json());
    listener.use(async (req, _, next) => {
      console.log(
        `[LambdaProxy:RuntimeProxy] incoming request method=${req.method} url=${req.originalUrl}`
      );
      next();
    });
    listener.get(
      '/2018-06-01/runtime/invocation/next',
      this.handleNext.bind(this)
    );
    listener.post(
      '/2018-06-01/runtime/invocation/:requestId/response',
      this.handleResponse.bind(this)
    );
    listener.use((_, res) => res.status(404).send());
    listener.listen(9009);
  }

  async sendResponseToRuntimeApi(requestId, body) {
    console.log(
      `[LambdaProxy:RuntimeProxy:sendResponseToRuntimeApi] requestId=${requestId}`
    );

    await fetch(
      `http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/${requestId}/response`,
      {
        method: 'POST',

        body: JSON.stringify(body),
      }
    );
  }

  async handleNext(_, res) {
    console.log('[LRAP:RuntimeProxy] handleNext');

    // Getting the next event from Lambda Runtime API
    const nextEvent = await fetch(`${RUNTIME_API_URL}/invocation/next`);

    // Extracting the event payload
    let eventPayload = await nextEvent.json();

    // Updating the event payload
    eventPayload['lrap-processed'] = true;

    // Copying headers
    nextEvent.headers.forEach((value, key) => {
      res.set(key, value);
    });
    const requestId = nextEvent.headers.get('lambda-runtime-aws-request-id');

    // Check for authorization header
    if (!('authorization' in eventPayload.headers)) {
      eventPayload = { error: 'Missing Bearer token' };
      await this.sendResponseToRuntimeApi(requestId, eventPayload);
      return res.send(eventPayload);
    }

    // There's an authorization header, but is it a bearer token?
    const tokenString = eventPayload.headers.authorization;
    if (!tokenString.startsWith('Bearer')) {
      eventPayload = { error: 'Missing Bearer token' };
      await this.sendResponseToRuntimeApi(requestId, eventPayload);
      return res.send(eventPayload);
    }

    const tokenStringSplit = tokenString.split(' ');
    const token = tokenStringSplit[1];

    // Validate the token
    var client = jwksClient({
      jwksUri: 'https://dev-b4nlzp3r.us.auth0.com/.well-known/jwks.json',
    });
    function getKey(header, callback) {
      client.getSigningKey(header.kid, function (err, key) {
        var signingKey = key.publicKey || key.rsaPublicKey;
        callback(null, signingKey);
      });
    }
    const options = {
      algorithms: ['RS256'],
      iss: 'https://dev-b4nlzp3r.us.auth0.com',
    };

    jwt.verify(token, getKey, options, async (err, decoded) => {
      if (err) {
        eventPayload = { error: 'Invalid Bearer token' };
        await this.sendResponseToRuntimeApi(requestId, eventPayload);
        return res.send(eventPayload);
      }
      return res.send(eventPayload);
    });
  }
  async handleResponse(req, res) {
    const requestId = req.params.requestId;
    console.log(`[LRAP:RuntimeProxy] handleResponse requestid=${requestId}`);

    // Extracting the handler response
    const responseJson = req.body;

    // Updating the handler response
    responseJson['lrap-processed'] = true;

    // Posting the updated response to Lambda Runtime API
    const resp = await fetch(
      `${RUNTIME_API_URL}/invocation/${requestId}/response`,
      {
        method: 'POST',
        body: JSON.stringify(responseJson),
      }
    );

    console.log('[LRAP:RuntimeProxy] handleResponse posted');
    return res.status(resp.status).json(await resp.json());
  }
}
