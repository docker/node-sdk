"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Streams = exports.Compose = exports.Contexts = exports.Containers = void 0;
const grpc_js_1 = require("@grpc/grpc-js");
const containers_grpc_pb_1 = require("./protos/containers/v1/containers_grpc_pb");
const contexts_grpc_pb_1 = require("./protos/contexts/v1/contexts_grpc_pb");
const compose_grpc_pb_1 = require("./protos/compose/v1/compose_grpc_pb");
const streams_grpc_pb_1 = require("./protos/streams/v1/streams_grpc_pb");
// ~/Library/Containers/com.docker.docker/Data/cli-api.sock
const addr = 'unix:///tmp/backend.sock';
class Containers extends containers_grpc_pb_1.ContainersClient {
    constructor(address = addr) {
        super(address, grpc_js_1.credentials.createInsecure());
    }
}
exports.Containers = Containers;
class Contexts extends contexts_grpc_pb_1.ContextsClient {
    constructor(address = addr) {
        super(address, grpc_js_1.credentials.createInsecure());
    }
}
exports.Contexts = Contexts;
class Compose extends compose_grpc_pb_1.ComposeClient {
    constructor(address = addr) {
        super(address, grpc_js_1.credentials.createInsecure());
    }
}
exports.Compose = Compose;
class Streams extends streams_grpc_pb_1.StreamingClient {
    constructor(address = addr) {
        super(address, grpc_js_1.credentials.createInsecure());
    }
}
exports.Streams = Streams;
//# sourceMappingURL=index.js.map