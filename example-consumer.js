#!/usr/bin/env node

const PORT = process.env.NODE_PORT || 3001;
const HOST = process.env.NODE_HOST || '127.0.0.1';

const Zipkin = require('./index.js');
const zipkin = new Zipkin({
  zipkin_host: 'localhost:9411',
  service: 'web-api',
  port: PORT,
  ip: HOST,
  tags: {
    coolstuff: true,
  }

});

const server = require('fastify')();
const fetch = require('node-fetch');

// server.use();

server.get('/', async (req) => {
  console.log(req);
  return 'ok';
});

server.get('/foo/:id', async (req) => {
  console.log(req);
  return 'foo';
});

server.listen(PORT, HOST);
