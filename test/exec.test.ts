import { assert, test } from 'vitest';
import { DockerClient } from '../lib/docker-client.js';
import { Logger } from '../lib/logs.js';

// Test Docker Exec API functionality

test('should execute ps command in running container and capture output', async () => {
    const client = await DockerClient.fromDockerConfig();
    let containerId: string | undefined;

    try {
        // Pull alpine image first
        console.log('  Pulling alpine image...');
        await client
            .imageCreate({
                fromImage: 'alpine',
                tag: 'latest',
            })
            .wait();

        // Create container with sleep infinity to keep it running
        console.log('  Creating Alpine container with sleep infinity...');
        const createResponse = await client.containerCreate({
            Image: 'alpine',
            Cmd: ['sleep', 'infinity'],
            Labels: {
                'test.type': 'exec-test',
            },
        });

        containerId = createResponse.Id;
        assert.isNotNull(containerId);
        console.log(`    Container created: ${containerId.substring(0, 12)}`);

        // Start the container
        console.log('  Starting container...');
        await client.containerStart(containerId);
        console.log('    Container started');

        // Create exec instance for 'ps' command
        console.log('  Creating exec instance for ps command...');
        const execResponse = await client.containerExec(containerId, {
            AttachStdout: true,
            AttachStderr: true,
            Cmd: ['ps'],
        });

        const execId = execResponse.Id;
        assert.isNotNull(execId);
        console.log(`    Exec instance created: ${execId.substring(0, 12)}`);

        // Set up streams to capture output
        const stdoutData: string[] = [];
        const stderrData: string[] = [];

        const stdoutLogger = new Logger((line: string) => {
            stdoutData.push(line);
        });

        const stderrLogger = new Logger((line: string) => {
            stderrData.push(line);
        });

        // Start exec instance with stream capture
        console.log('  Starting exec instance...');
        await client.execStart(execId, stdoutLogger, stderrLogger);
        console.log('    Exec completed');

        // Verify the output
        console.log('  Verifying output...');
        console.log(`    Captured stdout data: ${JSON.stringify(stdoutData)}`);
        console.log(`    Captured stderr data: ${JSON.stringify(stderrData)}`);

        // Check that we received process information in stdout
        const allStdout = stdoutData.join('\n');
        assert.include(
            allStdout,
            'sleep',
            'Should find sleep process in ps output',
        );

        // Inspect the exec instance to verify it completed successfully
        console.log('  Inspecting exec instance...');
        const execInfo = await client.execInspect(execId);
        console.log(`    Exec exit code: ${execInfo.ExitCode}`);

        assert.equal(execInfo.ExitCode, 0, 'Exec should complete successfully');
        assert.equal(
            execInfo.Running,
            false,
            'Exec should not be running anymore',
        );

        console.log('    ✓ Test passed: exec lifecycle completed successfully');
    } finally {
        // Clean up: delete container
        if (containerId) {
            console.log('  Cleaning up container...');
            try {
                await client.containerDelete(containerId, { force: true });
                console.log('    Container deleted');
            } catch (error) {
                console.warn(
                    `    Warning: Failed to delete container: ${error}`,
                );
            }
        }

        // Close client connection
        await client.close();
        console.log('  Client connection closed');
    }
});
