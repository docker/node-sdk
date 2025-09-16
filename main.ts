import * as net from 'net';
import * as models from './models';
import { createMultiplexedStreamCallback } from './multiplexed-stream';
import { DockerClient } from './docker-client';
import { Filter } from './filter';


try {

    const docker = await DockerClient.fromDockerConfig();

    await docker.containerList({ all: true })
        .then((containers) => {
            console.dir(containers)
        });

    await docker.systemPing().then((pong) => console.log(pong))

    await docker.systemVersion().then((version) => console.dir(version, { depth: null }))
    

    docker.close();
} catch (error) {
    console.error(error);
}