const { DockerClient } = require('@docker/node-sdk');
const fs = require('fs');
const os = require('os');

async function main() {
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

        const out = fs.createWriteStream(os.tmpdir() + '/test.tar');
        await docker.containerExport(ctr, out);

        docker.close();
    } catch (error) {
        console.error(`Error: ${error.message ?? error}`);
    }
}

main().catch((error) => {
    console.error('Error:', error);
});
