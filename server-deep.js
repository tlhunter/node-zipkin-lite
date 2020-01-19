#!/usr/bin/env node

// This is the "deepest" service, not making any outbound requests

const PORT = process.env.NODE_PORT || 3003;
const HOST = process.env.NODE_HOST || '127.0.0.1';

const Zipkin = require('./index.js');
const zipkin = new Zipkin({
  zipkinHost: 'localhost:9411',
  serviceName: 'deep-api',
  servicePort: PORT,
  serviceIp: HOST,
});

const server = require('fastify')();
const fetch = require('node-fetch');

server.addHook('onRequest', zipkin.onRequest());
server.addHook('onResponse', zipkin.onResponse());

server.get('/deep/:id', async (req, reply) => {
  console.log('GET /deep/:id', req.zipkin.trace);
  req.zipkin.setName('get_deep');

  await sleep(3);

  return 'ok';
});

server.listen(PORT, HOST);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
