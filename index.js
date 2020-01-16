const crypto = require('crypto');
const http = require('http');

const KIND = {
  SERVER: 'SERVER',
  CLIENT: 'CLIENT',
};

const INCOMING = {
  TRACE: 'x-b3-traceid',
  SPAN: 'x-b3-spanid',
  PARENT: 'x-b3-parentspanid',
  SAMPLED: 'x-b3-sampled',
  FLAGS: 'x-b3-flags',
};
const OUTGOING = {
  'X-B3-TraceId': true,
  'X-B3-SpanId': true,
  'X-B3-ParentSpanId': true,
  'X-B3-Sampled': true,
  'X-B3-Flags': true,
};

function generateTraceId(long = false) {
  return crypto.randomBytes(long ? 16 : 8).toString('hex');
}

function generateSpanId() {
  return crypto.randomBytes(8).toString('hex'); // 8
}

// TODO: Generate with microsecond accuracy
function getCurrentTimestamp() {
  return Date.now() * 1000;
}

// https://github.com/openzipkin/b3-propagation
// https://zipkin.io/zipkin-api/#/default/post_spans
class ZipkinHeaders {
  constructor(headers) {
    this.traceId = INCOMING.TRACE in headers
      ? headers[INCOMING.TRACE]
      : generateTraceId();

    this.spanId = INCOMING.SPAN in headers
      ? headers[INCOMING.SPAN]
      : undefined;

    this.parentSpanId = INCOMING.PARENT in headers
      ? headers[INCOMING.PARENT]
      : undefined;

    this.sampled = INCOMING.SAMPLED in headers
      ? headers[INCOMING.SAMPLED]
      : undefined;

    this.flags = INCOMING.FLAGS in headers
      ? headers[INCOMING.FLAGS]
      : undefined;
  }
}

// TODO: Allow batching of spans before transmitting, like store 100 spans or for 1,000ms or w/e comes first
// TODO: allow configuring between 8 and 16 byte trace IDs
class Zipkin {
  constructor(config = {}) {
    this.zipkin_host = config.zipkin_host || 'localhost:9411';
    this.service_name = config.service;
    this.my_port = config.port;

    this.tags = config.tags && typeof config.tags === 'object'
      ? config.tags
      : undefined;

    if (config.ip) {
      // TODO: This is a hack, switch to a better address parser
      if (config.ip.includes('.')) {
        this.ip_mode = 'ipv4';
        this.ip = config.ip;
      } else if (config.ip.includes(':')) {
        this.ip_mode = 'ipv6';
        this.ip = config.ip;
      } else {
        this.ip_mode = undefined;
        this.ip = undefined;
      }
    }
  }

  middleware(req) {
    // TODO: req.headers['x-forwarded-for'] considerations, trust proxy flag
    // TODO: req.ip can be a comma separated string
    const remote_ip = req.ip;
    const headers = new ZipkinHeaders(req.headers);

    const config = {
      ip: remote_ip,
      timestamp: this.getCurrentTimestamp(),
      kind: KIND.SERVER,
      port: undefined, // what is a client port?
    };
    // Extract headers from request object
    // track overall request timing and report()
  }

  // Sends a trace to the Zipkin server
  report(config = {}, callback = () => {}) {
    const name = config.name; // RPC method name; "remove_user" or "DELETE /v1/api/user"
    const id = config.id;
    const traceId = config.traceId;
    const timestamp = config.timestamp || this.getCurrentTimestamp();
    const kind = config.kind; // "CLIENT" || "SERVER"
    const ip = config.ip;
    const their_port = config.port;
    const tags = config.tags && typeof config.tags === 'object' ? config.tags : undefined;

    const payload = {
      id,
      traceId,
      name,
      timestamp,
      duration: 1000,
      kind,
      localEndpoint: {
        serviceName: this.service_name,
        ipv4: this.ip_mode === 'ipv4' ? this.ip : undefined,
        ipv6: this.ip_mode === 'ipv6' ? this.ip : undefined,
        port: this.my_port,
      },
      remoteEndpoint: {
        ipv4: ip && ip.includes('.') ? ip : undefined,
        ipv6: ip && !ip.includes('.') ? ip : undefined,
        port: their_port,
      },
      tags: this.tags || tags ? Object.assign({}, this.tags || {}, tags || {}) : undefined
    };
  }
}

module.exports = Zipkin;
