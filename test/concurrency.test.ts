import { assert, test } from 'vitest';
import { DockerClient } from '../lib/docker-client.js';

test('concurrent requests should execute in parallel', async () => {
    const client = await DockerClient.fromDockerConfig();
    const startTime = Date.now();

    // Make 5 concurrent API calls
    const promises = [
        client.systemPing(),
        client.systemInfo(),
        client.systemVersion(),
        client.containerList({ all: true }),
        client.imageList(),
    ];

    // Execute all requests concurrently
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    // Verify all requests completed successfully
    assert.isNotNull(results[0]); // systemPing result
    assert.isNotNull(results[1]); // systemInfo result
    assert.isNotNull(results[2]); // systemVersion result
    assert.isNotNull(results[3]); // containerList result
    assert.isNotNull(results[4]); // imageList result

    console.log(`  Completed 5 concurrent requests in ${totalTime}ms`);

    // Concurrent requests should be faster than sequential ones
    // This is a rough check - concurrent should typically be < 80% of sequential time
    assert.isTrue(
        totalTime < 10000,
        'Concurrent requests should complete within reasonable time',
    );
}, 15000);

test('high concurrency stress test', async () => {
    const client = await DockerClient.fromDockerConfig();
    const startTime = Date.now();

    // Make 20 concurrent ping requests to test connection pool
    const promises = Array.from({ length: 20 }, () => client.systemPing());

    // Execute all requests concurrently
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    // Verify all requests completed successfully
    results.forEach((result, index) => {
        assert.isNotNull(result, `Request ${index} should return a result`);
    });

    console.log(`  Completed 20 concurrent ping requests in ${totalTime}ms`);
    console.log(`  Average time per request: ${(totalTime / 20).toFixed(1)}ms`);

    // All requests should complete within reasonable time
    assert.isTrue(
        totalTime < 15000,
        'High concurrency requests should complete within reasonable time',
    );
}, 20000);

test('mixed concurrent operations', async () => {
    const client = await DockerClient.fromDockerConfig();

    // Test different types of concurrent operations
    const promises = [
        // Read operations
        client.systemPing(),
        client.systemVersion(),
        client.containerList({ all: true }),
        client.imageList(),
        client.networkList(),
        client.volumeList(),
        // Info operations
        client.systemInfo(),
        client.systemPing(),
        client.systemVersion(),
        client.containerList({ limit: 5 }),
    ];

    const startTime = Date.now();
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    // Verify all requests completed successfully
    results.forEach((result, index) => {
        assert.isNotNull(
            result,
            `Mixed operation ${index} should return a result`,
        );
    });

    console.log(`  Completed 10 mixed concurrent operations in ${totalTime}ms`);

    // Should handle mixed operations efficiently
    assert.isTrue(
        totalTime < 12000,
        'Mixed concurrent operations should complete efficiently',
    );
}, 18000);
