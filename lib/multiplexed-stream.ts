import * as stream from 'node:stream';

export function demultiplexStream(
    stdout: stream.Writable,
    stderr: stream.Writable,
): stream.Writable {
    let buffer = Buffer.alloc(0);

    return new stream.Writable({
        write(
            chunk: any,
            encoding: BufferEncoding,
            callback: (error?: Error | null) => void,
        ) {
            try {
                // Convert chunk to Buffer if it's not already
                const data = Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk, encoding);

                // Append new chunk data to buffer
                buffer = Buffer.concat([buffer, data]);

                // Process complete messages from buffer
                while (buffer.length >= 8) {
                    // Read first byte for stream destination
                    const streamType = buffer[0];

                    // Read last 4 bytes as content size (big endian uint32)
                    const contentSize = buffer.readUInt32BE(4);

                    // Check if we have enough data for the complete message
                    if (buffer.length >= 8 + contentSize) {
                        // Extract content
                        const content = buffer.subarray(8, 8 + contentSize);

                        // Send to appropriate stream
                        if (streamType === 1) {
                            stdout.write(content);
                        } else if (streamType === 2) {
                            stderr.write(content);
                        }
                        // Ignore other stream types

                        // Remove processed message from buffer
                        buffer = buffer.subarray(8 + contentSize);
                    } else {
                        // Not enough data for complete message, wait for more
                        break;
                    }
                }

                callback();
            } catch (error) {
                callback(
                    error instanceof Error ? error : new Error(String(error)),
                );
            }
        },
    });
}
