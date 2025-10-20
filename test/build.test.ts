import { expect, test } from 'vitest';
import { DockerClient } from '../lib/docker-client.js';
import { pack as createTarPack } from 'tar-stream';
import { Readable } from 'node:stream';

test('imageBuild: build image from Dockerfile with tar-stream context', async () => {
    const client = await DockerClient.fromDockerConfig();
    const testImageName = 'test-build-image';
    const testTag = 'latest';

    try {
        const pack = createTarPack();
        pack.entry(
            { name: 'Dockerfile' },
            `FROM scratch
COPY test.txt /test.txt
`,
        );
        pack.entry({ name: 'test.txt' }, 'Hello from Docker build test!');
        pack.finalize();

        const builtImage = await client
            .imageBuild(
                Readable.toWeb(pack, { strategy: { highWaterMark: 16384 } }),
                {
                    tag: `${testImageName}:${testTag}`,
                    rm: true,
                    forcerm: true,
                },
            )
            .wait();

        // Inspect the built builtImage to confirm it was created successfully
        console.log(`  Inspecting built image ${builtImage}`);
        const imageInspect = await client.imageInspect(builtImage || '');
        console.log('  Image found! Build was successful.');

        expect(imageInspect.RepoTags).toContain(`${testImageName}:${testTag}`);
        console.log(`    Image size: ${imageInspect.Size} bytes`);
    } finally {
        // Clean up: delete the test image
        console.log('  Cleaning up test image...');
        try {
            await client.imageDelete(`${testImageName}:${testTag}`, {
                force: true,
            });
            console.log('    Test image deleted successfully');
        } catch (cleanupError) {
            console.log(
                `    Warning: Failed to delete test image: ${(cleanupError as any)?.message}`,
            );
        }
    }
}, 60000); // 60 second timeout
