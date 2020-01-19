# zipkin-lite

This is a very basic implementation of [Zipkin](https://zipkin.io/) for Node.js. It is currently intended for educational use, not for use in production.

It was created for use with “Distributed Node.js”, a book that hasn't yet been published. The goal is to require manual instrumentation to help users understand the Zipkin concept, require no third party dependencies, and provide an idiomatic Node.js interface.

For a production project, consider using the [official `zipkin` npm module](https://github.com/openzipkin/zipkin-js).

Note that currently **this module only works with Fastify**. It could very easily work with other servers (PRs appreciated) but in its current state it does not.

## Usage

See [server-deep.js](./server-deep.js), [server-middle.js](./server-middle.js) and [server-shallow.js](./server-shallow.js) for example usage.

```javascript
const Zipkin = require('zipkin-lite');
const zipkin = new Zipkin({
  zipkinHost: 'localhost:9411',
  serviceName: 'shallow-api',
  servicePort: PORT,
  serviceIp: HOST,

  // these three flags are required for "shallow" services
  sampleRate: 0.5,
  init: 'long', // 'long' | 'short' | false
  debug: true
});

const server = require('fastify')();
const fetch = require('node-fetch');

// Enable incoming request hooks
server.addHook('onRequest', zipkin.onRequest());
server.addHook('onResponse', zipkin.onResponse());

server.get('/widgets/:id', async (req, reply) => {
  console.log('CURRENT TRACE ID:', req.zipkin.trace);
  req.zipkin.setName('get_widget');

  // ...

  // Each outbound request requires prepare/complete calls
  const zreq = req.zipkin.prepare();
  const url = 'http://localhost:3003/deep/42';
  const result = await fetch(url, { headers: zreq.headers }); // pass headers
  zreq.complete('GET', url);

  // ...

  return result.text();
});

server.listen(PORT, HOST);
```

This example shows how to use a majority of the `zipkin-lite` features within an application. This code represents a service which is able to generate the initial `traceId` value for subsequent requests.

An instance of the `Zipkin` class, exported when requiring the `zipkin-line` module, needs to be configured and instantiated before being used. The following configuration flags are accepted:


| Property | Default | Description |
| --- | --- | --- |
| zipkinHost | localhost:9411 | The host and port of the Zipkin collection service |
| serviceName | N/A | The name of the currently running service |
| servicePort | N/A | The port of the service (as seen by clients) |
| serviceIp | N/A | The IP Address of the service (as seen by clients) |
| sampleRate | 1 | The rate at which request are logged to Zipkin |
| init | false | If this is a shallow service that should generate Trace IDs |
| debug | false | Whether the traces should pass debug flags to deeper services |

Unfortunately, Zipkin requires IP addresses for logging; hostnames won't work. For that reason we need to specify the service's IP address. Both the IP address and the port should be what's used on the network, not necessarily what the service itself uses. For example, if your service lives inside a Docker container, and listens on `127.0.0.1:80`, but Docker rewrites the ports, then the real value might be something like `192.168.20.10:12345`.

The `init` value can be set to `long` to use 32 character IDs, `short` to use 16 character IDs, or `false` to be disabled entirely. `true` is an alias for `short`.

The `onRequest` and `onResponse` hooks are required to extend the `req` object, and to capture and report the timing information for the incoming request. The incoming request object is modified to have an added property, available at `req.zipkin`. This object has the following shape:

```javascript
{
  // The start time of the request with pseudo-microsecond precision
  start: 1579463188658000,

  // The incoming Zipkin-related headers (you shouldn't need these)
  headers: {
    traceId: '64273ad10379e27f6ef33242096297fc',
    spanId: 'aba861e477551efc',
    parentSpanId: '936313062d7e3496',
    sampled: '0',
    flags: undefined
  },

  // Whether this is a debug request (if so, increase logging verbosity)
  debug: false,

  // Whether this request is being sent to the Zipkin server
  sampled: false,

  // The Trace ID for this and related requests. Use it in log messages for grouping
  trace: '64273ad10379e27f6ef33242096297fc',

  // Set the "name" of an endpoint, like "GET /widget/:id" could be "get_widget"
  setName(name),

  // A method to prepare a new outgoing request. Call once for each outgoing request.
  prepare()
}
```

Once you call the `req.zipkin.prepare()` method, a timing value will be captured and a new object will be returned.

This returned object represents an outgoing Zipkin request. It has a `headers` property, which is an object representing headers. These headers need to be passed into your outgoing request library and is how Zipkin data is propagated to upstream services.

The outgoing Zipin request object also has a `complete(method, url)` method attached. Call this method once the request to the outgoing service is complete. Once called, the method will send a message to the Zipkin service, containing information about the client request. The `url` argument is parsed and used by Zipkin, along with `method`, to describe the request.


## Testing

Currently, this module can be tested by running the three included service instances, running Zipkin in a Docker container, and making a request to the shallowest of services. Such a flow looks like the following:

```shell
$ docker run -p 9411:9411 \
  -it --name distnode-zipkin \
  openzipkin/zipkin-slim:2.19
$ server-deep.js
$ server-middle.js
$ server-shallow.js
$ curl http://localhost:3001/
```

Unfortunately, I don't currently have the time to build a full test suite.


## Supported Features

- Transporting traces via HTTP
- Generating initial `TraceID`s
- Extracting incoming Zipkin request headers for outgoing requests
- Long and Short `TraceID`
- Sampling
- Debug flag


## Unsupported Features

- Transports for anything other than HTTP, e.g. gRPC
- Batching of spans before transmitting
- `X-Forwarded-For` / proxy IP address parsing
- Blocking of outside zipkin headers for initial request (e.g. for bad actors)
- Microsecond accuracy (uses millisecond * 1000)
- Single `b3` header mode (only multi-header support)
- User-supplied tags (only opinionated `http.method` and `http.path` are supported)
