#!/usr/bin/env node

const PORT = process.env.NODE_PORT || 3001;
const HOST = process.env.NODE_HOST || '127.0.0.1';

const Zipkin = require('./index.js');
const zipkin = new Zipkin({
  zipkin_host: 'localhost:9411',
  service: 'shallow-api',
  port: PORT,
  ip: HOST,
  tags: {
    coolstuff: true,
  },
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

  const headers = Object.assign({
    'Content-Type': 'application/json'
  }, req.zipkin.headers.clientHeaders());

  // const zreq = req.zipkin.prepare('middle-api', 'get_root')
  const result = await fetch('http://localhost:3002/middle/42', {
    headers
    // }, zreq.headers);
  });
  const body = await result.text();
  // req.zipkin.complete(zreq, 4001, result.ip);
  //

  return body;
});

server.listen(PORT, HOST);
