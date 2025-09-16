import { DockerClient } from './docker-client.js';

try {
  const docker = await DockerClient.fromDockerConfig();

  await docker.containerList({ all: true }).then((containers) => {
    console.dir(containers);
  });

  await docker.systemPing().then((pong) => console.log(pong));

  await docker
    .systemVersion()
    .then((version) => console.dir(version, { depth: null }));

  docker.close();
} catch (error) {
  console.error(error);
}
