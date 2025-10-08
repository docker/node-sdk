import { assert, test } from 'vitest';
import { demultiplexStream } from '../lib/multiplexed-stream.js';
import { Writable } from 'node:stream';

function createMockStream(): { stream: Writable; data: Buffer[] } {
    const data: Buffer[] = [];
    const stream = new Writable({
        write(
            chunk: any,
            encoding: BufferEncoding,
            callback: (error?: Error | null) => void,
        ) {
            data.push(Buffer.from(chunk));
            callback();
        },
    });
    return { stream, data };
}

function createMultiplexedMessage(streamType: number, content: string): Buffer {
    const contentBuffer = Buffer.from(content, 'utf8');
    const header = Buffer.alloc(8);
    header[0] = streamType; // Stream type
    header.writeUInt32BE(contentBuffer.length, 4); // Content size
    return Buffer.concat([header, contentBuffer]);
}

test('should write stdout message to stdout stream', () => {
    const { stream: stdout, data: stdoutData } = createMockStream();
    const { stream: stderr, data: stderrData } = createMockStream();

    const demuxStream = demultiplexStream(stdout, stderr);
    const message = createMultiplexedMessage(1, 'Hello stdout');

    demuxStream.write(message);

    assert.deepEqual(stdoutData.length, 1);
    assert.deepEqual(stdoutData[0]?.toString(), 'Hello stdout');
    assert.deepEqual(stderrData.length, 0);
});

test('should write stderr message to stderr stream', () => {
    const { stream: stdout, data: stdoutData } = createMockStream();
    const { stream: stderr, data: stderrData } = createMockStream();

    const demuxStream = demultiplexStream(stdout, stderr);
    const message = createMultiplexedMessage(2, 'Hello stderr');

    demuxStream.write(message);

    assert.deepEqual(stderrData.length, 1);
    assert.deepEqual(stderrData[0]?.toString(), 'Hello stderr');
    assert.deepEqual(stdoutData.length, 0);
});

test('should ignore unknown stream types', () => {
    const { stream: stdout, data: stdoutData } = createMockStream();
    const { stream: stderr, data: stderrData } = createMockStream();

    const demuxStream = demultiplexStream(stdout, stderr);
    const message = createMultiplexedMessage(3, 'Unknown stream');

    demuxStream.write(message);

    assert.deepEqual(stdoutData.length, 0);
    assert.deepEqual(stderrData.length, 0);
});

test('should handle multiple messages in single chunk', () => {
    const { stream: stdout, data: stdoutData } = createMockStream();
    const { stream: stderr, data: stderrData } = createMockStream();

    const demuxStream = demultiplexStream(stdout, stderr);
    const message1 = createMultiplexedMessage(1, 'First stdout');
    const message2 = createMultiplexedMessage(2, 'First stderr');
    const combined = Buffer.concat([message1, message2]);

    demuxStream.write(combined);

    assert.deepEqual(stdoutData.length, 1);
    assert.deepEqual(stdoutData[0]?.toString(), 'First stdout');
    assert.deepEqual(stderrData.length, 1);
    assert.deepEqual(stderrData[0]?.toString(), 'First stderr');
});

test('should handle incomplete messages across multiple chunks', () => {
    const { stream: stdout, data: stdoutData } = createMockStream();
    const { stream: stderr, data: _ } = createMockStream();

    const demuxStream = demultiplexStream(stdout, stderr);
    const message = createMultiplexedMessage(1, 'Split message');

    // Send first half
    const firstHalf = message.subarray(0, 10);
    demuxStream.write(firstHalf);
    assert.deepEqual(stdoutData.length, 0); // Should not write yet

    // Send second half
    const secondHalf = message.subarray(10);
    demuxStream.write(secondHalf);
    assert.deepEqual(stdoutData.length, 1);
    assert.deepEqual(stdoutData[0]?.toString(), 'Split message');
});

test('should handle empty content', () => {
    const { stream: stdout, data: stdoutData } = createMockStream();
    const { stream: stderr, data: _ } = createMockStream();

    const demuxStream = demultiplexStream(stdout, stderr);
    const message = createMultiplexedMessage(1, '');

    demuxStream.write(message);

    assert.deepEqual(stdoutData.length, 1);
    assert.deepEqual(stdoutData[0]?.toString(), '');
});

test('should handle very short incomplete chunks', () => {
    const { stream: stdout, data: stdoutData } = createMockStream();
    const { stream: stderr, data: stderrData } = createMockStream();

    const demuxStream = demultiplexStream(stdout, stderr);

    // Send only 4 bytes (less than minimum header size of 8)
    demuxStream.write('test');
    assert.deepEqual(stdoutData.length, 0);
    assert.deepEqual(stderrData.length, 0);
});

test('should handle large content', () => {
    const { stream: stdout, data: stdoutData } = createMockStream();
    const { stream: stderr, data: _ } = createMockStream();

    const demuxStream = demultiplexStream(stdout, stderr);
    const largeContent = 'x'.repeat(10000);
    const message = createMultiplexedMessage(1, largeContent);

    demuxStream.write(message);

    assert.deepEqual(stdoutData.length, 1);
    assert.deepEqual(stdoutData[0]?.toString(), largeContent);
});
