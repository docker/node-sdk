const test = require('node:test');
const assert = require('node:assert/strict');
const { DockerClient } = require('@docker/node-sdk');

test('CJS import should work', () => {
    assert.equal(typeof DockerClient, 'function');
    assert.equal(typeof DockerClient.fromDockerConfig, 'function');
});

test('CJS module should import functional client', async () => {
    const docker = await DockerClient.fromDockerConfig();
    const apiVersion = await docker.systemPing();
    assert.ok(apiVersion);
    console.log(`  Docker API version: ${apiVersion}`);
});
