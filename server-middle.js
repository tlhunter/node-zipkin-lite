#!/usr/bin/env node

const PORT = process.env.NODE_PORT || 3002;
const HOST = process.env.NODE_HOST || '127.0.0.1';

const Zipkin = require('./index.js');
const zipkin = new Zipkin({
  zipkin_host: 'localhost:9411',
  service: 'middle-api',
  port: PORT,
  ip: HOST,
  tags: {
    coolstuff: true,
  },
});

const server = require('fastify')();
const fetch = require('node-fetch');

server.addHook('onRequest', zipkin.onRequest());
server.addHook('onResponse', zipkin.onResponse());

server.get('/middle/42', async (req, reply) => {
  console.log('GET /middle/42');
  req.zipkin.setName('get_middle');

  const headers = Object.assign({
    'Content-Type': 'application/json'
  }, req.zipkin.headers.clientHeaders());

  // const zreq = req.zipkin.prepare('deep-api', 'get_root')
  const result = await fetch('http://localhost:3003/deep/42', {
    headers
    // }, zreq.headers);
  });
  const body = await result.text();
  // req.zipkin.complete(zreq, 4001, result.ip);
  //

  return body;
});

server.listen(PORT, HOST);
