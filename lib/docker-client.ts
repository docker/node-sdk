import { createConnection } from 'node:net';
import { promises as fsPromises } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { Agent } from 'node:http';
import { connect as tlsConnect } from 'node:tls';
import * as types from './types/index.js';
import { HTTPClient } from './http.js';
import { SocketAgent } from './socket.js';
import { Filter } from './filter.js';
import { SSH } from './ssh.js';
import { TLS } from './tls.js';
import * as stream from 'node:stream';
import { demultiplexStream } from './multiplexed-stream.js';
import {
    getErrorMessage,
    isFileNotFoundError,
    parseDockerHost,
} from './util.js';
import type { AuthConfig, ContainerPruneResponse, Platform } from './types/index.js';
import type { SecureContextOptions } from 'node:tls';
import { WritableStream } from 'node:stream/web';
import { ReadableStream } from 'stream/web';

// noinspection JSUnusedGlobalSymbols
export class DockerClient {
    private api: HTTPClient;

    constructor(agent: Agent, userAgent: string = 'docker/node-sdk') {
        this.api = new HTTPClient(agent, userAgent);
    }

    /**
     * Create a DockerClient instance from a Docker host string
     * @param dockerHost Docker host string (e.g., "unix:/var/run/docker.sock", "tcp://localhost:2376", or "ssh://user@host[:port][/path/to/docker.sock]")
     * @param certificates Optional path to directory containing TLS certificates (ca.pem, cert.pem, key.pem) for TCP connections
     * @returns Promise that resolves to a connected DockerClient instance
     */
    static async fromDockerHost(
        dockerHost: string,
        certificates?: string | SecureContextOptions,
        userAgent?: string,
    ): Promise<DockerClient> {
        if (dockerHost.startsWith('unix:')) {
            // Unix socket connection - use SocketAgent with socket creation function
            const socketPath = dockerHost.substring(5); // Remove "unix:" prefix

            try {
                const agent = new SocketAgent(() =>
                    createConnection(socketPath),
                );
                return new DockerClient(agent, userAgent);
            } catch (error) {
                throw new Error(
                    `Failed to create Docker client for ${dockerHost}: ${getErrorMessage(error)}`,
                );
            }
        } else if (dockerHost.startsWith('tcp:')) {
            // TCP connection - use SocketAgent with TCP socket creation function
            const defaultPort = certificates ? 2376 : 2375; // Default ports: 2376 for TLS, 2375 for plain
            const { host, port } = parseDockerHost(dockerHost, defaultPort);

            try {
                let agent: SocketAgent;

                if (certificates) {
                    if (typeof certificates === 'string') {
                        // Use SocketAgent with TLS socket creation function
                        const tlsOptions =
                            await TLS.loadCertificates(certificates);
                        agent = new SocketAgent(() =>
                            tlsConnect({ host, port, ...tlsOptions }),
                        );
                    } else {
                        // certificates is a SecureContextOptions type
                        agent = new SocketAgent(() =>
                            tlsConnect({ host, port, ...certificates }),
                        );
                    }
                } else {
                    // Use SocketAgent with plain TCP socket creation function
                    agent = new SocketAgent(() =>
                        createConnection({ host, port }),
                    );
                }

                return new DockerClient(agent, userAgent);
            } catch (error) {
                throw new Error(
                    `Failed to create Docker client for ${dockerHost}: ${getErrorMessage(error)}`,
                );
            }
        } else if (dockerHost.startsWith('ssh:')) {
            // SSH connection - use SocketAgent with SSH socket creation function
            try {
                const socketFactory = await SSH.createSocketFactory(dockerHost);
                const agent = new SocketAgent(socketFactory);
                return new DockerClient(agent, userAgent);
            } catch (error) {
                throw new Error(
                    `Failed to create SSH Docker client for ${dockerHost}: ${getErrorMessage(error)}`,
                );
            }
        } else {
            throw new Error(
                `Unsupported Docker host format: ${dockerHost}. Must start with "unix:", "tcp:", or "ssh:"`,
            );
        }
    }

    /**
     * Create a DockerClient instance from a Docker context name
     * @param contextName Docker context name to search for, or uses DOCKER_CONTEXT env var if not provided
     * @returns Promise that resolves to a connected DockerClient instance
     */
    static async fromDockerContext(
        contextName?: string,
        userAgent?: string,
    ): Promise<DockerClient> {
        // Use DOCKER_CONTEXT environment variable if contextName not provided
        const targetContext = contextName || process.env.DOCKER_CONTEXT;

        if (!targetContext) {
            throw new Error(
                'No context name provided and DOCKER_CONTEXT environment variable is not set',
            );
        }

        const configDir = process.env.DOCKER_CONFIG || homedir();
        const contextsDir = join(configDir, '.docker', 'contexts', 'meta');
        const tlsDir = join(configDir, '.docker', 'contexts', 'tls');

        try {
            // Read all directories in the contexts meta directory
            const contextEntries = await fsPromises.readdir(contextsDir, {
                withFileTypes: true,
            });
            const contextDirs = contextEntries
                .filter((dirent) => dirent.isDirectory())
                .map((dirent) => dirent.name);

            for (const contextDir of contextDirs) {
                const metaJsonPath = join(contextsDir, contextDir, 'meta.json');

                try {
                    const metaContent = await fsPromises.readFile(
                        metaJsonPath,
                        'utf8',
                    );
                    const meta = JSON.parse(metaContent);

                    if (meta.Name === targetContext) {
                        // Found matching context, extract endpoint
                        if (
                            meta.Endpoints &&
                            meta.Endpoints.docker &&
                            meta.Endpoints.docker.Host
                        ) {
                            const dockerHost = meta.Endpoints.docker.Host;
                            let certificates: string | undefined = undefined;
                            const tls = join(tlsDir, contextDir);
                            try {
                                await fsPromises.access(tls);
                                certificates = tls;
                            } catch {
                                // TLS directory doesn't exist, certificates remain undefined
                            }
                            return DockerClient.fromDockerHost(
                                dockerHost,
                                certificates,
                                userAgent,
                            );
                        } else {
                            throw new Error(
                                `Docker context '${targetContext}' found but has no valid Docker endpoint`,
                            );
                        }
                    }
                } catch (parseError) {
                    // Skip invalid meta.json files or files that don't exist
                }
            }

            throw new Error(`Docker context '${targetContext}' not found`);
        } catch (error) {
            if (isFileNotFoundError(error)) {
                throw new Error(
                    `Docker contexts directory not found: ${contextsDir}`,
                );
            }
            throw error;
        }
    }

    /**
     * Create a DockerClient instance using the current context from Docker config
     * Reads config.json from DOCKER_CONFIG env var or ~/.docker/config.json to get the currentContext and connects to it
     * @returns Promise that resolves to a connected DockerClient instance
     */
    static async fromDockerConfig(): Promise<DockerClient> {
        // Check for DOCKER_HOST environment variable first - takes precedence over config
        if (process.env.DOCKER_HOST) {
            return DockerClient.fromDockerHost(
                process.env.DOCKER_HOST,
                process.env.DOCKER_TLS_CERTDIR,
            );
        }

        // Check for DOCKER_CONFIG environment variable, otherwise use default path
        const configPath =
            process.env.DOCKER_CONFIG ||
            join(homedir(), '.docker', 'config.json');

        try {
            const configContent = await fsPromises.readFile(configPath, 'utf8');
            const config = JSON.parse(configContent);

            if (config.currentContext) {
                // Use the specified current context
                return DockerClient.fromDockerContext(config.currentContext);
            } else {
                // No current context specified, use default
                return DockerClient.fromDockerHost('unix:/var/run/docker.sock');
            }
        } catch (error) {
            if (isFileNotFoundError(error)) {
                // Config file doesn't exist, use default
                return DockerClient.fromDockerHost('unix:/var/run/docker.sock');
            } else if (error instanceof SyntaxError) {
                throw new Error(
                    `Invalid JSON in Docker config file: ${configPath}`,
                );
            }
            throw error;
        }
    }

    public close() {
        this.api.close();
    }

    // --- Authentication

