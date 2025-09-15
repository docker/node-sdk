import * as net from 'net';
import * as models from './models';
import { createMultiplexedStreamCallback } from './multiplexed-stream';
import { DockerClient } from './docker-client';


try {
    const socket = new net.Socket().connect('/var/run/docker.sock')
    const docker = new DockerClient(socket);

    await docker.systemPing().then((pong) => console.log(pong))

    await docker.systemVersion().then((version) => console.dir(version, { depth: null }))

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


    let ctr = await docker.containerCreate({
        Image: 'nginx'
    }).then((result) => { 
        return result.Id;
    })
    console.log(`container ${ctr} created`)

    await docker.containerStart(ctr)
    console.log(`container ${ctr} started`)

    await docker.containerPause(ctr)
    console.log(`container ${ctr} paused`)

    await docker.containerUnpause(ctr)
    console.log(`container ${ctr} unpaused`)

    console.log(`container ${ctr} top:`)
    await docker.containerTop(ctr).then((top) => console.log(top))

    console.log(`container ${ctr} stats:`)
    await docker.containerStats(ctr).then((stats) => console.log(stats))

    await docker.containerRestart(ctr)
    console.log(`container ${ctr} restarted`)


    await docker.containerList().then((list) => console.dir(list, { depth: null }))

    socket.destroy();
} catch (error) {
    console.error(error);
}