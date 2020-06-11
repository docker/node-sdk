"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BytesMessage = void 0;
const tslib_1 = require("tslib");
const streams_pb_1 = require("./protos/streams/v1/streams_pb");
const google_protobuf_any_pb = tslib_1.__importStar(require("google-protobuf/google/protobuf/any_pb"));
class BytesMessage extends streams_pb_1.BytesMessage {
    toAny() {
        const any = new google_protobuf_any_pb.Any();
        any.pack(this.serializeBinary(), this.name());
        return any;
    }
    static fromAny(any) {
        return any.unpack(streams_pb_1.BytesMessage.deserializeBinary, 'com.docker.api.protos.streams.v1.BytesMessage');
    }
    name() {
        return 'type.googleapis.com/com.docker.api.protos.streams.v1.BytesMessage';
    }
}
exports.BytesMessage = BytesMessage;
//# sourceMappingURL=streams.js.map