    public authCredentials(credentials: any): string {
        const jsonString = JSON.stringify(credentials);
        const base64 = Buffer.from(jsonString, 'utf8').toString('base64');
        // Convert standard Base64 to URL and filename safe alphabet (RFC 4648)
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    // --- System API

    /**
     * Validate credentials for a registry and, if available, get an identity token for accessing the registry without password.
     * Check auth configuration
     * @param authConfig Authentication to check
     */
    public async systemAuth(
        authConfig: types.AuthConfig,
    ): Promise<types.SystemAuthResponse> {
        return this.api.post<types.SystemAuthResponse>('/auth', authConfig, undefined, {
            'accept': 'application/json'
        }).then((response) => { return response.json() as Promise<types.SystemAuthResponse> });
    }

    /**
     * Get data usage information
     * @param type Object types, for which to compute and return data.
     */
    public async systemDataUsage(
        type?: Array<'container' | 'image' | 'volume' | 'build-cache'>,
    ): Promise<types.SystemDataUsageResponse> {
        return this.api.getJSON<types.SystemDataUsageResponse>('/system/df', {
            type: type,
        });
    }

    /**
     * Stream real-time events from the server.  Various objects within Docker report events when something happens to them.  Containers report these events: `attach`, `commit`, `copy`, `create`, `destroy`, `detach`, `die`, `exec_create`, `exec_detach`, `exec_start`, `exec_die`, `export`, `health_status`, `kill`, `oom`, `pause`, `rename`, `resize`, `restart`, `start`, `stop`, `top`, `unpause`, `update`, and `prune`  Images report these events: `create`, `delete`, `import`, `load`, `pull`, `push`, `save`, `tag`, `untag`, and `prune`  Volumes report these events: `create`, `mount`, `unmount`, `destroy`, and `prune`  Networks report these events: `create`, `connect`, `disconnect`, `destroy`, `update`, `remove`, and `prune`  The Docker daemon reports these events: `reload`  Services report these events: `create`, `update`, and `remove`  Nodes report these events: `create`, `update`, and `remove`  Secrets report these events: `create`, `update`, and `remove`  Configs report these events: `create`, `update`, and `remove`  The Builder reports `prune` events
     * Monitor events
     * @param callback
     * @param options
     * @param options.since Show events created since this timestamp then stream new events.
     * @param options.until Show events created until this timestamp then stop streaming.
     * @param options.filters Filters to process on the event list. Available filters:  - 'config' config name or ID - 'container' container name or ID - 'daemon' daemon name or ID - 'event' event type - 'image' image name or ID - 'label' image or container label - 'network' network name or ID - 'node' node ID - 'plugin' plugin name or ID - 'scope' local or swarm - 'secret' secret name or ID - 'service' service name or ID - 'type' object to filter by, one of 'container', 'image', 'volume', 'network', 'daemon', 'plugin', 'node', 'service', 'secret' or 'config' - 'volume' volume name
     */
    public async systemEvents(
        callback: (event: types.EventMessage) => void,
        options?: {
            since?: string;
            until?: string;
            filters?: Filter;
        },
    ) {
        await this.api.sendHTTPRequest('GET', '/events', {
            params: options,
            callback: (data: Buffer, encoding?: BufferEncoding) => {
                data.toString(encoding)
                    .split('\n')
                    .filter((line) => line.trim() !== '')
                    .forEach((line) => {
                        callback(JSON.parse(line) as types.EventMessage);
                    });
            },
        });
    }

    /**
     * This is a dummy endpoint you can use to test if the server is accessible.
     * Ping
     */
    public systemPing(): Promise<string> {
        return this.api.head('/_ping', { accept: 'text/plain' })
            .then((response) => response.headers.get('api-version') as string);
    }

    /**
     * Get system information
     */
    public async systemInfo(): Promise<types.SystemInfo> {
        return this.api.getJSON<types.SystemInfo>('/info');
    }

    /**
     * Returns the version of Docker that is running and various information about the system that Docker is running on.
     * Get version
     */
    public async systemVersion(): Promise<types.SystemVersion> {
        return this.api.getJSON<types.SystemVersion>('/version');
    }

    // --- Containers API

    /**
     * Get a tar archive of a resource in the filesystem of container id.
     * Get an archive of a filesystem resource in a container
     * @param id ID or name of the container
     * @param path Resource in the container’s filesystem to archive.
     * @param out stream to write container's filesystem content as a TAR archive
     */
    public async containerArchive(
        id: string,
        path: string,
        out: WritableStream,
    ): Promise<void> {
        return this.api.get(
            `/containers/${id}/archive`,
            'application/x-tar',
            {
                path: path,
            },
        ).then(response => {
            response.body?.pipeTo(out)
        });
    }

    /**
     * A response header `X-Docker-Container-Path-Stat` is returned, containing a base64 - encoded JSON object with some filesystem header information about the path.
     * Get information about files in a container
     * @param id ID or name of the container
     * @param path Resource in the container’s filesystem to archive.
     */
    public async containerArchiveInfo(
        id: string,
        path: string,
    ): Promise<types.FileInfo> {
        return this.api
            .head(`/containers/${id}/archive`, {
                params: {
                    path: path,
                },
            })
            .then((response) => {
                const header = response.headers.get('x-docker-container-path-stat')
                if (!header) {
                    throw new Error('X-Docker-Container-Path-Stat header not found');
                }
                const json = Buffer.from(header, 'base64').toString('utf-8');
                return types.FileInfo.fromJSON(json);
            });
    }

    /**
     * Attach to a container to read its output or send it input. You can attach to the same container multiple times and you can reattach to containers that have been detached.  Either the `stream` or `logs` parameter must be `true` for this endpoint to do anything.  See the [documentation for the `docker attach` command](https://docs.docker.com/engine/reference/commandline/attach/) for more details.  ### Hijacking  This endpoint hijacks the HTTP connection to transport `stdin`, `stdout`, and `stderr` on the same socket.  This is the response from the daemon for an attach request:  ``` HTTP/1.1 200 OK Content-Type: application/vnd.docker.raw-stream  [STREAM] ```  After the headers and two new lines, the TCP connection can now be used for raw, bidirectional communication between the client and server.  To hint potential proxies about connection hijacking, the Docker client can also optionally send connection upgrade headers.  For example, the client sends this request to upgrade the connection:  ``` POST /containers/16253994b7c4/attach?stream=1&stdout=1 HTTP/1.1 Upgrade: tcp Connection: Upgrade ```  The Docker daemon will respond with a `101 UPGRADED` response, and will similarly follow with the raw stream:  ``` HTTP/1.1 101 UPGRADED Content-Type: application/vnd.docker.raw-stream Connection: Upgrade Upgrade: tcp  [STREAM] ```  ### Stream format  When the TTY setting is disabled in [`POST /containers/create`](#operation/ContainerCreate), the HTTP Content-Type header is set to application/vnd.docker.multiplexed-stream and the stream over the hijacked connected is multiplexed to separate out `stdout` and `stderr`. The stream consists of a series of frames, each containing a header and a payload.  The header contains the information which the stream writes (`stdout` or `stderr`). It also contains the size of the associated frame encoded in the last four bytes (`uint32`).  It is encoded on the first eight bytes like this:  ```go header := [8]byte{STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4} ```  `STREAM_TYPE` can be:  - 0: `stdin` (is written on `stdout`) - 1: `stdout` - 2: `stderr`  `SIZE1, SIZE2, SIZE3, SIZE4` are the four bytes of the `uint32` size encoded as big endian.  Following the header is the payload, which is the specified number of bytes of `STREAM_TYPE`.  The simplest way to implement this protocol is the following:  1. Read 8 bytes. 2. Choose `stdout` or `stderr` depending on the first byte. 3. Extract the frame size from the last four bytes. 4. Read the extracted size and output it on the correct output. 5. Goto 1.  ### Stream format when using a TTY  When the TTY setting is enabled in [`POST /containers/create`](#operation/ContainerCreate), the stream is not multiplexed. The data exchanged over the hijacked connection is simply the raw data from the process PTY and client\'s `stdin`.
     * Attach to a container
     * @param id ID or name of the container
     * @param stdout
     * @param stderr
     * @param options
     * @param options.detachKeys Override the key sequence for detaching a container.Format is a single character '[a-Z]' or 'ctrl-&lt;value&gt;' where '&lt;value&gt;' is one of: 'a-z', '@', '^', '[', ',' or '_'.
     * @param options.logs Replay previous logs from the container.  This is useful for attaching to a container that has started and you want to output everything since the container started.  If 'stream' is also enabled, once all the previous output has been returned, it will seamlessly transition into streaming current output.
     * @param options.stream Stream attached streams from the time the request was made onwards.
     * @param options.stdin Attach to 'stdin'
     * @param options.stdout Attach to 'stdout'
     * @param options.stderr Attach to 'stderr'
     */
    public async containerAttach(
        id: string,
        stdout: stream.Writable,
        stderr: stream.Writable,
        options?: {
            detachKeys?: string;
            logs?: boolean;
            stream?: boolean;
            stdin?: boolean;
            stdout?: boolean;
            stderr?: boolean;
        },
    ): Promise<void> {
        // FIXME
        /*return this.api
            .sendHTTPRequest('POST', `/containers/${id}/attach`, {
                params: options,
                headers: {
                    Connection: 'Upgrade',
                    Upgrade: 'tcp',
                },
            })
            .then((response) => {
                const contentType = response.headers['content-type'];
                if (contentType === 'application/vnd.docker.raw-stream') {
                    response.sock?.pipe(stdout);
                } else {
                    response.sock?.pipe(demultiplexStream(stdout, stderr));
                }
            });*/
    }

    /**
     * Returns which files in a container\'s filesystem have been added, deleted, or modified. The `Kind` of modification can be one of:  - `0`: Modified (\"C\") - `1`: Added (\"A\") - `2`: Deleted (\"D\")
     * Get changes on a container’s filesystem
     * @param id ID or name of the container
     */
    public async containerChanges(
        id: string,
    ): Promise<Array<types.FilesystemChange>> {
        return this.api.getJSON<Array<types.FilesystemChange>>(
            `/containers/${id}/changes`,
        );
    }

    /**
     * Create a container
     * @param spec Container to create
     * @param options
     * @param options.name Assign the specified name to the container. Must match '/?[a-zA-Z0-9][a-zA-Z0-9_.-]+'.
     * @param options.platform Platform in the format 'os[/arch[/variant]]' used for image lookup.  When specified, the daemon checks if the requested image is present in the local image cache with the given OS and Architecture, and otherwise returns a '404' status.  If the option is not set, the host\&#39;s native OS and Architecture are used to look up the image in the image cache. However, if no platform is passed and the given image does exist in the local image cache, but its OS or architecture does not match, the container is created with the available image, and a warning is added to the 'Warnings' field in the response, for example;      WARNING: The requested image\&#39;s platform (linux/arm64/v8) does not              match the detected host platform (linux/amd64) and no              specific platform was requested
     */
    public async containerCreate(
        spec: types.ContainerCreateRequest,
        options?: {
            name?: string;
            platform?: string;
        },
    ): Promise<types.ContainerCreateResponse> {
        return this.api.post<types.ContainerCreateResponse>(
            '/containers/create',
            options,
            spec,
        ).then(response => { return response.json() as Promise<types.ContainerCreateResponse> });
    }

    /**
     * Remove a container
     * @param id ID or name of the container
     * @param options
     * @param options.volumes Remove anonymous volumes associated with the container.
     * @param options.force If the container is running, kill it before removing it.
     * @param options.link Remove the specified link associated with the container.
     */
    public async containerDelete(
        id: string,
        options?: {
            volumes?: boolean;
            force?: boolean;
            link?: boolean;
        },
    ): Promise<void> {
        return this.api.delete<void>(`/containers/${id}`, {
            v: options?.volumes,
            force: options?.force,
            link: options?.link,
        }).then((): void => { });
    }

    /**
     * Export the contents of a container as a tarball.
     * Export a container
     * @param id ID or name of the container
     * @param w stream to write container's filesystem content as a TAR archive'
     */
    public async containerExport(
        id: string,
        w: WritableStream,
    ): Promise<void> {
        return this.api.get(
            `/containers/${id}/export`,
            'application/x-tar',
        ).then(response => { response.body?.pipeTo(w)});
    }

    /**
     * Return low-level information about a container.
     * Inspect a container
     * @param id ID or name of the container
     * @param options
     * @param options.size Return the size of container as fields 'SizeRw' and 'SizeRootFs'
     */
    public async containerInspect(
        id: string,
        options?: {
            size?: boolean;
        },
    ): Promise<types.ContainerInspectResponse> {
        return this.api.getJSON<types.ContainerInspectResponse>(
            `/containers/${id}/json`,
            options,
        );
    }

    /**
     * Send a POSIX signal to a container, defaulting to killing to the container.
     * Kill a container
     * @param id ID or name of the container
     * @param options
     * @param options.signal Signal to send to the container as an integer or string (e.g. 'SIGINT').
     */
    public async containerKill(
        id: string,
        options?: {
            signal?: string;
        },
    ): Promise<void> {
        return this.api.post<void>(`/containers/${id}/kill`, options).then(() => {});
    }

    /**
     * Returns a list of containers. For details on the format, see the [inspect endpoint](#operation/ContainerInspect).  Note that it uses a different, smaller representation of a container than inspecting a single container. For example, the list of linked containers is not propagated .
     * List containers
     * @param options
     * @param options.all Return all containers. By default, only running containers are shown.
     * @param options.limit Return this number of most recently created containers, including non-running ones.
     * @param options.size Return the size of container as fields 'SizeRw' and 'SizeRootFs'.
     * @param options.filters Filters to process on the container list, encoded as JSON (a 'map[string][]string'). For example, '{\&quot;status\&quot;: [\&quot;paused\&quot;]}' will only return paused containers.  Available filters:  - 'ancestor''('&lt;image-name&gt;[:&lt;tag&gt;]', '&lt;image id&gt;', or '&lt;image@digest&gt;') - 'before''('&lt;container id&gt;' or '&lt;container name&gt;') - 'expose''('&lt;port&gt;[/&lt;proto&gt;]'|'&lt;startport-endport&gt;/[&lt;proto&gt;]') - 'exited'&lt;int&gt;' containers with exit code of '&lt;int&gt;' - 'health''('starting'|'healthy'|'unhealthy'|'none') - 'id'&lt;ID&gt;' a container\&#39;s ID - 'isolation''('default'|'process'|'hyperv') (Windows daemon only) - 'is-task''('true'|'false') - 'label'key' or 'label'\&quot;key'value\&quot;' of a container label - 'name'&lt;name&gt;' a container\&#39;s name - 'network''('&lt;network id&gt;' or '&lt;network name&gt;') - 'publish''('&lt;port&gt;[/&lt;proto&gt;]'|'&lt;startport-endport&gt;/[&lt;proto&gt;]') - 'since''('&lt;container id&gt;' or '&lt;container name&gt;') - 'status''('created'|'restarting'|'running'|'removing'|'paused'|'exited'|'dead') - 'volume''('&lt;volume name&gt;' or '&lt;mount point destination&gt;')
     */
    public async containerList(options?: {
        all?: boolean;
        limit?: number;
        size?: boolean;
        filters?: Filter;
    }): Promise<Array<types.ContainerSummary>> {
        return this.api.getJSON<Array<types.ContainerSummary>>(
            '/containers/json',
            options,
        );
    }

    /**
     * Get `stdout` and `stderr` logs from a container.  Note: This endpoint works only for containers with the `json-file` or `journald` logging driver.
     * Get container logs
     * @param id ID or name of the container
     * @param stdout
     * @param stderr
     * @param options
     * @param options.follow Keep connection after returning logs.
     * @param options.stdout Return logs from 'stdout'
     * @param options.stderr Return logs from 'stderr'
     * @param options.since Only return logs since this time, as a UNIX timestamp
     * @param options.until Only return logs before this time, as a UNIX timestamp
     * @param options.timestamps Add timestamps to every log line
     * @param options.tail Only return this number of log lines from the end of the logs. Specify as an integer or 'all' to output all log lines.
     */
    public async containerLogs(
        id: string,
        stdout: stream.Writable,
        stderr: stream.Writable,
        options?: {
            follow?: boolean;
            stdout?: boolean;
            stderr?: boolean;
            since?: number;
            until?: number;
            timestamps?: boolean;
            tail?: string;
        },
    ): Promise<void> {
        const demux = demultiplexStream(stdout, stderr);
        return this.api.get(
            `/containers/${id}/logs`,
            'application/vnd.docker.raw-stream',
            options,
        ).then(response => { response.body?.pipeTo(demux) });
    }

    /**
     * Use the freezer cgroup to suspend all processes in a container.  Traditionally, when suspending a process the `SIGSTOP` signal is used, which is observable by the process being suspended. With the freezer cgroup the process is unaware, and unable to capture, that it is being suspended, and subsequently resumed.
     * Pause a container
     * @param id ID or name of the container
     */
    public async containerPause(id: string): Promise<void> {
        return this.api.post<void>(`/containers/${id}/pause`).then(()=>{});
    }

    /**
     * Delete stopped containers
     * @param options
     * @param options.filters Filters to process on the prune list, encoded as JSON (a 'map[string][]string').  Available filters: - 'until'&lt;timestamp&gt;' Prune containers created before this timestamp. The '&lt;timestamp&gt;' can be Unix timestamps, date formatted timestamps, or Go duration strings (e.g. '10m', '1h30m') computed relative to the daemon machine’s time. - 'label' ('label'&lt;key&gt;', 'label'&lt;key&gt;'&lt;value&gt;', 'label!'&lt;key&gt;', or 'label!'&lt;key&gt;'&lt;value&gt;') Prune containers with (or without, in case 'label!'...' is used) the specified labels.
     */
    public async containerPrune(options?: {
        filters?: string;
    }): Promise<types.ContainerPruneResponse> {
        return this.api.post<types.ContainerPruneResponse>(
            '/containers/prune',
            options,
        ).then((response) => { return response.json() as Promise<types.ContainerPruneResponse>});
    }

    /**
     * Rename a container
     * @param id ID or name of the container
     * @param name New name for the container
     */
    public async containerRename(id: string, name: string): Promise<void> {
        return this.api.post<void>(`/containers/${id}/rename?name=${name}`).then(()=>{});;
    }

    /**
     * Resize the TTY for a container.
     * Resize a container TTY
     * @param id ID or name of the container
     * @param height Height of the TTY session in characters
     * @param width Width of the TTY session in characters
     */
    public async containerResize(
        id: string,
        width: number,
        height: number,
    ): Promise<void> {
        return this.api.post<void>(`/containers/${id}/resize`, {
            w: width,
            h: height,
        }).then(()=>{});
    }

    /**
     * Restart a container
     * @param id ID or name of the container
     * @param options
     * @param options.signal Signal to send to the container as an integer or string (e.g. 'SIGINT').
     * @param options.timeout Number of seconds to wait before killing the container
     */
    public async containerRestart(
        id: string,
        options?: {
            signal?: string;
            timeout?: number;
        },
    ): Promise<void> {
        return this.api.post<void>(`/containers/${id}/restart`, {
            signal: options?.signal,
            t: options?.timeout,
        }).then(() => {});
    }

    /**
     * Start a container
     * @param id ID or name of the container
     * @param options
     * @param options.detachKeys Override the key sequence for detaching a container. Format is a single character '[a-Z]' or 'ctrl-&lt;value&gt;' where '&lt;value&gt;' is one of: 'a-z', '@', '^', '[', ',' or '_'.
     */
    public async containerStart(
        id: string,
        options?: {
            detachKeys?: string;
        },
    ): Promise<void> {
        return this.api.post<void>(`/containers/${id}/start`, options).then(() => {});;
    }

    /**
     * This endpoint returns a live stream of a container’s resource usage statistics.  The `precpu_stats` is the CPU statistic of the *previous* read, and is used to calculate the CPU usage percentage. It is not an exact copy of the `cpu_stats` field.  If either `precpu_stats.online_cpus` or `cpu_stats.online_cpus` is nil then for compatibility with older daemons the length of the corresponding `cpu_usage.percpu_usage` array should be used.  On a cgroup v2 host, the following fields are not set * `blkio_stats`: all fields other than `io_service_bytes_recursive` * `cpu_stats`: `cpu_usage.percpu_usage` * `memory_stats`: `max_usage` and `failcnt` Also, `memory_stats.stats` fields are incompatible with cgroup v1.  To calculate the values shown by the `stats` command of the docker cli tool the following formulas can be used: * used_memory = `memory_stats.usage - memory_stats.stats.cache` * available_memory = `memory_stats.limit` * Memory usage % = `(used_memory / available_memory) * 100.0` * cpu_delta = `cpu_stats.cpu_usage.total_usage - precpu_stats.cpu_usage.total_usage` * system_cpu_delta = `cpu_stats.system_cpu_usage - precpu_stats.system_cpu_usage` * number_cpus = `length(cpu_stats.cpu_usage.percpu_usage)` or `cpu_stats.online_cpus` * CPU usage % = `(cpu_delta / system_cpu_delta) * number_cpus * 100.0`
     * Get container stats based on resource usage
     * @param id ID or name of the container
     * @param options
     * @param options.stream Stream the output. If false, the stats will be output once and then it will disconnect.
     * @param options.oneShot Only get a single stat instead of waiting for 2 cycles. Must be used with 'stream'false'.
     */
    public async containerStats(
        id: string,
        options?: {
            stream?: boolean;
            oneShot?: boolean;
        },
    ): Promise<types.ContainerStatsResponse> {
        return this.api.getJSON<types.ContainerStatsResponse>(
            `/containers/${id}/stats`,
            {
                stream: false, // FIXME implement streaming mode
                oneShot: options?.oneShot,
            },
        );
    }

    /**
     * Stop a container
     * @param id ID or name of the container
     * @param options
     * @param options.signal Signal to send to the container as an integer or string (e.g. 'SIGINT').
     * @param options.timeout Number of seconds to wait before killing the container
     */
    public async containerStop(
        id: string,
        options?: {
            signal?: string;
            timeout?: number;
        },
    ): Promise<void> {
        return this.api.post<void>(`/containers/${id}/stop`, {
            signal: options?.signal,
            t: options?.timeout,
        }).then(() => {});;
    }

    /**
     * On Unix systems, this is done by running the `ps` command. This endpoint is not supported on Windows.
     * List processes running inside a container
     * @param id ID or name of the container
     * @param options
     * @param options.psArgs The arguments to pass to 'ps'. For example, 'aux'
     */
    public async containerTop(
        id: string,
        options?: {
            psArgs?: string;
        },
    ): Promise<types.ContainerTopResponse> {
        return this.api.getJSON<types.ContainerTopResponse>(
            `/containers/${id}/top`,
            {
                ps_args: options?.psArgs,
            },
        );
    }

    /**
     * Resume a container which has been paused.
     * Unpause a container
     * @param id ID or name of the container
     */
    public async containerUnpause(id: string): Promise<void> {
        return this.api.post<void>(`/containers/${id}/unpause`).then(() => {});;
    }

    /**
     * Change various configuration options of a container without having to recreate it.
     * Update a container
     * @param id ID or name of the container
     * @param update
     */
    public async containerUpdate(
        id: string,
        update: types.ContainerUpdateRequest,
    ): Promise<types.ContainerUpdateResponse> {
        return this.api.post<types.ContainerUpdateResponse>(
            `/containers/${id}/update`,
            update,
        ).then((response) => {return response.json() as Promise<types.ContainerUpdateResponse>});
    }

    /**
     * Block until a container stops, then returns the exit code.
     * Wait for a container
     * @param id ID or name of the container
     * @param options
     * @param options.condition Wait until a container state reaches the given condition.  Defaults to 'not-running' if omitted or empty.
     */
    public async containerWait(
        id: string,
        options?: {
            condition?: 'not-running' | 'next-exit' | 'removed';
        },
    ): Promise<types.ContainerWaitResponse> {
        return this.api.post<types.ContainerWaitResponse>(
            `/containers/${id}/wait`,
            undefined,
            options,
        ).then((response) => {return response.json() as Promise<types.ContainerWaitResponse> });
    }

    /**
     * Upload a tar archive to be extracted to a path in the filesystem of container id. `path` parameter is asserted to be a directory. If it exists as a file, 400 error will be returned with message \"not a directory\".
     * Extract an archive of files or folders to a directory in a container
     * @param id ID or name of the container
     * @param path Path to a directory in the container to extract the archive’s contents into.
     * @param tar The input stream must be a tar archive compressed with one of the following algorithms: 'identity' (no compression), 'gzip', 'bzip2', or 'xz'.
     * @param options
     * @param options.noOverwriteDirNonDir If '1', 'true', or 'True' then it will be an error if unpacking the given content would cause an existing directory to be replaced with a non-directory and vice versa.
     * @param options.copyUIDGID If '1', 'true', then it will copy UID/GID maps to the dest file or dir
     */
    public async putContainerArchive(
        id: string,
        path: string,
        tar: stream.Readable,
        options?: {
            noOverwriteDirNonDir?: string;
            copyUIDGID?: string;
        },
    ): Promise<void> {
        return this.api.put(
            `/containers/${id}/archive`,
            {
                path: path,
                noOverwriteDirNonDir: options?.noOverwriteDirNonDir,
                copyUIDGID: options?.copyUIDGID,
            },
            tar,
            'application/x-tar',
        ).then(() => {});
    }

    // --- Network API

    /**
     * The network must be either a local-scoped network or a swarm-scoped network with the `attachable` option set. A network cannot be re-attached to a running container
     * Connect a container to a network
     * @param id Network ID or name
     * @param container
     */
    public async networkConnect(
        id: string,
        container: types.NetworkConnectRequest,
    ): Promise<void> {
        return this.api.post(`/networks/${id}/connect`, container).then(() => {});;
    }

    /**
     * Create a network
     * @param config Network configuration
     */
    public async networkCreate(
        config: types.NetworkCreateRequest,
    ): Promise<types.NetworkCreateResponse> {
        return this.api.post('/networks/create', undefined, config)
            .then((response) => { return response.json() as Promise<types.NetworkCreateResponse>});
    }

    /**
     * Remove a network
     * @param id Network ID or name
     */
    public async networkDelete(id: string): Promise<void> {
        return this.api.delete(`/networks/${id}`).then(() => {});
    }

    /**
     * Disconnect a container from a network
     * @param id Network ID or name
     * @param container
     */
    public async networkDisconnect(
        id: string,
        container: types.NetworkDisconnectRequest,
    ): Promise<void> {
        return this.api.post(`/networks/${id}/disconnect`, container).then(() => {});
    }

    /**
     * Inspect a network
     * @param id Network ID or name
     * @param options
     * @param options.verbose Detailed inspect output for troubleshooting
     * @param options.scope Filter the network by scope (swarm, global, or local)
     */
    public async networkInspect(
        id: string,
        options?: {
            verbose?: boolean;
            scope?: string;
        },
    ): Promise<types.NetworkInspect> {
        return this.api.getJSON(`/networks/${id}`, options);
    }

    /**
     * Returns a list of networks. For details on the format, see the [network inspect endpoint](#operation/NetworkInspect).  Note that it uses a different, smaller representation of a network than inspecting a single network. For example, the list of containers attached to the network is not propagated in API versions 1.28 and up.
     * List networks
     * @param options
     * @param options.filters JSON encoded value of the filters (a 'map[string][]string') to process on the networks list.  Available filters:  - 'dangling'&lt;boolean&gt;' When set to 'true' (or '1'), returns all    networks that are not in use by a container. When set to 'false'    (or '0'), only networks that are in use by one or more    containers are returned. - 'driver'&lt;driver-name&gt;' Matches a network\&#39;s driver. - 'id'&lt;network-id&gt;' Matches all or part of a network ID. - 'label'&lt;key&gt;' or 'label'&lt;key&gt;'&lt;value&gt;' of a network label. - 'name'&lt;network-name&gt;' Matches all or part of a network name. - 'scope'[\&quot;swarm\&quot;|\&quot;global\&quot;|\&quot;local\&quot;]' Filters networks by scope ('swarm', 'global', or 'local'). - 'type'[\&quot;custom\&quot;|\&quot;builtin\&quot;]' Filters networks by type. The 'custom' keyword returns all user-defined networks.
     */
    public async networkList(options?: {
        filters?: Filter;
    }): Promise<Array<types.NetworkSummary>> {
        return this.api.getJSON('/networks', options);
    }

    /**
     * Delete unused networks
     * @param filters Filters to process on the prune list, encoded as JSON (a 'map[string][]string').  Available filters: - 'until'&lt;timestamp&gt;' Prune networks created before this timestamp. The '&lt;timestamp&gt;' can be Unix timestamps, date formatted timestamps, or Go duration strings (e.g. '10m', '1h30m') computed relative to the daemon machine’s time. - 'label' ('label'&lt;key&gt;', 'label'&lt;key&gt;'&lt;value&gt;', 'label!'&lt;key&gt;', or 'label!'&lt;key&gt;'&lt;value&gt;') Prune networks with (or without, in case 'label!'...' is used) the specified labels.
     */
    public async networkPrune(
        filters?: Filter,
    ): Promise<types.NetworkPruneResponse> {
        return this.api.post('/networks/prune', filters)
            .then((response) => { return response.json() as Promise<types.NetworkPruneResponse>});
    }

    // --- Volumes API

    /**
     * Create a volume
     * @param spec Volume configuration
     */
    public async volumeCreate(
        spec: types.VolumeCreateOptions,
    ): Promise<types.Volume> {
        return this.api.post('/volumes/create', undefined, spec, {
            Accept: '*/*',
        }).then((response) => { return response.json() as Promise<types.Volume>});
    }

    /**
     * Instruct the driver to remove the volume.
     * Remove a volume
     * @param id Volume name or ID
     * @param options
     * @param options.force Force the removal of the volume
     */
    public async volumeDelete(
        id: string,
        options?: {
            force?: boolean;
        },
    ): Promise<void> {
        return this.api.delete(`/volumes/${id}`, options).then(() => {});
    }

    /**
     * Inspect a volume
     * @param id Volume name or ID
     */
    public async volumeInspect(id: string): Promise<types.Volume> {
        return this.api.getJSON(`/volumes/${id}`);
    }

    /**
     * List volumes
     * @param filters JSON encoded value of the filters (a 'map[string][]string') to process on the volumes list. Available filters:  - 'dangling'&lt;boolean&gt;' When set to 'true' (or '1'), returns all    volumes that are not in use by a container. When set to 'false'    (or '0'), only volumes that are in use by one or more    containers are returned. - 'driver'&lt;volume-driver-name&gt;' Matches volumes based on their driver. - 'label'&lt;key&gt;' or 'label'&lt;key&gt;:&lt;value&gt;' Matches volumes based on    the presence of a 'label' alone or a 'label' and a value. - 'name'&lt;volume-name&gt;' Matches all or part of a volume name.
     */
    public async volumeList(
        filters?: Filter,
    ): Promise<types.VolumeListResponse> {
        return this.api.getJSON(`/volumes`, {
            filters: filters,
        });
    }

    /**
     * Delete unused volumes
     * @param filters Filters to process on the prune list, encoded as JSON (a 'map[string][]string').  Available filters: - 'label' ('label'&lt;key&gt;', 'label'&lt;key&gt;'&lt;value&gt;', 'label!'&lt;key&gt;', or 'label!'&lt;key&gt;'&lt;value&gt;') Prune volumes with (or without, in case 'label!'...' is used) the specified labels. - 'all' ('all'true') - Consider all (local) volumes for pruning and not just anonymous volumes.
     */
    public async volumePrune(
        filters?: Filter,
    ): Promise<types.VolumePruneResponse> {
        return this.api.post('/volumes/prune', {
            filters: filters,
        }).then((response) => { return response.json() as Promise<types.VolumePruneResponse>});
    }

    // --- Image API

    /**
     * Return image digest and platform information by contacting the registry.
     * Get image information from the registry
     * @param name Image name or id
     */
    public async distributionInspect(
        name: string,
    ): Promise<types.DistributionInspect> {
        return this.api.getJSON(`/distribution/${name}/json`);
    }

    /**
     * Delete builder cache
     * @param reservedSpace Amount of disk space in bytes to keep for cache
     * @param maxUsedSpace Maximum amount of disk space allowed to keep for cache
     * @param minFreeSpace Target amount of free disk space after pruning
     * @param all Remove all types of build cache
     * @param filters A JSON encoded value of the filters (a &#x60;map[string][]string&#x60;) to process on the list of build cache objects.  Available filters:  - &#x60;until&#x3D;&lt;timestamp&gt;&#x60; remove cache older than &#x60;&lt;timestamp&gt;&#x60;. The &#x60;&lt;timestamp&gt;&#x60; can be Unix timestamps, date formatted timestamps, or Go duration strings (e.g. &#x60;10m&#x60;, &#x60;1h30m&#x60;) computed relative to the daemon\&#39;s local time. - &#x60;id&#x3D;&lt;id&gt;&#x60; - &#x60;parent&#x3D;&lt;id&gt;&#x60; - &#x60;type&#x3D;&lt;string&gt;&#x60; - &#x60;description&#x3D;&lt;string&gt;&#x60; - &#x60;inuse&#x60; - &#x60;shared&#x60; - &#x60;private&#x60;
     */
    public async buildPrune(options?: {
        reservedSpace?: number;
        maxUsedSpace?: number;
        minFreeSpace?: number;
        all?: boolean;
        filters?: Filter;
    }): Promise<types.BuildPruneResponse> {
        return this.api.post('/build/prune', options)
            .then((response) => { return response.json() as Promise<types.BuildPruneResponse>});
    }

    /**
     * Build an image from a tar archive with a `Dockerfile` in it.  The `Dockerfile` specifies how the image is built from the tar archive. It is typically in the archive\'s root, but can be at a different path or have a different name by specifying the `dockerfile` parameter. [See the `Dockerfile` reference for more information](https://docs.docker.com/engine/reference/builder/).  The Docker daemon performs a preliminary validation of the `Dockerfile` before starting the build, and returns an error if the syntax is incorrect. After that, each instruction is run one-by-one until the ID of the new image is output.  The build is canceled if the client drops the connection by quitting or being killed.
     * Build an image
     *
     * @param buildContext A tar archive compressed with one of the following algorithms: identity (no compression), gzip, bzip2, xz.
     * @param dockerfile Path within the build context to the &#x60;Dockerfile&#x60;. This is ignored if &#x60;remote&#x60; is specified and points to an external &#x60;Dockerfile&#x60;.
     * @param t A name and optional tag to apply to the image in the &#x60;name:tag&#x60; format. If you omit the tag the default &#x60;latest&#x60; value is assumed. You can provide several &#x60;t&#x60; parameters.
     * @param extrahosts Extra hosts to add to /etc/hosts
     * @param remote A Git repository URI or HTTP/HTTPS context URI. If the URI points to a single text file, the file’s contents are placed into a file called &#x60;Dockerfile&#x60; and the image is built from that file. If the URI points to a tarball, the file is downloaded by the daemon and the contents therein used as the context for the build. If the URI points to a tarball and the &#x60;dockerfile&#x60; parameter is also specified, there must be a file with the corresponding path inside the tarball.
     * @param q Suppress verbose build output.
     * @param nocache Do not use the cache when building the image.
     * @param cachefrom JSON array of images used for build cache resolution.
     * @param pull Attempt to pull the image even if an older image exists locally.
     * @param rm Remove intermediate containers after a successful build.
     * @param forcerm Always remove intermediate containers, even upon failure.
     * @param memory Set memory limit for build.
     * @param memswap Total memory (memory + swap). Set as &#x60;-1&#x60; to disable swap.
     * @param cpushares CPU shares (relative weight).
     * @param cpusetcpus CPUs in which to allow execution (e.g., &#x60;0-3&#x60;, &#x60;0,1&#x60;).
     * @param cpuperiod The length of a CPU period in microseconds.
     * @param cpuquota Microseconds of CPU time that the container can get in a CPU period.
     * @param buildargs JSON map of string pairs for build-time variables. Users pass these values at build-time. Docker uses the buildargs as the environment context for commands run via the &#x60;Dockerfile&#x60; RUN instruction, or for variable expansion in other &#x60;Dockerfile&#x60; instructions. This is not meant for passing secret values.  For example, the build arg &#x60;FOO&#x3D;bar&#x60; would become &#x60;{\&quot;FOO\&quot;:\&quot;bar\&quot;}&#x60; in JSON. This would result in the query parameter &#x60;buildargs&#x3D;{\&quot;FOO\&quot;:\&quot;bar\&quot;}&#x60;. Note that &#x60;{\&quot;FOO\&quot;:\&quot;bar\&quot;}&#x60; should be URI component encoded.  [Read more about the buildargs instruction.](https://docs.docker.com/engine/reference/builder/#arg)
     * @param shmsize Size of &#x60;/dev/shm&#x60; in bytes. The size must be greater than 0. If omitted the system uses 64MB.
     * @param squash Squash the resulting images layers into a single layer. *(Experimental release only.)*
     * @param labels Arbitrary key/value labels to set on the image, as a JSON map of string pairs.
     * @param networkmode Sets the networking mode for the run commands during build. Supported standard values are: &#x60;bridge&#x60;, &#x60;host&#x60;, &#x60;none&#x60;, and &#x60;container:&lt;name|id&gt;&#x60;. Any other value is taken as a custom network\&#39;s name or ID to which this container should connect to.
     * @param contentType
     * @param xRegistryConfig This is a base64-encoded JSON object with auth configurations for multiple registries that a build may refer to.  The key is a registry URL, and the value is an auth configuration object, [as described in the authentication section](#section/Authentication). For example:  &#x60;&#x60;&#x60; {   \&quot;docker.example.com\&quot;: {     \&quot;username\&quot;: \&quot;janedoe\&quot;,     \&quot;password\&quot;: \&quot;hunter2\&quot;   },   \&quot;https://index.docker.io/v1/\&quot;: {     \&quot;username\&quot;: \&quot;mobydock\&quot;,     \&quot;password\&quot;: \&quot;conta1n3rize14\&quot;   } } &#x60;&#x60;&#x60;  Only the registry domain name (and port if not the default 443) are required. However, for legacy reasons, the Docker Hub registry must be specified with both a &#x60;https://&#x60; prefix and a &#x60;/v1/&#x60; suffix even though Docker will prefer to use the v2 registry API.
     * @param platform Platform in the format os[/arch[/variant]]
     * @param target Target build stage
     * @param outputs BuildKit output configuration in the format of a stringified JSON array of objects. Each object must have two top-level properties: &#x60;Type&#x60; and &#x60;Attrs&#x60;. The &#x60;Type&#x60; property must be set to \&#39;moby\&#39;. The &#x60;Attrs&#x60; property is a map of attributes for the BuildKit output configuration. See https://docs.docker.com/build/exporters/oci-docker/ for more information.  Example:  &#x60;&#x60;&#x60; [{\&quot;Type\&quot;:\&quot;moby\&quot;,\&quot;Attrs\&quot;:{\&quot;type\&quot;:\&quot;image\&quot;,\&quot;force-compression\&quot;:\&quot;true\&quot;,\&quot;compression\&quot;:\&quot;zstd\&quot;}}] &#x60;&#x60;&#x60;
     * @param version Version of the builder backend to use.  - &#x60;1&#x60; is the first generation classic (deprecated) builder in the Docker daemon (default) - &#x60;2&#x60; is [BuildKit](https://github.com/moby/buildkit)
     */
    public async imageBuild(
        buildContext: stream.Readable,
        callback: (event: types.BuildInfo) => void,
        options?: {
            dockerfile?: string;
            tag?: string;
            extrahosts?: string;
            remote?: string;
            quiet?: boolean;
            nocache?: boolean;
            cachefrom?: string;
            pull?: string;
            rm?: boolean;
            forcerm?: boolean;
            memory?: number;
            memswap?: number;
            cpushares?: number;
            cpusetcpus?: string;
            cpuperiod?: number;
            cpuquota?: number;
            buildargs?: string;
            shmsize?: number;
            squash?: boolean;
            labels?: string;
            networkmode?: string;
            credentials?: Record<string, AuthConfig>;
            platform?: string;
            target?: string;
            outputs?: string;
            version?: '1' | '2';
        },
    ): Promise<string> {
        const headers: Record<string, string> = {};
        headers['Content-Type'] = 'application/x-tar';

        if (options?.credentials) {
            headers['X-Registry-Config'] = this.authCredentials(
                options.credentials,
            );
        }
        let imageID: string = 'FIXME';
        return this.api
            .post(
                '/build',
                {
                    dockerfile: options?.dockerfile,
                    t: options?.tag,
                    extrahosts: options?.extrahosts,
                    remote: options?.remote,
                    q: options?.quiet,
                    nocache: options?.nocache,
                    cachefrom: options?.cachefrom,
                    pull: options?.pull,
                    rm: options?.rm,
                    forcerm: options?.forcerm,
                    memory: options?.memory,
                    memswap: options?.memswap,
                    cpushares: options?.cpushares,
                    cpusetcpus: options?.cpusetcpus,
                    cpuperiod: options?.cpuperiod,
                    cpuquota: options?.cpuquota,
                    buildargs: options?.buildargs,
                    shmsize: options?.shmsize,
                    squash: options?.squash,
                    labels: options?.labels,
                    networkmode: options?.networkmode,
                    platform: options?.platform,
                    target: options?.target,
                    outputs: options?.outputs,
                    version: options?.version || '2',
                },
                buildContext,
                headers,
               /* (data: Buffer, encoding?: BufferEncoding) => {
                    data.toString(encoding)
                        .split('\n')
                        .filter((line) => line.trim() !== '')
                        .forEach((line) => {
                            let buildInfo = JSON.parse(line) as types.BuildInfo;
                            if (buildInfo.id === 'moby.image.id') {
                                imageID = buildInfo.aux?.ID || '';
                            }
                            callback(buildInfo);
                        });
                },*/
            )
            .then((response) => { return "?"})
            .then(() => {
                return imageID;
            });
    }

    /**
     * Create a new image from a container
     * @param container The ID or name of the container to commit
     * @param repo Repository name for the created image
     * @param tag Tag name for the create image
     * @param comment Commit message
     * @param author Author of the image (e.g., &#x60;John Hannibal Smith &lt;hannibal@a-team.com&gt;&#x60;)
     * @param pause Whether to pause the container before committing
     * @param changes &#x60;Dockerfile&#x60; instructions to apply while committing
     * @param containerConfig The container configuration
     */
    public async imageCommit(
        container: string,
        options?: {
            repo?: string;
            tag?: string;
            comment?: string;
            author?: string;
            pause?: boolean;
            changes?: string;
            containerConfig?: types.ContainerConfig;
        },
    ): Promise<types.IDResponse> {
        return this.api.post(`/commit`, {
            container: container,
            repo: options?.repo,
            tag: options?.tag,
            comment: options?.comment,
            author: options?.author,
            pause: options?.pause,
            changes: options?.changes,
            containerConfig: options?.containerConfig,
        }).then((response) => { return response.json() as Promise<types.IDResponse>});
    }

    /**
     * Pull or import an image.
     * Create an image
     * @param callback
     * @param options
     * @param options.fromImage Name of the image to pull. If the name includes a tag or digest, specific behavior applies:  - If only 'fromImage' includes a tag, that tag is used. - If both 'fromImage' and 'tag' are provided, 'tag' takes precedence. - If 'fromImage' includes a digest, the image is pulled by digest, and 'tag' is ignored. - If neither a tag nor digest is specified, all tags are pulled.
     * @param options.fromSrc Source to import. The value may be a URL from which the image can be retrieved or '-' to read the image from the request body. This parameter may only be used when importing an image.
     * @param options.repo Repository name given to an image when it is imported. The repo may include a tag. This parameter may only be used when importing an image.
     * @param options.tag Tag or digest. If empty when pulling an image, this causes all tags for the given image to be pulled.
     * @param options.message Set commit message for imported image.
     * @param options.credentials A base64url-encoded auth configuration.  Refer to the [authentication section](#section/Authentication) for details.
     * @param options.changes Apply 'Dockerfile' instructions to the image that is created, for example: 'changes'ENV DEBUG'true'. Note that 'ENV DEBUG'true' should be URI component encoded.  Supported 'Dockerfile' instructions: 'CMD'|'ENTRYPOINT'|'ENV'|'EXPOSE'|'ONBUILD'|'USER'|'VOLUME'|'WORKDIR'
     * @param options.platform Platform in the format os[/arch[/variant]].  When used in combination with the 'fromImage' option, the daemon checks if the given image is present in the local image cache with the given OS and Architecture, and otherwise attempts to pull the image. If the option is not set, the host\&#39;s native OS and Architecture are used. If the given image does not exist in the local image cache, the daemon attempts to pull the image with the host\&#39;s native OS and Architecture. If the given image does exists in the local image cache, but its OS or architecture does not match, a warning is produced.  When used with the 'fromSrc' option to import an image from an archive, this option sets the platform information for the imported image. If the option is not set, the host\&#39;s native OS and Architecture are used for the imported image.
     * @param options.inputImage Image content if the value '-' has been specified in fromSrc query parameter
     */
    public async imageCreate(
        callback: (event: any) => void,
        options?: {
            fromImage?: string;
            fromSrc?: string;
            repo?: string;
            tag?: string;
            message?: string;
            credentials?: AuthConfig;
            changes?: Array<string>;
            platform?: string;
            inputImage?: string;
        },
    ): Promise<void> {
        const headers: Record<string, string> = {};

        if (options?.credentials) {
            headers['X-Registry-Auth'] = this.authCredentials(
                options.credentials,
            );
        }

        return this.api.post(
            '/images/create',
            {
                fromImage: options?.fromImage,
                fromSrc: options?.fromSrc,
                repo: options?.repo,
                tag: options?.tag,
                message: options?.message,
                changes: options?.changes,
                platform: options?.platform,
                inputImage: options?.inputImage,
            },
            undefined,
            headers,
            /*(data: Buffer, encoding?: BufferEncoding) => {
                data.toString(encoding)
                    .split('\n')
                    .filter((line) => line.trim() !== '')
                    .forEach((line) => {
                        callback(JSON.parse(line));
                    });
            },*/
        ).then(() => {});
    }

    /**
     * Remove an image, along with any untagged parent images that were referenced by that image.  Images can\'t be removed if they have descendant images, are being used by a running container or are being used by a build.
     * Remove an image
     * @param name Image name or ID
     * @param options
     * @param options.force Remove the image even if it is being used by stopped containers or has other tags
     * @param options.noprune Do not delete untagged parent images
     * @param options.platforms Select platform-specific content to delete. Multiple values are accepted. Each platform is a OCI platform encoded as a JSON string.
     */
    public async imageDelete(
        name: string,
        options?: {
            force?: boolean;
            noprune?: boolean;
            platforms?: Array<string>;
        },
    ): Promise<Array<types.ImageDeleteResponseItem>> {
        return this.api.delete(`/images/${name}`, options)
            .then((response) => { return response.json() as Promise<Array<types.ImageDeleteResponseItem>>});
    }

    /**
     * Get a tarball containing all images and metadata for a repository.  If `name` is a specific name and tag (e.g. `ubuntu:latest`), then only that image (and its parents) are returned. If `name` is an image ID, similarly only that image (and its parents) are returned, but with the exclusion of the `repositories` file in the tarball, as there were no image names referenced.  ### Image tarball format  An image tarball contains [Content as defined in the OCI Image Layout Specification](https://github.com/opencontainers/image-spec/blob/v1.1.1/image-layout.md#content).  Additionally, includes the manifest.json file associated with a backwards compatible docker save format.  If the tarball defines a repository, the tarball should also include a `repositories` file at the root that contains a list of repository and tag names mapped to layer IDs.  ```json {   \"hello-world\": {     \"latest\": \"565a9d68a73f6706862bfe8409a7f659776d4d60a8d096eb4a3cbce6999cc2a1\"   } } ```
     * Export an image
     * @param name Image name or ID
     * @param w stream to write the tarball to
     * @param platform JSON encoded OCI platform describing a platform which will be used to select a platform-specific image to be saved if the image is multi-platform. If not provided, the full multi-platform image will be saved.  Example: &#x60;{\&quot;os\&quot;: \&quot;linux\&quot;, \&quot;architecture\&quot;: \&quot;arm\&quot;, \&quot;variant\&quot;: \&quot;v5\&quot;}&#x60;
     */
    public async imageGet(
        name: string,
        w: WritableStream,
        platform?: types.Platform,
    ): Promise<void> {
        return this.api.get(
            `/images/${name}/get`,
            'application/x-tar',
            {
                platform: platform,
            },
        ).then((response) => { response.body?.pipeTo(w)});
    }

    /**
     * Get a tarball containing all images and metadata for several image repositories.  For each value of the `names` parameter: if it is a specific name and tag (e.g. `ubuntu:latest`), then only that image (and its parents) are returned; if it is an image ID, similarly only that image (and its parents) are returned and there would be no names referenced in the \'repositories\' file for this image ID.  For details on the format, see the [export image endpoint](#operation/ImageGet).
     * Export several images
     * @param names Image names to filter by
     * @param platform JSON encoded OCI platform(s) which will be used to select the platform-specific image(s) to be saved if the image is multi-platform. If not provided, the full multi-platform image will be saved.  Example: &#x60;{\&quot;os\&quot;: \&quot;linux\&quot;, \&quot;architecture\&quot;: \&quot;arm\&quot;, \&quot;variant\&quot;: \&quot;v5\&quot;}&#x60;
     */
    public async imageGetAll(
        names: Array<string>,
        platform?: types.Platform,
    ): Promise<ReadableStream> {
        return this.api.get(`/images/get`,
            'application/x-tar',
            {
                names: names,
                platform: platform,
            }).then((response) => {
                if (!response.body) {
                    throw new Error('No response body');
                }
                return response.body
            });
    }

    /**
     * Return parent layers of an image.
     * Get the history of an image
     * @param name Image name or ID
     * @param options
     * @param options.platform JSON-encoded OCI platform to select the platform-variant. If omitted, it defaults to any locally available platform, prioritizing the daemon\&#39;s host platform.  If the daemon provides a multi-platform image store, this selects the platform-variant to show the history for. If the image is a single-platform image, or if the multi-platform image does not provide a variant matching the given platform, an error is returned.  Example: '{\&quot;os\&quot;: \&quot;linux\&quot;, \&quot;architecture\&quot;: \&quot;arm\&quot;, \&quot;variant\&quot;: \&quot;v5\&quot;}'
     */
    public async imageHistory(
        name: string,
        options?: {
            platform?: string;
        },
    ): Promise<Array<types.HistoryResponseItem>> {
        return this.api.getJSON(`/image/${name}/history`, options);
    }

    /**
     * Return low-level information about an image.
     * Inspect an image
     * @param name Image name or id
     * @param options
     * @param options.manifests Include Manifests in the image summary.
     */
    public async imageInspect(
        name: string,
        options?: {
            manifests?: boolean;
        },
    ): Promise<types.ImageInspect> {
        return this.api.getJSON(`/images/${name}/json`, options);
    }

    /**
     * Returns a list of images on the server. Note that it uses a different, smaller representation of an image than inspecting a single image.
     * List Images
     * @param options
     * @param options.all Show all images. Only images from a final layer (no children) are shown by default.
     * @param options.filters A JSON encoded value of the filters (a 'map[string][]string') to process on the images list.  Available filters:  - 'before''('&lt;image-name&gt;[:&lt;tag&gt;]',  '&lt;image id&gt;' or '&lt;image@digest&gt;') - 'dangling'true' - 'label'key' or 'label'\&quot;key'value\&quot;' of an image label - 'reference''('&lt;image-name&gt;[:&lt;tag&gt;]') - 'since''('&lt;image-name&gt;[:&lt;tag&gt;]',  '&lt;image id&gt;' or '&lt;image@digest&gt;') - 'until'&lt;timestamp&gt;'
     * @param options.sharedSize Compute and show shared size as a 'SharedSize' field on each image.
     * @param options.digests Show digest information as a 'RepoDigests' field on each image.
     * @param options.manifests Include 'Manifests' in the image summary.
     */
    public async imageList(options?: {
        all?: boolean;
        filters?: Filter;
        sharedSize?: boolean;
        digests?: boolean;
        manifests?: boolean;
    }): Promise<Array<types.ImageSummary>> {
        return this.api.getJSON('/images/json', options);
    }

    /**
     * Load a set of images and tags into a repository.  For details on the format, see the [export image endpoint](#operation/ImageGet).
     * Import images
     * @param quiet Suppress progress details during load.
     * @param platform JSON encoded OCI platform(s) which will be used to select the platform-specific image(s) to load if the image is multi-platform. If not provided, the full multi-platform image will be loaded.  Example: &#x60;{\&quot;os\&quot;: \&quot;linux\&quot;, \&quot;architecture\&quot;: \&quot;arm\&quot;, \&quot;variant\&quot;: \&quot;v5\&quot;}&#x60;
     * @param imagesTarball Tar archive containing images
     */
    public async imageLoad(
        imagesTarball: stream.Readable,
        options?: {
            quiet?: boolean;
            platform?: Platform;
            callback?: (event: any) => void;
        },
    ): Promise<void> {
        return this.api.post(
            `/images/load`,
            options,
            imagesTarball,
            {
                'Content-Type': 'application/x-tar',
            },
        ).then(() => {});
    }

    /**
     * Delete unused images
     * @param filters Filters to process on the prune list, encoded as JSON (a &#x60;map[string][]string&#x60;). Available filters:  - &#x60;dangling&#x3D;&lt;boolean&gt;&#x60; When set to &#x60;true&#x60; (or &#x60;1&#x60;), prune only    unused *and* untagged images. When set to &#x60;false&#x60;    (or &#x60;0&#x60;), all unused images are pruned. - &#x60;until&#x3D;&lt;string&gt;&#x60; Prune images created before this timestamp. The &#x60;&lt;timestamp&gt;&#x60; can be Unix timestamps, date formatted timestamps, or Go duration strings (e.g. &#x60;10m&#x60;, &#x60;1h30m&#x60;) computed relative to the daemon machine’s time. - &#x60;label&#x60; (&#x60;label&#x3D;&lt;key&gt;&#x60;, &#x60;label&#x3D;&lt;key&gt;&#x3D;&lt;value&gt;&#x60;, &#x60;label!&#x3D;&lt;key&gt;&#x60;, or &#x60;label!&#x3D;&lt;key&gt;&#x3D;&lt;value&gt;&#x60;) Prune images with (or without, in case &#x60;label!&#x3D;...&#x60; is used) the specified labels.
     */
    public async imagePrune(
        filters?: Filter,
    ): Promise<types.ImagePruneResponse> {
        return this.api.post(`/images/prune`, {
            filters: filters,
        }).then((response) => { return response.json() as Promise<types.ImagePruneResponse> });
    }

    /**
     * Push an image to a registry.  If you wish to push an image on to a private registry, that image must already have a tag which references the registry. For example, `registry.example.com/myimage:latest`.  The push is cancelled if the HTTP connection is closed.
     * Push an image
     * @param name Name of the image to push. For example, &#x60;registry.example.com/myimage&#x60;. The image must be present in the local image store with the same name.  The name should be provided without tag; if a tag is provided, it is ignored. For example, &#x60;registry.example.com/myimage:latest&#x60; is considered equivalent to &#x60;registry.example.com/myimage&#x60;.  Use the &#x60;tag&#x60; parameter to specify the tag to push.
     * @param credentials A base64url-encoded auth configuration.  Refer to the [authentication section](#section/Authentication) for details.
     * @param tag Tag of the image to push. For example, &#x60;latest&#x60;. If no tag is provided, all tags of the given image that are present in the local image store are pushed.
     * @param platform JSON-encoded OCI platform to select the platform-variant to push. If not provided, all available variants will attempt to be pushed.  If the daemon provides a multi-platform image store, this selects the platform-variant to push to the registry. If the image is a single-platform image, or if the multi-platform image does not provide a variant matching the given platform, an error is returned.  Example: &#x60;{\&quot;os\&quot;: \&quot;linux\&quot;, \&quot;architecture\&quot;: \&quot;arm\&quot;, \&quot;variant\&quot;: \&quot;v5\&quot;}&#x60;
     */
    public async imagePush(
        name: string,
        options: {
            credentials: AuthConfig;
            tag?: string;
            platform?: Platform;
            callback: (event: any) => void;
        },
    ): Promise<void> {
        const headers: Record<string, string> = {};

        if (options?.credentials) {
            headers['X-Registry-Auth'] = this.authCredentials(
                options.credentials,
            );
        }

        return this.api.post(
            `/images/${name}/push`,
            {
                tag: options?.tag,
                platform: options?.platform,
            },
            undefined,
            headers,
            // FIXME options?.callback,
        ).then(()=>{});
    }

    /**
     * Tag an image so that it becomes part of a repository.
     * Tag an image
     * @param name Image name or ID to tag.
     * @param repo The repository to tag in. For example, &#x60;someuser/someimage&#x60;.
     * @param tag The name of the new tag.
     */
    public async imageTag(
        name: string,
        repo: string,
        tag: string,
    ): Promise<void> {
        return this.api.post(`/images/${name}/tag`, {
            repo: repo,
            tag: tag,
        }).then(()=> {});
    }

    // -- Exec

    /**
     * Run a command inside a runnin
     * Create an exec instance
     * @param id ID or name of conta
     * @param execConfig Exec config
     */
    public async containerExec(
        id: string,
        execConfig: types.ExecConfig,
    ): Promise<types.IDResponse> {
        return this.api.post(`/containers/${id}/exec`, undefined, execConfig)
            .then((response) => { return response.json() as Promise<types.IDResponse> });
    }

    /**
     * Return low-level information
     * Inspect an exec instance
     * @param id Exec instance ID
     */
    public async execInspect(id: string): Promise<types.ExecInspectResponse> {
        return this.api.getJSON(`/exec/${id}/json`);
    }

    /**
     * Resize the TTY session used b
     * Resize an exec instance
     * @param id Exec instance ID
     * @param height Height of the TTY se
     * @param width Width of the TTY ses
     */
    public async execResize(
        id: string,
        width: number,
        height: number,
    ): Promise<void> {
        return this.api.post<void>(`/exec/${id}/resize`, {
            w: width,
            h: height,
        }).then(() => {});
    }

    /**
     * Starts a previously set up ex
     * Start an exec instance
     * @param id Exec instance ID
     * @param execStartConfig
     */
    public async execStart(
        id: string,
        execStartConfig?: types.ExecStartConfig,
    ): Promise<void> {
        return this.api.post(`/exec/${id}/start`, undefined, execStartConfig)
            .then(()=>{});
    }
}
