import { DockerClient } from './lib/docker-client.js';
import * as fs from 'node:fs';

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

    const fileinfo = await docker.containerArchiveInfo(ctr, '/etc/resolv.conf');
    console.dir(fileinfo, { depth: null });

    const out = fs.createWriteStream('/tmp/test.tar');
    await docker.containerArchive(ctr, '/etc/resolv.conf', out);

    const input = fs.createReadStream('/tmp/test.tar');
    await docker.putContainerArchive(ctr, '/etc', input);

    docker.close();
} catch (error) {
    console.error(error);
}
