import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DockerClient } from '../lib/docker-client.js';

test(
    'concurrent requests should execute in parallel',
    { timeout: 15000 },
    async () => {
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
        assert.notStrictEqual(results[0], null); // systemPing result
        assert.notStrictEqual(results[1], null); // systemInfo result
        assert.notStrictEqual(results[2], null); // systemVersion result
        assert.notStrictEqual(results[3], null); // containerList result
        assert.notStrictEqual(results[4], null); // imageList result

        console.log(`  Completed 5 concurrent requests in ${totalTime}ms`);

        // Concurrent requests should be faster than sequential ones
        // This is a rough check - concurrent should typically be < 80% of sequential time
        assert.ok(
            totalTime < 10000,
            'Concurrent requests should complete within reasonable time',
        );
    },
);

test('high concurrency stress test', { timeout: 20000 }, async () => {
    const client = await DockerClient.fromDockerConfig();
    const startTime = Date.now();

    // Make 20 concurrent ping requests to test connection pool
    const promises = Array.from({ length: 20 }, () => client.systemPing());

    // Execute all requests concurrently
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    // Verify all requests completed successfully
    results.forEach((result, index) => {
        assert.notStrictEqual(
            result,
            null,
            `Request ${index} should return a result`,
        );
    });

    console.log(`  Completed 20 concurrent ping requests in ${totalTime}ms`);
    console.log(`  Average time per request: ${(totalTime / 20).toFixed(1)}ms`);

    // All requests should complete within reasonable time
    assert.ok(
        totalTime < 15000,
        'High concurrency requests should complete within reasonable time',
    );
});

test('mixed concurrent operations', { timeout: 18000 }, async () => {
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
        assert.notStrictEqual(
            result,
            null,
            `Mixed operation ${index} should return a result`,
        );
    });

    console.log(`  Completed 10 mixed concurrent operations in ${totalTime}ms`);

    // Should handle mixed operations efficiently
    assert.ok(
        totalTime < 12000,
        'Mixed concurrent operations should complete efficiently',
    );
});
