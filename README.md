# node-zipkin-basic

This is a very basic implementation of [Zipkin](https://zipkin.io/) for Node.js.

It was created for use with “Distributed Node.js”, a book that hasn't yet been published. The goal is to require manual instrumentation to help users grok the Zipkin concept, require no third party dependencies, and provide an idiomatic Node.js interface.

For a production project, consider using the [official `zipkin` npm module](https://github.com/openzipkin/zipkin-js). If this module reaches v1.0.0, I'll remove this recommendation.

## Usage

See [example-producer.js](./example-producer.js) and [example-consumer.js](./example-consumer.js) for example usage.

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
- Microsecond accuracy (uses millisecond * 1000)
- Single `b3` header
