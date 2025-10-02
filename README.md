# Docker Node SDK, a TypeScript SDK for Docker API

![logo](logo.png)

Node-SDK is a TypeScript library to access [Docker engine API](https://docs.docker.com/reference/api/engine/#view-the-api-reference) (a.k.a "Moby").

## Installation

```bash
npm install @docker/node-sdk
```

## Usage

```typescript
import { DockerClient } from '@docker/node-sdk';

const docker = await DockerClient.fromDockerConfig();

const containers = await docker.containerList({ all: true });
console.dir(containers);
```

## License

Licensed under [Apache License version 2.0](https://www.apache.org/licenses/LICENSE-2.0)
Copyright 2025, Docker Inc

_tl;dr:_ You're free to use this code, make any changes you need, have fun with it. Contributions are welcome if you miss something.

## Supported APIs:

### Container

- [x] ContainerList
- [x] ContainerCreate
- [x] ContainerInspect
- [x] ContainerTop
- [x] ContainerLogs
- [x] ContainerChanges
- [x] ContainerExport
- [x] ContainerStats
- [x] ContainerResize
- [x] ContainerStart
- [x] ContainerStop
- [x] ContainerRestart
- [x] ContainerKill
- [x] ContainerUpdate
- [x] ContainerRename
- [x] ContainerPause
- [x] ContainerUnpause
- [x] ContainerAttach
- [x] ContainerWait
- [x] ContainerDelete
- [x] ContainerArchiveInfo
- [x] ContainerArchive
- [x] PutContainerArchive
- [x] ContainerPrune

### Image

- [x] ImageList
- [x] ImageBuild
- [x] BuildPrune
- [x] ImageCreate
- [x] ImageInspect
- [x] ImageHistory
- [x] ImagePush
- [x] ImageTag
- [x] ImageDelete
- [ ] ImageSearch
- [x] ImagePrune
- [x] ImageCommit
- [x] ImageGet
- [x] ImageGetAll
- [x] ImageLoad

### Network

- [x] NetworkList
- [x] NetworkInspect
- [x] NetworkDelete
- [x] NetworkCreate
- [x] NetworkConnect
- [x] NetworkDisconnect
- [x] NetworkPrune

### Volume

- [x] VolumeList
- [x] VolumeCreate
- [x] VolumeInspect
- [x] VolumeUpdate
- [x] VolumeDelete
- [x] VolumePrune

### Exec

- [x] ContainerExec
- [x] ExecStart
- [x] ExecResize
- [x] ExecInspect

### Plugin

- [ ] PluginList
- [ ] GetPluginPrivileges
- [ ] PluginPull
- [ ] PluginInspect
- [ ] PluginDelete
- [ ] PluginEnable
- [ ] PluginDisable
- [ ] PluginUpgrade
- [ ] PluginCreate
- [ ] PluginPush
- [ ] PluginSet

### System

- [x] SystemAuth
- [x] SystemInfo
- [x] SystemVersion
- [x] SystemPing
- [x] SystemEvents
- [x] SystemDataUsage

### Distribution

- [ ] DistributionInspect

### Session

- [ ] Session

### Swarm

- [ ] SwarmInspect
- [ ] SwarmInit
- [ ] SwarmJoin
- [ ] SwarmLeave
- [ ] SwarmUpdate
- [ ] SwarmUnlockkey
- [ ] SwarmUnlock
- [ ] NodeList
- [ ] NodeInspect
- [ ] NodeDelete
- [ ] NodeUpdate
- [ ] ServiceList
- [ ] ServiceCreate
- [ ] ServiceInspect
- [ ] ServiceDelete
- [ ] ServiceUpdate
- [ ] ServiceLogs
- [ ] TaskList
- [ ] TaskInspect
- [ ] TaskLogs
- [ ] SecretList
- [ ] SecretCreate
- [ ] SecretInspect
- [ ] SecretDelete
- [ ] SecretUpdate
- [ ] ConfigList
- [ ] ConfigCreate
- [ ] ConfigInspect
- [ ] ConfigDelete
- [ ] ConfigUpdate
