import * as net from 'net';
import { DockerClient, Credentials, IdentityToken } from './docker-client.js';

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

// Test basic Docker API connectivity
test('systemPing should return API version', async () => {
  const client = await DockerClient.fromDockerConfig();
  const apiVersion = await client.systemPing();
  assertNotNull(apiVersion);
  console.log(`  Docker API version: ${apiVersion}`);
});

test('systemInfo should return system information', async () => {
  const client = await DockerClient.fromDockerConfig();
  const info = await client.systemInfo();
  assertNotNull(info);
  assertNotNull(info.ID);
  console.log(`  Docker system ID: ${info.ID}`);
});

test('systemVersion should return version information', async () => {
  const client = await DockerClient.fromDockerConfig();
  const version = await client.systemVersion();
  assertNotNull(version);
  assertNotNull(version.Version);
  console.log(`  Docker version: ${version.Version}`);
});

// Test container operations
test('containerList should return list of containers', async () => {
  const client = await DockerClient.fromDockerConfig();
  const containers = await client.containerList({ all: true });
  assertNotNull(containers);
  console.log(`  Found ${containers.length} containers`);
});

// Test image operations  
test('imageList should return list of images', async () => {
  const client = await DockerClient.fromDockerConfig();
  const images = await client.imageList();
  assertNotNull(images);
  console.log(`  Found ${images.length} images`);
});

// Test network operations
test('networkList should return list of networks', async () => {
  const client = await DockerClient.fromDockerConfig();
  const networks = await client.networkList();
  assertNotNull(networks);
  console.log(`  Found ${networks.length} networks`);
});

// Test volume operations
test('volumeList should return list of volumes', async () => {
  const client = await DockerClient.fromDockerConfig();
  const volumes = await client.volumeList();
  assertNotNull(volumes);
  console.log(`  Found ${volumes.volumes?.length || 0} volumes`);
});

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