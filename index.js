const crypto = require('crypto');
const http = require('http');
const URL = require('url');

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
const TRACE_ID_TYPE = {
  long: 16,
  short: 8,
};

function generateTraceId(init_mode) {
  const bytes = TRACE_ID_TYPE[init_mode];
  if (!bytes) throw new Error(`CANNOT FIND TRACE_ID_TYPE: ${init_mode}`);
  return crypto.randomBytes(bytes).toString('hex');
}

function generateSpanId() {
  return crypto.randomBytes(8).toString('hex'); // 8
}

// TODO: Generate with microsecond accuracy
function getCurrentTimestamp() {
  return Date.now() * 1000;
}

// Detects if this is not an initial incoming request, one without any Zipkin headers
function isZipkinRequest(headers) {
  return INCOMING.SAMPLED in headers;
}

// https://github.com/openzipkin/b3-propagation
// https://zipkin.io/zipkin-api/#/default/post_spans
class ZipkinHeaders {
  constructor(headers, config) {
    // TODO: Should have an option to disallow accepting of supplied zipkin headers
    // e.g. don't trust client, or web frontend always knows it won't get an ID
    if (isZipkinRequest(headers)) {
      // Passing along upstream headers
      this.traceId = headers[INCOMING.TRACE];

      // TODO: should throw if no spanId
      this.spanId = INCOMING.SPAN in headers
        ? headers[INCOMING.SPAN]
        : undefined;

      // TODO: should throw if no Parent
      this.parentSpanId = INCOMING.PARENT in headers
        ? headers[INCOMING.PARENT]
        : undefined;

      // TODO: should throw if no sampled
      this.sampled = INCOMING.SAMPLED in headers
        ? headers[INCOMING.SAMPLED]
        : undefined;

      this.flags = INCOMING.FLAGS in headers
        ? headers[INCOMING.FLAGS]
        : undefined;
    } else if (config.init_mode) {
      // Creating new header identifiers
      this.traceId = generateTraceId(config.init_mode);
      this.spanId = generateSpanId();
      this.parentSpanId = undefined;

      if (config.sample_rate === 1) {
        this.sampled = 1;
      } else if (config.sample_rate === 0) {
        this.sampled = 0;
      } else {
        this.sampled = !!(Math.random() < config.sample_rate);
        // console.log(`determined sample to be ${this.sampled}`);
      }

      this.flags = config.debug ? '1' : undefined;

      // console.log('generating a trace id', this.traceId, this.spanId);
    } else {
      // TODO: Should warn and pass along no headers
      console.error('NO HEADERS', headers);
      throw new Error("didn't receive any zipkin data, can't generate on own");
    }
  }

  // Generates a list of headers for a client request
  // Each client request gets a new span ID
  // The current span ID becomes the parent span ID
  clientHeaders() {
    const headers = {
      'X-B3-TraceId': this.traceId, // Always retain the Trace ID
      'X-B3-SpanId': generateSpanId(), // Chlient/Server pairs share Span ID
      'X-B3-ParentSpanId': this.spanId, // This Span ID becomes the parent
      'X-B3-Sampled': this.sampled, // Pass along Sampled flag
    };

    if (this.flags) {
      headers['X-B3-Flags'] = this.flags; // This header is usually missing
    }

    return headers;
  }
}

class Zipkin {
  constructor(config = {}) {
    {
      const [hostname, port] = (config.zipkin_host || 'localhost:9411').split(':');
      this.zipkin_hostname = hostname;
      this.zipkin_port = port;
    }
    this.service_name = config.service;

    this.init_mode = config.init_mode || false;
    this.sample_rate = 'sample_rate' in config ? Number(config.sample_rate) : 1;

    this.debug = !!config.debug;

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

    this.my_port = config.port;
  }

  // TODO: Middleware can't easily extract a URL pattern, like /foo/:id
  //       But, if it uses the raw path, like /foo/123, it'll blow out cardinality
  onRequest() {
    return async (req, reply) => {
      // TODO: req.headers['x-forwarded-for'] considerations, trust proxy flag
      // TODO: req.ip can be a comma separated string
      const client_ip = req.ip;
      const headers = new ZipkinHeaders(req.headers, {
        init_mode: this.init_mode,
        sample_rate: this.sample_rate,
        debug: this.debug
      });

      const config = {
        client_ip,
        timestamp_start: getCurrentTimestamp(),
        name: undefined, // TODO: decorator?
      };

      // Attach zipkin data to request object
      req.zipkin = {
        config,
        headers,
        setName: (name) => {
          config.name = name;
        },
      };
    };
  }

  time() {
    return getCurrentTimestamp();
  }

  onResponse() {
    return async (req, reply) => {
      const payload = this.buildServerPayload(req);
      this.transmit(payload);
    };
  }

  buildServerPayload(req) {
    const client_ip_mode = req.zipkin.config.client_ip.includes('.')
      ? 'ipv4'
      : 'ipv6';

    return {
      id: req.zipkin.headers.spanId, // Current Span ID
      traceId: req.zipkin.headers.traceId, // Overall Trace ID
      name: req.zipkin.config.name, // RPC method name: "remove_user" or "DELETE /v1/api/user"
      parentId: req.zipkin.headers.parentSpanId, // Span ID of parent operation
      timestamp: req.zipkin.config.timestamp_start,
      duration: getCurrentTimestamp() - req.zipkin.config.timestamp_start,
      kind: KIND.SERVER,
      localEndpoint: {
        serviceName: this.service_name,
        [this.ip_mode]: this.ip,
        port: this.my_port,
      },
      remoteEndpoint: {
        [client_ip_mode]: req.zipkin.config.client_ip,
        // port: undefined, // server doesn't know client port
      },
      tags: {
        'http.method': req.raw.method,
        'http.path': req.raw.path,
      }
    };
  }

  buildClientPayload() {
  }

  // TODO: Allow batching of spans before transmitting
  //       Like, store 100 spans or for 1,000ms or w/e comes first
  transmit(payload) {
    console.log('PAYLOAD', payload);

    // Note that we make this an array with one entry
    // With batching, it would be an array of several entries
    const body = JSON.stringify([payload]);

    const options = {
      hostname: this.zipkin_hostname,
      port: this.zipkin_port,
      path: '/api/v2/spans',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      console.log(`STATUS: ${res.statusCode}`);
      res.setEncoding('utf8');
      res.on('end', () => {
        // callback();
      });
    });

    req.on('error', (e) => {
      // callback(e);
    });

    req.write(body);
    req.end();
  }
}

module.exports = Zipkin;
