import { DockerClient } from './lib/docker-client.js';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';

try {
    const docker = await DockerClient.fromDockerConfig();

    await docker.systemPing();

    const v = await docker.systemVersion();
    console.dir(v, { depth: null });

    const ctr = await docker
        .containerCreate({
            Image: 'alpine',
        })
        .then((value) => {
            console.dir(value, { depth: null });
            return value.Id;
        });

    const out = createWriteStream(tmpdir() + '/test.tar');
    await docker.containerExport(ctr, Writable.toWeb(out));

    docker.close();
} catch (error: any) {
    console.error(`Error: ${error.message ?? error}`);
}
