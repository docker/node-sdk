import * as net from 'net';
import * as models from './models';
import { createMultiplexedStreamCallback } from './multiplexed-stream';
import { DockerClient } from './docker-client';


try {
    const socket = new net.Socket().connect('/var/run/docker.sock')
    const docker = new DockerClient(socket);

    await docker.systemPing().then((pong) => console.log(pong))

    // await docker.systemVersion().then((version) => console.dir(version, { depth: null }))

    /*
    await docker.systemAuth({
        "username": "hannibal",
        "password": "xxxx",
        "serveraddress": "https://index.docker.io/v1/"
    }).then((result) => {
        console.log('systemAuth success:');
        console.dir(result, { depth: null });
    }).catch((error) => {
        console.error(error);
    });
    */

    /*
    docker.systemEvents((event: models.EventMessage) => {
        console.log(event);
    }).catch((error) => {
        console.log(error);
    });
    */

    /*

    await docker.networkPrune();

    let created = await docker.networkCreate({
        Name: 'test',        
        Labels: {
            'com.docker.hello': 'world'
        }
    });
    console.dir(created)

    await docker.networkInspect('test').then((network) => console.log(network))

    let list = await docker.networkList()
    console.dir(list)

    await docker.networkDelete('test')
    */

    socket.destroy();
} catch (error) {
    console.error(error);
}