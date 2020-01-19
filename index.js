const crypto = require('crypto');
const http = require('http');
const dns = require('dns');
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

// TODO(perf): doesn't need to be cryptographically sound
function generateTraceId(init) {
  const bytes = TRACE_ID_TYPE[init];
  if (!bytes) throw new Error(`CANNOT FIND TRACE_ID_TYPE: ${init}`);
  return crypto.randomBytes(bytes).toString('hex');
}

// TODO(perf): doesn't need to be cryptographically sound
function generateSpanId() {
  return crypto.randomBytes(8).toString('hex'); // 8
}

// TODO: Generate with microsecond accuracy
function now() {
  return Date.now() * 1000;
}

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
    } else if (config.init) {
      // Creating new header identifiers
      this.traceId = generateTraceId(config.init);
      this.spanId = generateSpanId();
      this.parentSpanId = undefined;

      if (config.sampleRate === 1) {
        this.sampled = '1';
      } else if (config.sampleRate === 0) {
        this.sampled = '0';
      } else {
        this.sampled = Math.random() < config.sampleRate ? '1' : '0';
      }

      this.flags = config.debug ? '1' : undefined;

      // console.log('generating a trace id', this.traceId, this.spanId);
    } else {
      // TODO: Should emit a warning, no headers will be used
      // console.error('NO HEADERS', headers);
      this.traceId = undefined;
      this.spanId = undefined;
      this.ParentSpanId = undefined;
      this.sampled = '0';
      this.flags = undefined;
    }
  }

  isDebug() {
    return this.flags === '1';
  }

  isSampled() {
    return this.sampled === '1';
  }
}

class Zipkin {
  constructor(config = {}) {
    const [zipkinHostname, zipkinPort] = (config.zipkinHost || 'localhost:9411').split(':');
    this.zipkinHostname = zipkinHostname;
    this.zipkinPort = zipkinPort;

    this.serviceName = config.serviceName;

    this.init = config.init === true
      ? TRACE_ID_TYPE.SHORT
      : config.init || false;
    this.sampleRate = 'sampleRate' in config ? Number(config.sampleRate) : 1;

    this.debug = !!config.debug;

    if (config.serviceIp) {
      // TODO: This is a hack, switch to a better address parser
      if (config.serviceIp.includes('.')) {
        this.serviceIpMode = 'ipv4';
        this.serviceIp = config.serviceIp;
      } else if (config.serviceIp.includes(':')) {
        this.serviceIpMode = 'ipv6';
        this.serviceIp = config.serviceIp;
      } else {
        this.serviceIpMode = undefined;
        this.serviceIp = undefined;
      }
    }

    this.servicePort = config.servicePort;
  }

  // TODO: Middleware can't easily extract a URL pattern, like /foo/:id
  //       But, if it uses the raw path, like /foo/123, it'll blow out cardinality
  onRequest() {
    return async (req, reply) => {
      // TODO: req.headers['x-forwarded-for'] considerations, trust proxy flag
      // TODO: req.ip can be a comma separated string
      const headersIn = new ZipkinHeaders(req.headers, {
        init: this.init,
        sampleRate: this.sampleRate,
        debug: this.debug
      });

      // Attach zipkin data to request object
      req.zipkin = {
        start: now(),
        headers: headersIn,
        debug: headersIn.isDebug(),
        sampled: headersIn.isSampled(),
        trace: headersIn.traceId,

        // TODO: If we could access the original URL matcher, i.e. extract from `.get('/middle/:id'`
        //       the GET and /middle/:id parts, we could use that as a default name. However, if we
        //       just use the raw URL (e.g. /middle/1234), the cardinality of names gets too high.
        name: undefined,
        setName: function(name) {
          // Requiring the req.zipkin.setName() call is lame
          // Something like decorators could help here
          this.name = name;
        },

        prepare: () => {
          if (!headersIn.traceId) {
            // a non-init (deep) service received a non-zipkin request
            // we perform basically a no-op here
            return {
              complete: () => {},
              headers: {
                'X-B3-Sampled': '0'
              }
            };
          }

          const start = now();
          const spanId = generateSpanId();

          const headersOut = {
            'X-B3-TraceId': headersIn.traceId,
            'X-B3-SpanId': spanId,
            'X-B3-ParentSpanId': headersIn.spanId,
            'X-B3-Sampled': headersIn.sampled,
          };

          if (headersIn.flags) {
            headersOut['X-B3-Flags'] = headersIn.flags; // This header is usually missing
          }

          return {
            complete: (method, url) => {
              const { hostname, port, path } = URL.parse(url);
              dns.lookup(hostname, (err, remoteIp) => {
                if (err) {
                  console.error(`UNABLE TO PERFORM DNS LOOKUP FOR "${hostname}": ${err}`);
                  return;
                }
                const payload = this.buildClientPayload({
                  traceId: req.zipkin.headers.traceId,
                  method: String(method).toUpperCase(),
                  path,
                  remoteIp,
                  remotePort: port,
                  start,
                  spanId,
                  parentId: headersIn.spanId
                });
                this.transmit(payload, req.zipkin.sampled);
              });
            },
            headers: headersOut
          };
        },
      };
    };
  }

  onResponse() {
    return async (req, reply) => {
      const payload = this.buildServerPayload(req);
      this.transmit(payload, req.zipkin.sampled);
    };
  }

  buildServerPayload(req) {
    const remote = req.ip.includes('.') ? 'ipv4' : 'ipv6';

    return {
      id: req.zipkin.headers.spanId,
      traceId: req.zipkin.headers.traceId,
      name: req.zipkin.name,
      parentId: req.zipkin.headers.parentSpanId,
      timestamp: req.zipkin.start,
      duration: now() - req.zipkin.start,
      kind: KIND.SERVER,
      localEndpoint: {
        serviceName: this.serviceName,
        [this.serviceIpMode]: this.serviceIp,
        port: this.servicePort,
      },
      remoteEndpoint: {
        [remote]: req.ip,
      },
      tags: {
        'http.method': req.raw.method,
        'http.path': req.raw.url,
      }
    };
  }

  buildClientPayload(opts) {
    const remote = opts.remoteIp.includes('.') ? 'ipv4' : 'ipv6';

    return {
      id: opts.spanId,
      traceId: opts.traceId,
      parentId: opts.parentId,
      timestamp: opts.start,
      duration: now() - opts.start,
      kind: KIND.CLIENT,
      localEndpoint: {
        serviceName: this.serviceName,
        [this.serviceIpMode]: this.serviceIp,
        port: this.servicePort,
      },
      remoteEndpoint: {
        [remote]: opts.remoteIp,
        port: opts.remotePort,
      },
      tags: {
        'http.method': opts.method,
        'http.path': opts.path,
      }
    };
  }

  // TODO: Allow batching of spans before transmitting
  //       Like, store 100 spans or for 1,000ms or w/e comes first
  transmit(payload, sampled) {
    // console.log('PAYLOAD', payload);

    if (!sampled) {
      return;
    }

    // Note that we make this an array with one entry
    // With batching, it would be an array of several entries
    const body = JSON.stringify([payload]);

    const options = {
      hostname: this.zipkinHostname,
      port: this.zipkinPort,
      path: '/api/v2/spans',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      if (res.statusCode >= 400) {
        console.error(`ZIPKIN STATUS: ${res.statusCode}`);
      }
    });

    req.on('error', (e) => {
      console.error(`ZIPKIN ERROR: ${e}`);
    });

    req.write(body);
    req.end();
  }
}

module.exports = Zipkin;
