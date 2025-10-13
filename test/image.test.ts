import { assert, test } from 'vitest';
import { DockerClient } from '../lib/docker-client.js';
import { Filter } from '../lib/filter.js';
import { Readable } from 'node:stream';
import type { NotFoundError } from '../lib/http.js';

test('image lifecycle: create container, commit image, export/import, inspect, and prune', async () => {
    const client = await DockerClient.fromDockerConfig();
    let containerId: string | undefined;
    const testImageName = 'test';

    try {
        // Step 1: Pull alpine image and create container
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

        console.log('  Creating Alpine container...');
        const createResponse = await client.containerCreate({
            Image: 'docker.io/library/alpine:latest',
            Cmd: ['echo', 'test container'],
            Labels: {
                'test.type': 'image-test',
            },
        });

        console.dir(createResponse, { depth: null });
        containerId = createResponse.Id;
        assert.isNotNull(containerId);
        console.log(`    Container created: ${containerId.substring(0, 12)}`);

        // Step 2: Commit container as new image with label
        console.log('  Committing container as new image...');
        const commitResponse = await client.imageCommit(containerId, {
            repo: testImageName,
            tag: 'latest',
            changes: 'LABEL test=true',
        });

        assert.isNotNull(commitResponse.Id);
        console.log(
            `    Image committed: ${commitResponse.Id.substring(0, 19)}`,
        );

        // Verify the committed image exists
        console.log('  Verifying committed image exists...');
        const images = await client.imageList({
            filters: new Filter().add('label', 'test=true'),
        });
        const testImage = images.find((img) =>
            img.RepoTags?.includes(`${testImageName}:latest`),
        );
        assert.isNotNull(testImage, 'Test image should exist after commit');
        console.log(
            `    Found committed image: ${testImage!.Id!.substring(0, 19)}`,
        );

        // Step 3: Get image as tar file
        console.log('  Exporting image as tar file...');
        const tarData: Uint8Array[] = [];

        await client.imageGet(
            testImageName,
            new WritableStream({
                write(chunk: Uint8Array, _controller) {
                    // console.log(`    Writing chunk: ${chunk.length} bytes`);
                    tarData.push(chunk);
                },
            }),
        );

        // Write tar data to file
        const tarBuffer = Buffer.concat(tarData);
        console.log(
            `    Image exported to tar file: (${tarBuffer.length} bytes)`,
        );

        // Step 4: Delete the test image
        console.log('  Deleting test image...');
        await client.imageDelete(testImageName, { force: true });
        console.log('    Test image deleted');

        // Verify image is deleted
        const imagesAfterDelete = await client.imageList();
        const deletedImage = imagesAfterDelete.find((img) =>
            img.RepoTags?.includes(`${testImageName}:latest`),
        );
        assert.isUndefined(deletedImage, 'Test image should be deleted');
        console.log('    Verified image deletion');

        // Step 5: Load image from tar file
        console.log('  Loading image from tar file...');
        await client.imageLoad(Readable.toWeb(Readable.from(tarBuffer)));
        console.log('    Image loaded from tar file');

        // Step 6: Inspect the loaded image to confirm successful load
        console.log('  Inspecting loaded image...');
        const inspectResponse = await client.imageInspect(testImageName);
        assert.isNotNull(
            inspectResponse,
            'Should be able to inspect loaded image',
        );
        assert.isNotNull(
            inspectResponse.Config?.Labels?.['test'],
            'Image should have test=true label',
        );
        assert.equal(
            inspectResponse.Config?.Labels?.['test'],
            'true',
            'Label should be "true"',
        );
        console.log(
            `    Image inspection successful: ${inspectResponse.Id!.substring(0, 19)}`,
        );
        console.log(
            `    Verified label test=${inspectResponse.Config?.Labels?.['test']}`,
        );

        // Verify the image exists in the list again
        const imagesAfterLoad = await client.imageList();
        const loadedImage = imagesAfterLoad.find((img) =>
            img.RepoTags?.includes(`${testImageName}:latest`),
        );
        assert.isNotNull(loadedImage, 'Test image should exist after load');
        console.log('    Verified loaded image in image list');
    } finally {
        // Clean up: delete container
        if (containerId) {
            console.log('  Cleaning up container...');
            try {
                await client.containerDelete(containerId, { force: true });
                console.log('    Container deleted successfully');
            } catch (err) {
                if ((err as NotFoundError)?.name === 'NotFoundError') {
                    console.log('    Container already deleted or not found');
                } else {
                    console.log(
                        `    Warning: Failed to delete container: ${(err as any)?.message}`,
                    );
                }
            }
        }

        // Clean up: ensure test image is deleted
        try {
            await client.imageDelete(testImageName, { force: true });
        } catch (deleteError) {
            // Ignore error - image might already be deleted
        }
    }
}, 60000); // 60 second timeout for this comprehensive test
