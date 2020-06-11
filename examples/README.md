# Examples

This folder contains examples of how to use the Docker CLI JavaScript SDK.

## Prerequisites

* [Node.js 10 or later](https://nodejs.org/en/download/)
* [yarn](https://yarnpkg.com/getting-started/install)

To run the examples you will need to have the Docker CLI API server running. You
can do this by running:

```console
$ docker serve --address unix:///tmp/backend.sock
```

To make sure that you have the example dependencies installed, use:

```console
$ yarn
```

## Running examples

You can then run any an example from the root of this repository as follows:

```console
$ npm run example examples/<file>
```

## List of examples

* [Listing contexts](./context-ls.ts)
* [Listing containers](./ps.ts)
* [Exec interactively into a container](./exec.ts)
