#!/usr/bin/env node

const PORT = process.env.NODE_PORT || 3003;
const HOST = process.env.NODE_HOST || '127.0.0.1';

const Zipkin = require('./index.js');
const zipkin = new Zipkin({
  zipkin_host: 'localhost:9411',
  service: 'deep-api',
  port: PORT,
  ip: HOST,
});

const server = require('fastify')();
const fetch = require('node-fetch');

server.addHook('onRequest', zipkin.onRequest());
server.addHook('onResponse', zipkin.onResponse());

server.get('/deep/42', async (req, reply) => {
  console.log('GET /deep/42');
  req.zipkin.setName('get_deep');

  await sleep(3);

  return 'ok';
});

server.listen(PORT, HOST);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
