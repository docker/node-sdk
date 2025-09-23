import { assert, test } from 'vitest';
import { DockerClient } from '../lib/docker-client.js';
import { Writable } from 'stream';

// Test Docker Container API functionality

test('should receive container stdout on attach', async () => {
    const client = await DockerClient.fromDockerConfig();
    let containerId: string | undefined;

    try {
        // Pull alpine image first
        console.log('  Pulling alpine image...');
        await client.imageCreate(
            (event) => {
                if (event.status) console.log(`    ${event.status}`);
            },
            {
                fromImage: 'docker.io/library/alpine',
                tag: 'latest',
            },
        );

        // Create container with echo command
        console.log('  Creating Alpine container with echo command...');
        const createResponse = await client.containerCreate({
            Image: 'docker.io/library/alpine:latest',
            Cmd: ['echo', 'hello'],
            Labels: {
                'test.type': 'container-test',
            },
        });

        containerId = createResponse.Id;
        assert.isNotNull(containerId);
        console.log(`    Container created: ${containerId.substring(0, 12)}`);

        // Set up streams to capture output
        const stdoutData: string[] = [];
        const stderrData: string[] = [];

        const stdout = new Writable({
            write(
                chunk: any,
                encoding: BufferEncoding,
                callback: (error?: Error | null) => void,
            ) {
                const data = chunk.toString();
                stdoutData.push(data);
                console.log(`    STDOUT: ${JSON.stringify(data)}`);
                callback();
            },
        });

        const stderr = new Writable({
            write(
                chunk: any,
                encoding: BufferEncoding,
                callback: (error?: Error | null) => void,
            ) {
                const data = chunk.toString();
                stderrData.push(data);
                console.log(`    STDERR: ${JSON.stringify(data)}`);
                callback();
            },
        });

        // Attach to container before starting
        console.log('  Attaching to container...');
        const attachPromise = client.containerAttach(
            containerId,
            stdout,
            stderr,
            {
                stream: true,
                stdout: true,
                stderr: true,
            },
        );

        // Start the container
        console.log('  Starting container...');
        await client.containerStart(containerId);
        console.log('    Container started');

        // Wait for the attach operation to complete
        await attachPromise;
        console.log('    Attach completed');

        // Wait for container to finish
        console.log('  Waiting for container to finish...');
        const waitResult = await client.containerWait(containerId);
        console.log(
            `    Container finished with exit code: ${waitResult.StatusCode}`,
        );

        // Verify the output
        console.log('  Verifying output...');
        console.log(`    Captured stdout data: ${JSON.stringify(stdoutData)}`);
        console.log(`    Captured stderr data: ${JSON.stringify(stderrData)}`);

        // Check that we received "hello" in stdout
        const allStdout = stdoutData.join('');
        assert.include(allStdout, 'hello', 'Should receive "hello" in stdout');

        // Verify container exited successfully
        assert.equal(
            waitResult.StatusCode,
            0,
            'Container should exit with code 0',
        );

        console.log('    ✓ Test passed: received expected output');
    } finally {
        // Clean up: delete container
        if (containerId) {
            console.log('  Cleaning up container...');
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
}, 30000); // 30 second timeout

test('should collect container output using containerLogs', async () => {
    const client = await DockerClient.fromDockerConfig();
    let containerId: string | undefined;

    try {
        // Pull alpine image first (should be cached from previous test)
        console.log('  Pulling alpine image...');
        await client.imageCreate(
            (event) => {
                if (event.status) console.log(`    ${event.status}`);
            },
            {
                fromImage: 'docker.io/library/alpine',
                tag: 'latest',
            },
        );

        // Create container with a command that produces multiple lines of output
        console.log('  Creating Alpine container with multi-line output...');
        const createResponse = await client.containerCreate({
            Image: 'docker.io/library/alpine:latest',
            Cmd: ['sh', '-c', 'echo "line1"; echo "line2"; echo "line3"'],
            Labels: {
                'test.type': 'container-logs-test',
            },
        });

        containerId = createResponse.Id;
        assert.isNotNull(containerId);
        console.log(`    Container created: ${containerId.substring(0, 12)}`);

        // Start the container and let it finish
        console.log('  Starting container...');
        await client.containerStart(containerId);
        console.log('    Container started');

        // Wait for container to finish
        console.log('  Waiting for container to finish...');
        const waitResult = await client.containerWait(containerId);
        console.log(
            `    Container finished with exit code: ${waitResult.StatusCode}`,
        );

        // Set up streams to capture logs
        const stdoutLogsData: string[] = [];
        const stderrLogsData: string[] = [];

        const stdoutLogsStream = new Writable({
            write(
                chunk: any,
                encoding: BufferEncoding,
                callback: (error?: Error | null) => void,
            ) {
                const data = chunk.toString();
                stdoutLogsData.push(data);
                console.log(`    STDOUT LOGS: ${JSON.stringify(data)}`);
                callback();
            },
        });

        const stderrLogsStream = new Writable({
            write(
                chunk: any,
                encoding: BufferEncoding,
                callback: (error?: Error | null) => void,
            ) {
                const data = chunk.toString();
                stderrLogsData.push(data);
                console.log(`    STDERR LOGS: ${JSON.stringify(data)}`);
                callback();
            },
        });

        // Get container logs
        console.log('  Fetching container logs...');
        await client.containerLogs(
            containerId,
            stdoutLogsStream,
            stderrLogsStream,
            {
                stdout: true,
                stderr: true,
            },
        );
        console.log('    Logs retrieved');

        // Give a moment for the streams to finish processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify the output
        console.log('  Verifying logs...');
        console.log(
            `    Captured stdout logs: ${JSON.stringify(stdoutLogsData)}`,
        );
        console.log(
            `    Captured stderr logs: ${JSON.stringify(stderrLogsData)}`,
        );

        // Check that we received all expected lines in stdout
        const allStdoutLogs = stdoutLogsData.join('');
        assert.include(
            allStdoutLogs,
            'line1',
            'Should receive "line1" in stdout logs',
        );
        assert.include(
            allStdoutLogs,
            'line2',
            'Should receive "line2" in stdout logs',
        );
        assert.include(
            allStdoutLogs,
            'line3',
            'Should receive "line3" in stdout logs',
        );

        // Verify container exited successfully
        assert.equal(
            waitResult.StatusCode,
            0,
            'Container should exit with code 0',
        );

        console.log('    ✓ Test passed: received all expected log lines');
    } finally {
        // Clean up: delete container
        if (containerId) {
            console.log('  Cleaning up container...');
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
}, 30000); // 30 second timeout
