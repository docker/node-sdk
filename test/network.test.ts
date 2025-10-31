import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DockerClient } from '../lib/docker-client.js';

test('network lifecycle: create, inspect, list, delete', async () => {
    const client = await DockerClient.fromDockerConfig();
    const networkName = `test-network-${Date.now()}`;

    // 1. Create network
    const createdNetwork = await client.networkCreate({
        Name: networkName,
        Driver: 'bridge',
        Labels: {
            test: 'lifecycle',
        },
        IPAM: {
            Driver: 'default',
            Config: [
                {
                    Subnet: '172.20.0.0/16',
                },
            ],
        },
    });

    assert.notStrictEqual(createdNetwork, null);
    assert.notStrictEqual(createdNetwork.Id, null);
    console.log(`  Created network: ${networkName} (${createdNetwork.Id})`);

    // 2. Inspect network
    const inspectedNetwork = await client.networkInspect(networkName);
    assert.notStrictEqual(inspectedNetwork, null);
    assert.strictEqual(inspectedNetwork.Name, networkName);
    assert.strictEqual(inspectedNetwork.Driver, 'bridge');
    assert.strictEqual(inspectedNetwork.Labels?.test, 'lifecycle');
    assert.strictEqual(inspectedNetwork.IPAM?.Driver, 'default');
    console.log(`  Inspected network: ${inspectedNetwork.Name}`);

    // 3. List networks and verify our network exists
    const networkList = await client.networkList();
    assert.notStrictEqual(networkList, null);
    const foundNetwork = networkList.find((n) => n.Name === networkName);
    assert.notStrictEqual(foundNetwork, null);
    assert.strictEqual(foundNetwork?.Name, networkName);
    assert.strictEqual(foundNetwork?.Driver, 'bridge');
    console.log(`  Found network in list: ${foundNetwork?.Name}`);

    // 4. Delete network
    await client.networkDelete(networkName);
    console.log(`  Deleted network: ${networkName}`);

    // 5. Verify network is deleted by trying to inspect (should fail)
    try {
        await client.networkInspect(networkName);
        throw new Error('Network should not exist after deletion');
    } catch (error: any) {
        assert.strictEqual(error.name, 'NotFoundError');
        console.log(`  Confirmed network deletion: ${networkName}`);
    }
});
