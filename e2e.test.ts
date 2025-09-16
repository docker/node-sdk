import * as net from 'net';
import { DockerClient, Credentials, IdentityToken } from './docker-client.js';
import { Filter } from './filter.js';

function test(name: string, fn: () => Promise<void>) {
  return fn()
    .then(() => console.log(`✓ ${name}`))
    .catch(error => console.log(`✗ ${name}: ${error.message}`));
}

function assertEqual(actual: any, expected: any) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertNotNull(value: any) {
  if (value === null || value === undefined) {
    throw new Error(`Expected non-null value, got ${value}`);
  }
}

// Run all tests
async function runTests() {
  console.log('Running DockerClient E2E Tests...\n');
  
  try {
    // Test Docker API connectivity
    await test('systemPing should return API version', async () => {
      const client = await DockerClient.fromDockerConfig();
      const apiVersion = await client.systemPing();
      assertNotNull(apiVersion);
      console.log(`  Docker API version: ${apiVersion}`);
    });

    await test('systemInfo should return system information', async () => {
      const client = await DockerClient.fromDockerConfig();
      const info = await client.systemInfo();
      assertNotNull(info);
      assertNotNull(info.ID);
      console.log(`  Docker system ID: ${info.ID}`);
    });

    await test('systemVersion should return version information', async () => {
      const client = await DockerClient.fromDockerConfig();
      const version = await client.systemVersion();
      assertNotNull(version);
      assertNotNull(version.Version);
      console.log(`  Docker version: ${version.Version}`);
    });

    await test('containerList should return list of containers', async () => {
      const client = await DockerClient.fromDockerConfig();
      const containers = await client.containerList({ all: true });
      assertNotNull(containers);
      console.log(`  Found ${containers.length} containers`);
    });

    await test('imageList should return list of images', async () => {
      const client = await DockerClient.fromDockerConfig();
      const images = await client.imageList();
      assertNotNull(images);
      console.log(`  Found ${images.length} images`);
    });

    await test('networkList should return list of networks', async () => {
      const client = await DockerClient.fromDockerConfig();
      const networks = await client.networkList();
      assertNotNull(networks);
      console.log(`  Found ${networks.length} networks`);
    });

    await test('volumeList should return list of volumes', async () => {
      const client = await DockerClient.fromDockerConfig();
      const volumes = await client.volumeList();
      assertNotNull(volumes);
      console.log(`  Found ${volumes.volumes?.length || 0} volumes`);
    });

    await test('container lifecycle should work end-to-end', async () => {
      const client = await DockerClient.fromDockerConfig();
      let containerId: string | undefined;

      try {
        console.log('  Creating nginx container...');
        // Create container with label
        const createResponse = await client.containerCreate({
          Image: 'nginx:latest',
          Labels: {
            'test.type': 'e2e',
          },
        }, {
          name: 'e2e-test-container'
        });
        containerId = createResponse.Id;
        assertNotNull(containerId);
        console.log(`    Container created: ${containerId.substring(0, 12)}`);

        // Test container listing with label filter
        console.log('  Testing container filter by label...');
        const filteredContainers = await client.containerList({
          all: true,
          filters: new Filter().add('label', 'test.type=e2e')
        });
        assertNotNull(filteredContainers);
        const foundContainer = filteredContainers.find(c => c.Id === containerId);
        assertNotNull(foundContainer);
        console.log(`    Found ${filteredContainers.length} container(s) with label test.type=e2e`);

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
        assertNotNull(inspectResponse);
        assertEqual(inspectResponse.State.Running, true);
        console.log(`    Container state: ${inspectResponse.State.Status}`);

        // Pause container
        console.log('  Pausing container...');
        await client.containerPause(containerId);
        console.log('    Container paused');

        // Verify paused state
        const pausedInspect = await client.containerInspect(containerId);
        assertEqual(pausedInspect.State.Paused, true);
        console.log(`    Verified paused state: ${pausedInspect.State.Status}`);

        // Unpause container
        console.log('  Unpausing container...');
        await client.containerUnpause(containerId);
        console.log('    Container unpaused');

        // Verify running state
        const unpausedInspect = await client.containerInspect(containerId);
        assertEqual(unpausedInspect.State.Running, true);
        assertEqual(unpausedInspect.State.Paused, false);
        console.log(`    Verified running state: ${unpausedInspect.State.Status}`);

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
        assertEqual(restartedInspect.State.Running, true);
        console.log(`    Verified restarted state: ${restartedInspect.State.Status}`);

        // Kill container
        console.log('  Killing container...');
        await client.containerKill(containerId, { signal: 'SIGKILL' });
        console.log('    Container killed');

        // Final inspect
        console.log('  Final inspection...');
        const finalInspect = await client.containerInspect(containerId);
        assertEqual(finalInspect.State.Running, false);

      } finally {
        // Clean up: delete container
        if (containerId) {
          console.log('  Deleting container...');
          try {
            await client.containerDelete(containerId, { force: true });
            console.log('    Container deleted successfully');
          } catch (deleteError) {
            console.log(`    Warning: Failed to delete container: ${deleteError.message}`);
          }
        }
      }
    });

    await test('network lifecycle should work end-to-end', async () => {
      const client = await DockerClient.fromDockerConfig();
      let networkId: string | undefined;

      try {
        console.log('  Prune unused networks...');
        await client.networkPrune()

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
        assertNotNull(networkId);
        console.log(`    Network created: ${networkId.substring(0, 12)}`);

        // Test network listing with label filter
        console.log('  Testing network filter by label...');
        const filteredNetworks = await client.networkList({
          filters: new Filter().add('label', 'test.type=e2e')
        });
        assertNotNull(filteredNetworks);
        const foundNetwork = filteredNetworks.find(n => n.Id === networkId);
        assertNotNull(foundNetwork);
        console.log(`    Found ${filteredNetworks.length} network(s) with label test.type=e2e`);

        // Inspect network
        console.log('  Inspecting network...');
        const inspectResponse = await client.networkInspect(networkId);
        assertNotNull(inspectResponse);
        assertEqual(inspectResponse.Name, 'e2e-test-network');
        assertEqual(inspectResponse.Driver, 'bridge');
        assertEqual(inspectResponse.Labels?.['test.type'], 'e2e');
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
            console.log(`    Warning: Failed to delete network: ${deleteError.message}`);
          }
        }
      }
    });

    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error(`\n❌ Test suite failed: ${error.message}`);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}