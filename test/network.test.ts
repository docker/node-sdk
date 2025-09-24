import { assert, test } from 'vitest';
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

    assert.isNotNull(createdNetwork);
    assert.isNotNull(createdNetwork.Id);
    console.log(`  Created network: ${networkName} (${createdNetwork.Id})`);

    // 2. Inspect network
    const inspectedNetwork = await client.networkInspect(networkName);
    assert.isNotNull(inspectedNetwork);
    assert.equal(inspectedNetwork.Name, networkName);
    assert.equal(inspectedNetwork.Driver, 'bridge');
    assert.equal(inspectedNetwork.Labels?.test, 'lifecycle');
    assert.equal(inspectedNetwork.IPAM?.Driver, 'default');
    console.log(`  Inspected network: ${inspectedNetwork.Name}`);

    // 3. List networks and verify our network exists
    const networkList = await client.networkList();
    assert.isNotNull(networkList);
    const foundNetwork = networkList.find((n) => n.Name === networkName);
    assert.isNotNull(foundNetwork);
    assert.equal(foundNetwork?.Name, networkName);
    assert.equal(foundNetwork?.Driver, 'bridge');
    console.log(`  Found network in list: ${foundNetwork?.Name}`);

    // 4. Delete network
    await client.networkDelete(networkName);
    console.log(`  Deleted network: ${networkName}`);

    // 5. Verify network is deleted by trying to inspect (should fail)
    try {
        await client.networkInspect(networkName);
        assert.fail('Network should not exist after deletion');
    } catch (error: any) {
        assert.equal(error.name, 'NotFoundError');
        console.log(`  Confirmed network deletion: ${networkName}`);
    }
});
