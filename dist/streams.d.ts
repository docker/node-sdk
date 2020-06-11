import { BytesMessage as PbBytesMessage } from './protos/streams/v1/streams_pb';
import * as google_protobuf_any_pb from 'google-protobuf/google/protobuf/any_pb';
export declare class BytesMessage extends PbBytesMessage {
    toAny(): google_protobuf_any_pb.Any;
    static fromAny(any: google_protobuf_any_pb.Any): BytesMessage;
    name(): string;
}
