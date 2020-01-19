#!/usr/bin/env node

const PORT = process.env.NODE_PORT || 3001;
const HOST = process.env.NODE_HOST || '127.0.0.1';

const Zipkin = require('./index.js');
const zipkin = new Zipkin({
  zipkin_host: 'localhost:9411',
  service: 'shallow-api',
  port: PORT,
  ip: HOST,
  sample_rate: 1,
  init_mode: 'long',
  debug: false
});

const server = require('fastify')();
const fetch = require('node-fetch');

server.addHook('onRequest', zipkin.onRequest());
server.addHook('onResponse', zipkin.onResponse());

server.get('/', async (req, reply) => {
  console.log('GET /');
  req.zipkin.setName('get_shallow');

  const zreq = req.zipkin.prepare();
  const headers = Object.assign({
    'Content-Type': 'application/json'
  }, zreq.headers);
  console.log('CLIENT HEADERS', headers);
  const result = await fetch('http://localhost:3002/middle/42', {
    headers
  });
  zreq.complete('127.0.0.1', 3002, 'GET', '/middle/42');

  return result.text();
});

server.listen(PORT, HOST);
