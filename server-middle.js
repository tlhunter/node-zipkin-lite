#!/usr/bin/env node

const PORT = process.env.NODE_PORT || 3002;
const HOST = process.env.NODE_HOST || '127.0.0.1';

const Zipkin = require('./index.js');
const zipkin = new Zipkin({
  zipkinHost: 'localhost:9411',
  serviceName: 'middle-api',
  servicePort: PORT,
  serviceIp: HOST,
});

const server = require('fastify')();
const fetch = require('node-fetch');

server.addHook('onRequest', zipkin.onRequest());
server.addHook('onResponse', zipkin.onResponse());

server.get('/middle/42', async (req, reply) => {
  console.log('GET /middle/42');
  req.zipkin.setName('get_middle');

  const zreq = req.zipkin.prepare();
  const headers = Object.assign({
    'Content-Type': 'application/json'
  }, zreq.headers);
  const url = 'http://localhost:3003/deep/42';
  const result = await fetch(url, { headers });
  zreq.complete('GET', url);

  return result.text();
});

server.listen(PORT, HOST);
