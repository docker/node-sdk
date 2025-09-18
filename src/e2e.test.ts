import { assert, test } from 'vitest';
import { DockerClient } from './docker-client.js';
import { Filter } from './filter.js';

// Test Docker API connectivity
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

test('containerList should return list of containers', async () => {
    const client = await DockerClient.fromDockerConfig();
    const containers = await client.containerList({ all: true });
    assert.isNotNull(containers);
    console.log(`  Found ${containers.length} containers`);
});

test('imageList should return list of images', async () => {
    const client = await DockerClient.fromDockerConfig();
    const images = await client.imageList();
    assert.isNotNull(images);
    console.log(`  Found ${images.length} images`);
});

test('networkList should return list of networks', async () => {
    const client = await DockerClient.fromDockerConfig();
    const networks = await client.networkList();
    assert.isNotNull(networks);
    console.log(`  Found ${networks.length} networks`);
});

test('volumeList should return list of volumes', async () => {
    const client = await DockerClient.fromDockerConfig();
    const volumes = await client.volumeList();
    assert.isNotNull(volumes);
    console.log(`  Found ${volumes.Volumes?.length || 0} volumes`);
});

test('container lifecycle should work end-to-end', async () => {
    const client = await DockerClient.fromDockerConfig();
    let containerId: string | undefined;

    try {
        await client.imageCreate(
            (event) => {
                console.log(event);
            },
            {
                fromImage: 'docker.io/library/nginx',
                tag: 'latest',
            },
        );

        console.log('  Creating nginx container...');
        // Create container with label
        const createResponse = await client.containerCreate(
            {
                Image: 'docker.io/library/nginx',
                Labels: {
                    'test.type': 'e2e',
                },
            },
            {
                name: 'e2e-test-container',
            },
        );
        containerId = createResponse.Id;
        assert.isNotNull(containerId);
        console.log(`    Container created: ${containerId?.substring(0, 12)}`);

        // Test container listing with label filter
        console.log('  Testing container filter by label...');
        const filteredContainers = await client.containerList({
            all: true,
            filters: new Filter().add('label', 'test.type=e2e'),
        });
        assert.isNotNull(filteredContainers);
        const foundContainer = filteredContainers.find(
            (c) => c.Id === containerId,
        );
        assert.isNotNull(foundContainer);
        console.log(
            `    Found ${filteredContainers.length} container(s) with label test.type=e2e`,
        );

        // Start container
        console.log('  Starting container...');
        await client.containerStart(containerId);
        console.log('    Container started');

        // Resize TTY
        console.log('  Resizing container TTY...');
        await client.containerResize(containerId, 24, 80);
        console.log('    TTY resized successfully');

        // Inspect container
        console.log('  Inspecting container...');
        const inspectResponse = await client.containerInspect(containerId);
        assert.isNotNull(inspectResponse);
        assert.equal(inspectResponse.State?.Running, true);
        console.log(`    Container state: ${inspectResponse.State?.Status}`);

        // Pause container
        console.log('  Pausing container...');
        await client.containerPause(containerId);
        console.log('    Container paused');

        // Verify paused state
        const pausedInspect = await client.containerInspect(containerId);
        assert.equal(pausedInspect.State?.Paused, true);
        console.log(
            `    Verified paused state: ${pausedInspect.State?.Status}`,
        );

        // Unpause container
        console.log('  Unpausing container...');
        await client.containerUnpause(containerId);
        console.log('    Container unpaused');

        // Verify running state
        const unpausedInspect = await client.containerInspect(containerId);
        assert.equal(unpausedInspect.State?.Running, true);
        assert.equal(unpausedInspect.State?.Paused, false);
        console.log(
            `    Verified running state: ${unpausedInspect.State?.Status}`,
        );

        // Stop container
        console.log('  Stopping container...');
        await client.containerStop(containerId, { timeout: 10 });
        console.log('    Container stopped');

        // Restart container
        console.log('  Restarting container...');
        await client.containerRestart(containerId, { timeout: 10 });
        console.log('    Container restarted');

        // Verify running again
        const restartedInspect = await client.containerInspect(containerId);
        assert.equal(restartedInspect.State?.Running, true);
        console.log(
            `    Verified restarted state: ${restartedInspect.State?.Status}`,
        );

        // Kill container
        console.log('  Killing container...');
        await client.containerKill(containerId, { signal: 'SIGKILL' });
        console.log('    Container killed');

        // Final inspect
        console.log('  Final inspection...');
        const finalInspect = await client.containerInspect(containerId);
        assert.equal(finalInspect.State?.Running, false);
    } finally {
        // Clean up: delete container
        if (containerId) {
            console.log('  Deleting container...');
            try {
                await client.containerDelete(containerId, { force: true });
                console.log('    Container deleted successfully');
            } catch (deleteError) {
                console.log(
                    `    Warning: Failed to delete container: ${(deleteError as any)?.message}`,
                );
            }
        }
    }
}, 30000);

test('network lifecycle should work end-to-end', async () => {
    const client = await DockerClient.fromDockerConfig();
    let networkId: string | undefined;

    try {
        console.log('  Prune unused networks...');
        await client.networkPrune();

        console.log('  Creating test network...');
        // Create network with label
        const createResponse = await client.networkCreate({
            Name: 'e2e-test-network',
            Labels: {
                'test.type': 'e2e',
            },
            Driver: 'bridge',
        });
        networkId = createResponse.Id;
        assert.isNotNull(networkId);
        console.log(`    Network created: ${networkId.substring(0, 12)}`);

        // Test network listing with label filter
        console.log('  Testing network filter by label...');
        const filteredNetworks = await client.networkList({
            filters: new Filter().add('label', 'test.type=e2e'),
        });
        assert.isNotNull(filteredNetworks);
        const foundNetwork = filteredNetworks.find((n) => n.Id === networkId);
        assert.isNotNull(foundNetwork);
        console.log(
            `    Found ${filteredNetworks.length} network(s) with label test.type=e2e`,
        );

        // Inspect network
        console.log('  Inspecting network...');
        const inspectResponse = await client.networkInspect(networkId);
        assert.isNotNull(inspectResponse);
        assert.equal(inspectResponse.Name, 'e2e-test-network');
        assert.equal(inspectResponse.Driver, 'bridge');
        assert.equal(inspectResponse.Labels?.['test.type'], 'e2e');
        console.log(`    Network driver: ${inspectResponse.Driver}`);
        console.log(`    Network scope: ${inspectResponse.Scope}`);
    } finally {
        // Clean up: delete network
        if (networkId) {
            console.log('  Deleting network...');
            try {
                await client.networkDelete(networkId);
                console.log('    Network deleted successfully');
            } catch (deleteError) {
                console.log(
                    `    Warning: Failed to delete network: ${(deleteError as any)?.message}`,
                );
            }
        }
    }
});
