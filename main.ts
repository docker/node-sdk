import { DockerClient } from './lib/docker-client.js';
import { createWriteStream } from 'node:fs';

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

    const out = createWriteStream('/tmp/test.tar');
    await docker.containerExport(ctr, out);

    docker.close();
} catch (error) {
    console.error(error);
}
