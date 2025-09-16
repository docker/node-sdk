import { HTTPParser } from './http.js';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`);
  }
}

function assertEqual(actual: any, expected: any) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

test('parseChunkedBody should parse simple chunked data', () => {
  const chunkedData = '5\r\nhello\r\n5\r\nworld\r\n0\r\n\r\n';
  const result = HTTPParser.parseChunkedBody(chunkedData);
  assertEqual(result, 'helloworld');
});

test('parseChunkedBody should handle single chunk', () => {
  const chunkedData = 'A\r\nhello test\r\n0\r\n\r\n';
  const result = HTTPParser.parseChunkedBody(chunkedData);
  assertEqual(result, 'hello test');
});

test('parseChunkedBody should handle empty chunks', () => {
  const chunkedData = '0\r\n\r\n';
  const result = HTTPParser.parseChunkedBody(chunkedData);
  assertEqual(result, '');
});

test('parseChunkedBody should handle chunks with newlines', () => {
  const chunkedData = '6\r\nhello\n\r\n6\r\nworld\n\r\n0\r\n\r\n';
  const result = HTTPParser.parseChunkedBody(chunkedData);
  assertEqual(result, 'hello\nworld\n');
});

test('parseChunkedBody should handle hexadecimal chunk sizes', () => {
  const chunkedData = 'F\r\nhello wonderful\r\n0\r\n\r\n';
  const result = HTTPParser.parseChunkedBody(chunkedData);
  assertEqual(result, 'hello wonderful');
});

test('parseChunkedBody should handle JSON data in chunks', () => {
  const jsonData = '{"message":"test"}';
  const chunkSize = jsonData.length.toString(16);
  const chunkedData = `${chunkSize}\r\n${jsonData}\r\n0\r\n\r\n`;
  const result = HTTPParser.parseChunkedBody(chunkedData);
  assertEqual(result, jsonData);
});