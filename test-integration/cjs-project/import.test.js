const test = require('node:test');
const assert = require('node:assert/strict');
const { DockerClient } = require('@docker/node-sdk');

test('CJS import should work', () => {
    assert.equal(typeof DockerClient, 'function');
    assert.equal(typeof DockerClient.fromDockerConfig, 'function');
});
