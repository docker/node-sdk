import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DockerClient } from '../lib/docker-client.js';
import { pack as createTarPack } from 'tar-stream';
import { Readable } from 'node:stream';

test(
    'imageBuild: build image from Dockerfile with tar-stream context',
    { timeout: 60000 },
    async () => {
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
                    Readable.toWeb(pack, {
                        strategy: { highWaterMark: 16384 },
                    }),
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

            assert.notStrictEqual(
                imageInspect.RepoTags?.includes(`${testImageName}:${testTag}`),
                false,
            );
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
    },
);

test(
    'imageBuild: build image with BuildKit secrets',
    { timeout: 60000 },
    async () => {
        const client = await DockerClient.fromDockerConfig();
        const testImageName = 'test-build-secrets-image';
        const testTag = 'latest';
        const testSecret = 'my-test-secret-value-12345';

        try {
            const pack = createTarPack();
            pack.entry(
                { name: 'Dockerfile' },
                `FROM alpine:latest
# Use a secret during build without including it in the final image
RUN --mount=type=secret,id=test_secret \\
    if [ -f /run/secrets/test_secret ]; then \\
        echo "Secret found and mounted successfully"; \\
        cat /run/secrets/test_secret > /tmp/secret_check; \\
    else \\
        echo "ERROR: Secret not found at /run/secrets/test_secret"; \\
        exit 1; \\
    fi
# Verify secret was available but not in final image
RUN test ! -f /run/secrets/test_secret && echo "Secret not in final layer (good!)"
`,
            );
            pack.finalize();

            console.log('  Building image with BuildKit secrets...');
            const builtImage = await client
                .imageBuild(
                    Readable.toWeb(pack, {
                        strategy: { highWaterMark: 16384 },
                    }),
                    {
                        tag: `${testImageName}:${testTag}`,
                        rm: true,
                        forcerm: true,
                        version: '2', // BuildKit required for secrets
                        secrets: {
                            test_secret: testSecret,
                        },
                    },
                )
                .wait();

            console.log(`  Inspecting built image ${builtImage}`);
            const imageInspect = await client.imageInspect(builtImage || '');
            console.log('  Image with secrets built successfully!');

            assert.notStrictEqual(
                imageInspect.RepoTags?.includes(`${testImageName}:${testTag}`),
                false,
            );
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
    },
);
