// oxlint-disable unbound-method
import { test, assert, expectTypeOf } from 'vitest';

import {
    DockerClient,
    type ContainerCreateRequest,
    type ContainerCreateResponse,
    type NetworkCreateRequest,
    type NetworkCreateResponse,
    type SystemInfo,
} from '@docker/node-sdk';

test('ES module should import correctly', () => {
    assert.equal(typeof DockerClient, 'function');
    assert.equal(typeof DockerClient.fromDockerConfig, 'function');
});

test('ES module should import functional client', async () => {
    const docker = await DockerClient.fromDockerConfig();
    const apiVersion = await docker.systemPing();
    assert.ok(apiVersion);
    console.log(`  Docker API version: ${apiVersion}`);
});

test('ES module should export Docker API types', async () => {
    const docker = await DockerClient.fromDockerConfig();

    expectTypeOf(docker).toEqualTypeOf<DockerClient>();

    expectTypeOf(docker.systemInfo).toBeFunction();
    expectTypeOf(docker.systemInfo).returns.toEqualTypeOf<
        Promise<SystemInfo>
    >();

    expectTypeOf(docker.containerCreate).toBeFunction();
    expectTypeOf(docker.containerCreate)
        .parameter(0)
        .toEqualTypeOf<ContainerCreateRequest>();
    expectTypeOf(docker.containerCreate).returns.toEqualTypeOf<
        Promise<ContainerCreateResponse>
    >();

    expectTypeOf(docker.networkCreate).toBeFunction();
    expectTypeOf(docker.networkCreate)
        .parameter(0)
        .toEqualTypeOf<NetworkCreateRequest>();
    expectTypeOf(docker.networkCreate).returns.toEqualTypeOf<
        Promise<NetworkCreateResponse>
    >();
});
