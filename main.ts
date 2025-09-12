import * as net from 'net';
import * as models from './models';
import { createMultiplexedStreamCallback } from './multiplexed-stream';
import { DockerClient } from './docker-client';


try {
    const socket = new net.Socket().connect('/var/run/docker.sock')
    const docker = new DockerClient(socket);

    let test = await docker.systemVersion();
    console.dir(test, { depth: null });

    /*
    await docker.systemEvents((event: models.EventMessage) => {
        console.log(event);
    });
    */

    socket.destroy();
} catch (error) {
    console.error(error);
}