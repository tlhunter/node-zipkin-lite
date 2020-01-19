#!/usr/bin/env node

// This is the "shallowest" service, consumed by end users

const PORT = process.env.NODE_PORT || 3001;
const HOST = process.env.NODE_HOST || '127.0.0.1';

const Zipkin = require('./index.js');
const zipkin = new Zipkin({
  zipkinHost: 'localhost:9411',
  serviceName: 'shallow-api',
  servicePort: PORT,
  serviceIp: HOST,
  sampleRate: 0.5,
  init: 'long', // long | short | false
  debug: false // TODO: should be enabled per-request?
});

const server = require('fastify')();
const fetch = require('node-fetch');

server.addHook('onRequest', zipkin.onRequest());
server.addHook('onResponse', zipkin.onResponse());

server.get('/', async (req, reply) => {
  console.log('GET /', req.zipkin.trace);
  req.zipkin.setName('get_shallow');

  let response = '';

  {
    const zreq = req.zipkin.prepare();
    const headers = Object.assign({
      'Content-Type': 'application/json'
    }, zreq.headers);
    const url = 'http://localhost:3002/middle/42';
    const result = await fetch(url, { headers });
    zreq.complete('GET', url);

    response += await result.text()
  }

  {
    const zreq = req.zipkin.prepare();
    await sleep(1);
    const headers = Object.assign({
      'Content-Type': 'application/json'
    }, zreq.headers);
    const url = 'http://localhost:3003/deep/42';
    const result = await fetch(url, { headers });
    zreq.complete('GET', url);

    response += await result.text()
  }

  return response;
});

server.listen(PORT, HOST);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
