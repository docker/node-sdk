import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DockerClient } from '@docker/node-sdk';

test('ES module import should work', () => {
    assert.equal(typeof DockerClient, 'function');
    assert.equal(typeof DockerClient.fromDockerConfig, 'function');
});

test('ES module should import functional client', async () => {
    const docker = await DockerClient.fromDockerConfig();
    const apiVersion = await docker.systemPing();
    assert.ok(apiVersion);
    console.log(`  Docker API version: ${apiVersion}`);
});
