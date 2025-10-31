import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DockerClient } from '../lib/docker-client.js';

// Test Docker System API connectivity and information

test('systemPing should return API version', async () => {
    const client = await DockerClient.fromDockerConfig();
    const apiVersion = await client.systemPing();
    assert.notStrictEqual(apiVersion, null);
    console.log(`  Docker API version: ${apiVersion}`);
});

test('systemInfo should return system information', async () => {
    const client = await DockerClient.fromDockerConfig();
    const info = await client.systemInfo();
    assert.notStrictEqual(info, null);
    assert.notStrictEqual(info.ID, null);
    console.log(`  Docker system ID: ${info.ID}`);
});

test('systemVersion should return version information', async () => {
    const client = await DockerClient.fromDockerConfig();
    const version = await client.systemVersion();
    assert.notStrictEqual(version, null);
    assert.notStrictEqual(version.Version, null);
    console.log(`  Docker version: ${version.Version}`);
});
