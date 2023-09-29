#!/usr/bin/env node
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const RUNTIME_API_ENDPOINT = process.env.CJV_RUNTIME_API_ENDPOINT || process.env.AWS_LAMBDA_RUNTIME_API;
const LISTENER_PORT = process.env.CJV_LISTENER_PORT || 9125;
const RUNTIME_API_URL = `http://${RUNTIME_API_ENDPOINT}/2018-06-01/runtime`;
const JWKS_URI = process.env.CJV_JWKS_URI;
const JWT_ISSUER = process.env.CJV_JWT_ISSUER;

class RuntimeApiProxy {
  async start() {
    console.info(`[CJV:RuntimeApiProxy] start RUNTIME_API_ENDPOINT=${RUNTIME_API_ENDPOINT}`);
    console.info(`[CJV:RuntimeApiProxy] start LISTENER_PORT=${LISTENER_PORT}`);
    console.info(`[CJV:RuntimeApiProxy] start JWKS_URI=${JWKS_URI}`);
    console.info(`[CJV:RuntimeApiProxy] start JWT_ISSUER=${JWT_ISSUER}`);

    const listener = express();
    listener.use(express.json());

    listener.use(async (req, _, next) => {
      console.log(`[CJV:RuntimeProxy] incoming request method=${req.method} url=${req.originalUrl}`);
      next();
    });

    listener.get('/2018-06-01/runtime/invocation/next', this.handleNext.bind(this));
    listener.post('/2018-06-01/runtime/invocation/:requestId/response', this.handleResponse.bind(this));
    listener.post('/2018-06-01/runtime/init/error', this.handleInitError);
    listener.post('/2018-06-01/runtime/invocation/:requestId/error', this.handleInvokeError);

    listener.use((_, res) => res.status(404).send());
    listener.listen(LISTENER_PORT);
  }

  async handleNext(_, res) {
    console.log('[CJV:RuntimeProxy] handleNext');
    let nextEvent = await this.getNextEvent();
    while (nextEvent.action === 'BLOCK') {
      await this.verifyNextEvent(nextEvent);

      if (nextEvent.action === 'BLOCK'){
        await this.sendResponseToRuntimeApi(nextEvent.requestId, { 
          error: nextEvent.error 
        });
        nextEvent = await this.getNextEvent();
      }
    }

    nextEvent.headers.forEach((value, key) => {
      res.set(key, value);
    });
    return res.send(nextEvent.payload);
  }

  async getNextEvent() {
    console.log('[CJV:RuntimeProxy] getNextEvent');
    const res = await fetch(`${RUNTIME_API_URL}/invocation/next`);
    return {
      headers: res.headers,
      payload: await res.json(),
      requestId: res.headers.get('lambda-runtime-aws-request-id'),
      action: 'BLOCK',
      error: 'Will be populated by this.verifyNextEvent()'
    }
  }

  async verifyNextEvent(nextEvent) {
    console.log(`[CJV:RuntimeProxy] verifyNextEvent`);

    // console.log(JSON.stringify(nextEvent, null, 4));

    const authorizationHeader = nextEvent.payload.headers.authorization;

    // Check whether authorization header is present
    if (!authorizationHeader) {
      console.log('[CJV:RuntimeProxy] verifyNextEvent missing authorization header');
      nextEvent.error = 'Missing authorization header';
      return;
    }

    // There's an authorization header, but is it a bearer token?
    if (!authorizationHeader.startsWith('Bearer')) {
      console.log('[CJV:RuntimeProxy] verifyNextEvent not a bearer token');
      nextEvent.error = 'Missing bearer token';
      return;
    }

    const token = authorizationHeader.split(' ')[1];
    await this.verifyToken(token, nextEvent);
  }

  async verifyToken(token, nextEvent) {
    console.log(`[CJV:RuntimeProxy] verifyToken`);

    const client = jwksClient({
      jwksUri: JWKS_URI
    });

    function getKey(header, callback) {
      // console.log('[CJV:RuntimeProxy] verifyToken getKey');

      client.getSigningKey(header.kid, function (err, key) {
        // console.error('[CJV:RuntimeProxy] verifyToken getKey error', err);
        var signingKey = key.publicKey || key.rsaPublicKey;
        // console.info('[CJV:RuntimeProxy] verifyToken getKey signingKey', signingKey);
        callback(null, signingKey);
      });
    }

    return new Promise((resolve, reject) => {
      // console.log('[CJV:RuntimeProxy] verifyToken jwt.verify');

      const options = {
        algorithms: ['RS256'],
        issuer: JWT_ISSUER
      };

      jwt.verify(token, getKey, options, (err, decoded) => {
        if (err) {
          console.error('[CJV:RuntimeProxy] verifyToken failed', err);
          nextEvent.error = 'Invalid bearer token';
          return resolve();
        }

        console.info('[CJV:RuntimeProxy] verifyToken success');
        nextEvent.action = 'ALLOW';
        nextEvent.payload.jwtPayload = decoded;
        resolve();
      });
    });
  }

  async sendResponseToRuntimeApi(requestId, body) {
    console.log(`[CJV:RuntimeProxy] sendResponseToRuntimeApi requestId=${requestId}`);
    await fetch(`${RUNTIME_API_URL}/invocation/${requestId}/response`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async handleResponse(req, res) {
    const requestId = req.params.requestId;
    console.log(`[CJV:RuntimeProxy] handleResponse requestid=${requestId}`);

    // Extracting the handler response
    const responseJson = req.body;

    // Posting the updated response to Lambda Runtime API
    const resp = await fetch(`${RUNTIME_API_URL}/invocation/${requestId}/response`, {
      method: 'POST',
      body: JSON.stringify(responseJson),
    }
    );

    console.log('[CJV:RuntimeProxy] handleResponse posted');
    return res.status(resp.status).json(await resp.json());
  }

  async handleInitError(req, res) {
    console.log(`[CJV:RuntimeProxy] handleInitError`)

    const resp = await fetch(`${RUNTIME_API_URL}/init/error`, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
    })

    console.log('[CJV:RuntimeProxy] handleInitError posted')
    return res.status(resp.status).json(await resp.json())
  }

  async handleInvokeError(req, res) {
    const requestId = req.params.requestId
    console.log(`[CJV:RuntimeProxy] handleInvokeError requestid=${requestId}`)

    const resp = await fetch(`${RUNTIME_API_URL}/invocation/${requestId}/error`, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
    });

    console.log('[CJV:RuntimeProxy] handleInvokeError posted')
    return res.status(resp.status).json(await resp.json());
  }

}

module.exports = RuntimeApiProxy;
