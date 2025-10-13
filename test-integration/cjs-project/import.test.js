import { test, assert } from 'vitest';

const { DockerClient } = require('@docker/node-sdk');

test('CJS module should import correctly', () => {
    assert.equal(typeof DockerClient, 'function');
    assert.equal(typeof DockerClient.fromDockerConfig, 'function');
});

test('CJS module should import functional client', async () => {
    const docker = await DockerClient.fromDockerConfig();
    const apiVersion = await docker.systemPing();
    assert.ok(apiVersion);
    console.log(`  Docker API version: ${apiVersion}`);
});
