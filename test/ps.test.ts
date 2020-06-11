const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { ServiceError } = require('@grpc/grpc-js');

const { Containers } = require('../src');
const { ListRequest, ListResponse } = require('../src/containers');

describe('SDK', () => {
  let proc;

  const cli = path.resolve('../docker-linux-amd64');
  const address = 'unix:///tmp/test.sock';

  beforeAll(() => {
    proc = spawn(cli, ['serve', '--address', address]);
    spawnSync(cli, ['context', 'create', 'example', 'example']);
    spawnSync(cli, ['context', 'use', 'example']);
  });

  afterAll(() => {
    proc.kill('SIGINT');
  });

  it('can call the backend', (done) => {
    const client = new Containers(address);

    client.list(new ListRequest(), (error, response) => {
      expect(error).toBeNull();
      expect(response.getContainersList().length).toEqual(2);
      done();
    });
  });
});
