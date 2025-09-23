import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DockerClient } from '@docker/node-sdk';

test('ES module import should work', () => {
    assert.equal(typeof DockerClient, 'function');
    assert.equal(typeof DockerClient.fromDockerConfig, 'function');
});
