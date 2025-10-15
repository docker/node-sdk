import { DockerClient } from '@docker/node-sdk';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';

try {
    const docker = await DockerClient.fromDockerConfig();

    await docker.systemPing();

    const v = await docker.systemVersion();
    console.dir(v, { depth: null });

    const container = await docker.containerCreate({
        Image: 'alpine',
    });

    console.dir(container, { depth: null });

    const out = createWriteStream(tmpdir() + '/test.tar');
    await docker.containerExport(container.Id, Writable.toWeb(out));

    await docker.close();
} catch (error: any) {
    console.error(`Error: ${error?.message ?? error}`);
}
