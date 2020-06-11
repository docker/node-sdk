import { BytesMessage as PbBytesMessage } from './protos/streams/v1/streams_pb';
import * as google_protobuf_any_pb from 'google-protobuf/google/protobuf/any_pb';

export class BytesMessage extends PbBytesMessage {
  toAny(): google_protobuf_any_pb.Any {
    const any = new google_protobuf_any_pb.Any();
    any.pack(this.serializeBinary(), this.name());
    return any;
  }

  static fromAny(any: google_protobuf_any_pb.Any): BytesMessage {
    return (any.unpack(
      PbBytesMessage.deserializeBinary,
      'com.docker.api.protos.streams.v1.BytesMessage'
    ) as unknown) as BytesMessage;
  }

  name(): string {
    return 'type.googleapis.com/com.docker.api.protos.streams.v1.BytesMessage';
  }
}
