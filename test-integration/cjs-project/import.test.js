const test = require('node:test');
const assert = require('node:assert/strict');

const { DockerClient } = require('@docker/node-sdk');

test('CJS module should import correctly', () => {
    assert.strictEqual(typeof DockerClient, 'function');
    assert.strictEqual(typeof DockerClient.fromDockerConfig, 'function');
});

test('CJS module should import functional client', async () => {
    const docker = await DockerClient.fromDockerConfig();
    const apiVersion = await docker.systemPing();
    assert.notStrictEqual(apiVersion, null);
    console.log(`  Docker API version: ${apiVersion}`);
});
