import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DockerClient } from '../lib/docker-client.js';

// Test Docker Volume API functionality

test('volume lifecycle: create, inspect, list, delete', async () => {
    const client = await DockerClient.fromDockerConfig();
    const volumeName = `test-volume-${Date.now()}`;

    // 1. Create volume
    const createdVolume = await client.volumeCreate({
        Name: volumeName,
        Driver: 'local',
        Labels: {
            test: 'lifecycle',
        },
    });

    assert.notStrictEqual(createdVolume, null);
    assert.strictEqual(createdVolume.Name, volumeName);
    console.log(`  Created volume: ${createdVolume.Name}`);

    // 2. Inspect volume
    const inspectedVolume = await client.volumeInspect(volumeName);
    assert.notStrictEqual(inspectedVolume, null);
    assert.strictEqual(inspectedVolume.Name, volumeName);
    assert.strictEqual(inspectedVolume.Driver, 'local');
    assert.strictEqual(inspectedVolume.Labels?.test, 'lifecycle');
    console.log(`  Inspected volume: ${inspectedVolume.Name}`);

    // 3. List volumes and verify our volume exists
    const volumeList = await client.volumeList();
    assert.notStrictEqual(volumeList.Volumes, null);
    const foundVolume = volumeList.Volumes?.find((v) => v.Name === volumeName);
    assert.notStrictEqual(foundVolume, null);
    assert.strictEqual(foundVolume?.Name, volumeName);
    console.log(`  Found volume in list: ${foundVolume?.Name}`);

    // 4. Delete volume
    await client.volumeDelete(volumeName);
    console.log(`  Deleted volume: ${volumeName}`);

    // 5. Verify volume is deleted by trying to inspect (should fail)
    try {
        await client.volumeInspect(volumeName);
        throw new Error('Volume should not exist after deletion');
    } catch (error: any) {
        assert.strictEqual(error.name, 'NotFoundError');
        console.log(`  Confirmed volume deletion: ${volumeName}`);
    }
});
