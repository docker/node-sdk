import { assert, test } from 'vitest';
import { DockerClient } from '../lib/docker-client.js';

// Test Docker System API connectivity and information

test('systemPing should return API version', async () => {
    const client = await DockerClient.fromDockerConfig();
    const apiVersion = await client.systemPing();
    assert.isNotNull(apiVersion);
    console.log(`  Docker API version: ${apiVersion}`);
});

test('systemInfo should return system information', async () => {
    const client = await DockerClient.fromDockerConfig();
    const info = await client.systemInfo();
    assert.isNotNull(info);
    assert.isNotNull(info.ID);
    console.log(`  Docker system ID: ${info.ID}`);
});

test('systemVersion should return version information', async () => {
    const client = await DockerClient.fromDockerConfig();
    const version = await client.systemVersion();
    assert.isNotNull(version);
    assert.isNotNull(version.Version);
    console.log(`  Docker version: ${version.Version}`);
});
