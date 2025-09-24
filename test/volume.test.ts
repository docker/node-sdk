import { assert, test } from 'vitest';
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

    assert.isNotNull(createdVolume);
    assert.equal(createdVolume.Name, volumeName);
    console.log(`  Created volume: ${createdVolume.Name}`);

    // 2. Inspect volume
    const inspectedVolume = await client.volumeInspect(volumeName);
    assert.isNotNull(inspectedVolume);
    assert.equal(inspectedVolume.Name, volumeName);
    assert.equal(inspectedVolume.Driver, 'local');
    assert.equal(inspectedVolume.Labels?.test, 'lifecycle');
    console.log(`  Inspected volume: ${inspectedVolume.Name}`);

    // 3. List volumes and verify our volume exists
    const volumeList = await client.volumeList();
    assert.isNotNull(volumeList.Volumes);
    const foundVolume = volumeList.Volumes?.find((v) => v.Name === volumeName);
    assert.isNotNull(foundVolume);
    assert.equal(foundVolume?.Name, volumeName);
    console.log(`  Found volume in list: ${foundVolume?.Name}`);

    // 4. Delete volume
    await client.volumeDelete(volumeName);
    console.log(`  Deleted volume: ${volumeName}`);

    // 5. Verify volume is deleted by trying to inspect (should fail)
    try {
        await client.volumeInspect(volumeName);
        assert.fail('Volume should not exist after deletion');
    } catch (error: any) {
        assert.include(error.message?.toLowerCase() || '', 'not found');
        console.log(`  Confirmed volume deletion: ${volumeName}`);
    }
});
