import { Writable } from 'node:stream';
import stream from 'node:stream';

export function demultiplexStream(
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
): stream.Writable {
    let buffer = new Uint8Array(0);

    return new Writable({
        write(
            chunk: any,
            encoding: BufferEncoding,
            cb: (error?: Error | null) => void,
        ) {
            try {
                // Convert chunk to Uint8Array if needed
                const data =
                    chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);

                // Append new chunk data to buffer
                const newBuffer = new Uint8Array(buffer.length + data.length);
                newBuffer.set(buffer, 0);
                newBuffer.set(data, buffer.length);
                buffer = newBuffer;

                // Process complete messages from buffer
                while (buffer.length >= 8) {
                    // Read first byte for stream destination
                    const streamType = buffer[0];

                    // Read last 4 bytes as content size (big endian uint32)
                    const contentSize =
                        (buffer[4]! << 24) |
                        (buffer[5]! << 16) |
                        (buffer[6]! << 8) |
                        buffer[7]!;

                    // Check if we have enough data for the complete message
                    if (buffer.length >= 8 + contentSize) {
                        // Extract content
                        const content = buffer.slice(8, 8 + contentSize);

                        // Send to appropriate stream
                        if (streamType === 1) {
                            stdout.write(Buffer.from(content));
                        } else if (streamType === 2) {
                            stderr.write(Buffer.from(content));
                        }
                        // Ignore other stream types

                        // Remove processed message from buffer
                        buffer = buffer.slice(8 + contentSize);
                    } else {
                        // Not enough data for complete message, wait for more
                        break;
                    }
                }
                cb();
            } catch (error) {
                cb(error as Error);
            }
        },
    });
}
