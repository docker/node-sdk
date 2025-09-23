import { assert, test } from 'vitest';
import { DockerClient } from '../lib/docker-client.js';

// Test Docker Volume API functionality

test('volumeList should return list of volumes', async () => {
    const client = await DockerClient.fromDockerConfig();
    const volumes = await client.volumeList();
    assert.isNotNull(volumes);
    console.log(`  Found ${volumes.Volumes?.length || 0} volumes`);
});
