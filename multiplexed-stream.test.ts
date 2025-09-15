import { createMultiplexedStreamCallback } from './multiplexed-stream.js';
import { Writable } from 'stream';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`);
  }
}

function assertEqual(actual: any, expected: any) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function createMockStream(): { stream: Writable; data: Buffer[] } {
  const data: Buffer[] = [];
  const stream = new Writable({
    write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
      data.push(Buffer.from(chunk));
      callback();
    }
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
  
  const callback = createMultiplexedStreamCallback(stdout, stderr);
  const message = createMultiplexedMessage(1, 'Hello stdout');
  
  callback(message.toString('utf8'));
  
  assertEqual(stdoutData.length, 1);
  assertEqual(stdoutData[0].toString(), 'Hello stdout');
  assertEqual(stderrData.length, 0);
});

test('should write stderr message to stderr stream', () => {
  const { stream: stdout, data: stdoutData } = createMockStream();
  const { stream: stderr, data: stderrData } = createMockStream();
  
  const callback = createMultiplexedStreamCallback(stdout, stderr);
  const message = createMultiplexedMessage(2, 'Hello stderr');
  
  callback(message.toString('utf8'));
  
  assertEqual(stderrData.length, 1);
  assertEqual(stderrData[0].toString(), 'Hello stderr');
  assertEqual(stdoutData.length, 0);
});

test('should ignore unknown stream types', () => {
  const { stream: stdout, data: stdoutData } = createMockStream();
  const { stream: stderr, data: stderrData } = createMockStream();
  
  const callback = createMultiplexedStreamCallback(stdout, stderr);
  const message = createMultiplexedMessage(3, 'Unknown stream');
  
  callback(message.toString('utf8'));
  
  assertEqual(stdoutData.length, 0);
  assertEqual(stderrData.length, 0);
});

test('should handle multiple messages in single chunk', () => {
  const { stream: stdout, data: stdoutData } = createMockStream();
  const { stream: stderr, data: stderrData } = createMockStream();
  
  const callback = createMultiplexedStreamCallback(stdout, stderr);
  const message1 = createMultiplexedMessage(1, 'First stdout');
  const message2 = createMultiplexedMessage(2, 'First stderr');
  const combined = Buffer.concat([message1, message2]);
  
  callback(combined.toString('utf8'));
  
  assertEqual(stdoutData.length, 1);
  assertEqual(stdoutData[0].toString(), 'First stdout');
  assertEqual(stderrData.length, 1);
  assertEqual(stderrData[0].toString(), 'First stderr');
});

test('should handle incomplete messages across multiple chunks', () => {
  const { stream: stdout, data: stdoutData } = createMockStream();
  const { stream: stderr, data: stderrData } = createMockStream();
  
  const callback = createMultiplexedStreamCallback(stdout, stderr);
  const message = createMultiplexedMessage(1, 'Split message');
  
  // Send first half
  const firstHalf = message.subarray(0, 10);
  callback(firstHalf.toString('utf8'));
  assertEqual(stdoutData.length, 0); // Should not write yet
  
  // Send second half
  const secondHalf = message.subarray(10);
  callback(secondHalf.toString('utf8'));
  assertEqual(stdoutData.length, 1);
  assertEqual(stdoutData[0].toString(), 'Split message');
});

test('should handle empty content', () => {
  const { stream: stdout, data: stdoutData } = createMockStream();
  const { stream: stderr, data: stderrData } = createMockStream();
  
  const callback = createMultiplexedStreamCallback(stdout, stderr);
  const message = createMultiplexedMessage(1, '');
  
  callback(message.toString('utf8'));
  
  assertEqual(stdoutData.length, 1);
  assertEqual(stdoutData[0].toString(), '');
});

test('should handle very short incomplete chunks', () => {
  const { stream: stdout, data: stdoutData } = createMockStream();
  const { stream: stderr, data: stderrData } = createMockStream();
  
  const callback = createMultiplexedStreamCallback(stdout, stderr);
  
  // Send only 4 bytes (less than minimum header size of 8)
  callback('test');
  assertEqual(stdoutData.length, 0);
  assertEqual(stderrData.length, 0);
});

test('should handle large content', () => {
  const { stream: stdout, data: stdoutData } = createMockStream();
  const { stream: stderr, data: stderrData } = createMockStream();
  
  const callback = createMultiplexedStreamCallback(stdout, stderr);
  const largeContent = 'x'.repeat(10000);
  const message = createMultiplexedMessage(1, largeContent);
  
  callback(message.toString('utf8'));
  
  assertEqual(stdoutData.length, 1);
  assertEqual(stdoutData[0].toString(), largeContent);
});