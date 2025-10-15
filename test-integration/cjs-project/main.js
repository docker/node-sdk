const { DockerClient } = require('@docker/node-sdk');
const fs = require('fs');
const os = require('os');
const { Writable } = require('node:stream');

async function main() {
    try {
        const docker = await DockerClient.fromDockerConfig();

        await docker.systemPing();

        const v = await docker.systemVersion();
        console.dir(v, { depth: null });

        const container = await docker.containerCreate({
            Image: 'alpine',
        });

        console.dir(container, { depth: null });

        const out = fs.createWriteStream(os.tmpdir() + '/test.tar');
        await docker.containerExport(container.Id, Writable.toWeb(out));

        await docker.close();
    } catch (error) {
        console.error(`Error: ${error.message ?? error}`);
    }
}

main().catch((error) => {
    console.error('Error:', error);
});
