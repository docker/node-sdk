import { assert, test } from 'vitest';
import { HTTPParser } from '../lib/http.js';

test('parseChunkedBody should parse simple chunked data', () => {
    const chunkedData = '5\r\nhello\r\n5\r\nworld\r\n0\r\n\r\n';
    const result = HTTPParser.parseChunkedBody(chunkedData);
    assert.deepEqual(result, 'helloworld');
});

test('parseChunkedBody should handle single chunk', () => {
    const chunkedData = 'A\r\nhello test\r\n0\r\n\r\n';
    const result = HTTPParser.parseChunkedBody(chunkedData);
    assert.deepEqual(result, 'hello test');
});

test('parseChunkedBody should handle empty chunks', () => {
    const chunkedData = '0\r\n\r\n';
    const result = HTTPParser.parseChunkedBody(chunkedData);
    assert.deepEqual(result, '');
});

test('parseChunkedBody should handle chunks with newlines', () => {
    const chunkedData = '6\r\nhello\n\r\n6\r\nworld\n\r\n0\r\n\r\n';
    const result = HTTPParser.parseChunkedBody(chunkedData);
    assert.deepEqual(result, 'hello\nworld\n');
});

test('parseChunkedBody should handle hexadecimal chunk sizes', () => {
    const chunkedData = 'F\r\nhello wonderful\r\n0\r\n\r\n';
    const result = HTTPParser.parseChunkedBody(chunkedData);
    assert.deepEqual(result, 'hello wonderful');
});

test('parseChunkedBody should handle JSON data in chunks', () => {
    const jsonData = '{"message":"test"}';
    const chunkSize = jsonData.length.toString(16);
    const chunkedData = `${chunkSize}\r\n${jsonData}\r\n0\r\n\r\n`;
    const result = HTTPParser.parseChunkedBody(chunkedData);
    assert.deepEqual(result, jsonData);
});

// Tests for extractChunks function
test('extractChunks should extract single complete chunk', () => {
    const buffer = '5\r\nhello\r\n0\r\n\r\n';
    const result = HTTPParser.extractChunks(buffer);
    assert.deepEqual(result.chunks.length, 2);
    assert.deepEqual(result.chunks[0], 'hello');
    assert.deepEqual(result.chunks[1], '');
});

test('extractChunks should extract multiple complete chunks', () => {
    const buffer = '5\r\nhello\r\n5\r\nworld\r\n0\r\n\r\n';
    const result = HTTPParser.extractChunks(buffer);
    assert.deepEqual(result.chunks.length, 3);
    assert.deepEqual(result.chunks[0], 'hello');
    assert.deepEqual(result.chunks[1], 'world');
    assert.deepEqual(result.chunks[2], '');
});

test('extractChunks should handle incomplete chunk', () => {
    const buffer = '5\r\nhel';
    const result = HTTPParser.extractChunks(buffer);
    assert.deepEqual(result.chunks.length, 0);
    assert.deepEqual(result.remainingBuffer, '5\r\nhel');
});

test('extractChunks should handle incomplete chunk size line', () => {
    const buffer = '5';
    const result = HTTPParser.extractChunks(buffer);
    assert.deepEqual(result.chunks.length, 0);
    assert.deepEqual(result.remainingBuffer, '5');
});

test('extractChunks should handle empty buffer', () => {
    const buffer = '';
    const result = HTTPParser.extractChunks(buffer);
    assert.deepEqual(result.chunks.length, 0);
    assert.deepEqual(result.remainingBuffer, '');
});

test('extractChunks should handle text with newlines', () => {
    const buffer = '6\r\nhello\n\r\n6\r\nworld\n\r\n0\r\n\r\n';
    const result = HTTPParser.extractChunks(buffer);
    assert.deepEqual(result.chunks.length, 3);
    assert.deepEqual(result.chunks[0], 'hello\n');
    assert.deepEqual(result.chunks[1], 'world\n');
    assert.deepEqual(result.chunks[2], '');
});

test('extractChunks should handle hexadecimal chunk sizes', () => {
    const buffer = 'A\r\nhello test\r\n0\r\n\r\n';
    const result = HTTPParser.extractChunks(buffer);
    assert.deepEqual(result.chunks.length, 2);
    assert.deepEqual(result.chunks[0], 'hello test');
    assert.deepEqual(result.chunks[1], '');
});

test('extractChunks should handle partial end marker', () => {
    const buffer = '5\r\nhello\r\n0\r\n';
    const result = HTTPParser.extractChunks(buffer);
    assert.deepEqual(result.chunks.length, 2);
    assert.deepEqual(result.chunks[0], 'hello');
    assert.deepEqual(result.chunks[1], '');
    assert.deepEqual(result.remainingBuffer, '');
});

test('extractChunks should handle mixed complete and incomplete chunks', () => {
    const buffer = '5\r\nhello\r\n3\r\nwo';
    const result = HTTPParser.extractChunks(buffer);
    assert.deepEqual(result.chunks.length, 1);
    assert.deepEqual(result.chunks[0], 'hello');
    assert.deepEqual(result.remainingBuffer, '3\r\nwo');
});
