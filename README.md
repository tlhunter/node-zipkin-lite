# node-zipkin-basic

This is a very basic implementation of [Zipkin](https://zipkin.io/) for Node.js.

It was created for use with “Distributed Node.js”, a book that hasn't yet been published.

For a production project, consider using the [official `zipkin` npm module](https://github.com/openzipkin/zipkin-js) instead.

## Usage

See [example-producer.js](./example-producer.js) and [example-consumer.js](./example-consumer.js) for example usage.

## Supported Features

- Transporting traces via HTTP
- Generating initial `TraceID`s
- Extracting incoming Zipkin request headers for outgoing requests

## Unsupported Features

- Transports for anything other than HTTP, e.g. gRPC
- Batching of spans before transmitting
- Generation of 16 character `TraceID`s
- `X-Forwarded-For` / proxy IP address parsing
- Microsecond accuracy (uses millisecond * 1000)
