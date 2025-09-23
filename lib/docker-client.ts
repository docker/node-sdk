import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as tls from 'tls';
import * as models from './models/index.js';
import {HTTPClient} from './http.js';
import {SocketAgent} from './socket.js';
import {Filter} from './filter.js';
import {SSH} from './ssh.js';
import {TLS} from './tls.js';
import * as stream from 'node:stream';
import {demultiplexStream} from './multiplexed-stream.js';
import {getErrorMessage, isFileNotFoundError, parseDockerHost} from './util.js';

export interface Credentials {
    username: string;
    password: string;
    email: string;
    serveraddress: string;
}

export interface IdentityToken {
    token: string;
}

// noinspection JSUnusedGlobalSymbols
export class DockerClient {
    private api: HTTPClient;

    constructor(agent: http.Agent) {
        this.api = new HTTPClient(agent);
    }

    /**
     * Create a DockerClient instance from a Docker host string
     * @param dockerHost Docker host string (e.g., "unix:/var/run/docker.sock", "tcp://localhost:2376", or "ssh://user@host[:port][/path/to/docker.sock]")
     * @param certPath Optional path to directory containing TLS certificates (ca.pem, cert.pem, key.pem) for TCP connections
     * @returns Promise that resolves to a connected DockerClient instance
     */
    static fromDockerHost(
        dockerHost: string,
        certPath?: string,
    ): Promise<DockerClient> {
        return new Promise((resolve, reject) => {
            if (dockerHost.startsWith('unix:')) {
                // Unix socket connection - use SocketAgent with socket creation function
                const socketPath = dockerHost.substring(5); // Remove "unix:" prefix

                try {
                    const agent = new SocketAgent(() =>
                        net.createConnection(socketPath),
                    );
                    resolve(new DockerClient(agent));
                } catch (error) {
                    reject(
                        new Error(
                            `Failed to create Docker client for ${dockerHost}: ${getErrorMessage(error)}`,
                        ),
                    );
                }
            } else if (dockerHost.startsWith('tcp:')) {
                // TCP connection - use SocketAgent with TCP socket creation function
                const defaultPort = certPath ? 2376 : 2375; // Default ports: 2376 for TLS, 2375 for plain
                const { host, port } = parseDockerHost(dockerHost, defaultPort);

                try {
                    let agent: SocketAgent;

                    if (certPath) {
                        // Use SocketAgent with TLS socket creation function
                        const tlsOptions = TLS.loadCertificates(certPath);
                        agent = new SocketAgent(() =>
                            tls.connect({ host, port, ...tlsOptions }),
                        );
                    } else {
                        // Use SocketAgent with plain TCP socket creation function
                        agent = new SocketAgent(() =>
                            net.createConnection({ host, port }),
                        );
                    }

                    resolve(new DockerClient(agent));
                } catch (error) {
                    reject(
                        new Error(
                            `Failed to create Docker client for ${dockerHost}: ${getErrorMessage(error)}`,
                        ),
                    );
                }
            } else if (dockerHost.startsWith('ssh:')) {
                // SSH connection - use SocketAgent with SSH socket creation function
                try {
                    const agent = new SocketAgent(
                        SSH.createSocketFactory(dockerHost),
                    );
                    resolve(new DockerClient(agent));
                } catch (error) {
                    reject(
                        new Error(
                            `Failed to create SSH Docker client for ${dockerHost}: ${getErrorMessage(error)}`,
                        ),
                    );
                }
            } else {
                reject(
                    new Error(
                        `Unsupported Docker host format: ${dockerHost}. Must start with "unix:", "tcp:", or "ssh:"`,
                    ),
                );
                return;
            }
        });
    }

    /**
     * Create a DockerClient instance from a Docker context name
     * @param contextName Docker context name to search for, or uses DOCKER_CONTEXT env var if not provided
     * @returns Promise that resolves to a connected DockerClient instance
     */
    static async fromDockerContext(
        contextName?: string,
    ): Promise<DockerClient> {
        // Use DOCKER_CONTEXT environment variable if contextName not provided
        const targetContext = contextName || process.env.DOCKER_CONTEXT;

        if (!targetContext) {
            throw new Error(
                'No context name provided and DOCKER_CONTEXT environment variable is not set',
            );
        }
        const contextsDir = path.join(
            os.homedir(),
            '.docker',
            'contexts',
            'meta',
        );

        try {
            // Read all directories in the contexts meta directory
            const contextDirs = fs
                .readdirSync(contextsDir, { withFileTypes: true })
                .filter((dirent) => dirent.isDirectory())
                .map((dirent) => dirent.name);

            for (const contextDir of contextDirs) {
                const metaJsonPath = path.join(
                    contextsDir,
                    contextDir,
                    'meta.json',
                );

                try {
                    if (fs.existsSync(metaJsonPath)) {
                        const metaContent = fs.readFileSync(
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
                                return DockerClient.fromDockerHost(dockerHost);
                            } else {
                                throw new Error(
                                    `Docker context '${targetContext}' found but has no valid Docker endpoint`,
                                );
                            }
                        }
                    }
                } catch (parseError) {
                    // Skip invalid meta.json files
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
            return DockerClient.fromDockerHost(process.env.DOCKER_HOST);
        }

        // Check for DOCKER_CONFIG environment variable, otherwise use default path
        const configPath =
            process.env.DOCKER_CONFIG ||
            path.join(os.homedir(), '.docker', 'config.json');

        try {
            if (!fs.existsSync(configPath)) {
                // If no config file exists, use default context (usually unix socket)
                return DockerClient.fromDockerHost('unix:/var/run/docker.sock');
            }

            const configContent = fs.readFileSync(configPath, 'utf8');
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

    public authCredentials(credentials: Credentials | IdentityToken): string {
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
        authConfig: models.AuthConfig,
    ): Promise<models.SystemAuthResponse> {
        return this.api.post<models.SystemAuthResponse>('/auth', authConfig);
    }

    /**
     * Get data usage information
     * @param type Object types, for which to compute and return data.
     */
    public async systemDataUsage(
        type?: Array<'container' | 'image' | 'volume' | 'build-cache'>,
    ): Promise<models.SystemDataUsageResponse> {
        return this.api.get<models.SystemDataUsageResponse>('/system/df', {
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
        callback: (event: models.EventMessage) => void,
        options?: {
            since?: string;
            until?: string;
            filters?: Filter;
        },
    ) {
        await this.api.sendHTTPRequest('GET', '/events', {
            params: options,
            callback: (data: string) => {
                data.split('\n').forEach((line) => {
                    callback(JSON.parse(line) as models.EventMessage);
                });
            },
        });
    }

    /**
     * This is a dummy endpoint you can use to test if the server is accessible.
     * Ping
     */
    public systemPing(): Promise<string> {
        return this.api
            .sendHTTPRequest('HEAD', '/_ping', { accept: 'text/plain' })
            .then((response) => response.headers['api-version'] as string);
    }

    /**
     * Get system information
     */
    public async systemInfo(): Promise<models.SystemInfo> {
        return this.api.get<models.SystemInfo>('/info');
    }

    /**
     * Returns the version of Docker that is running and various information about the system that Docker is running on.
     * Get version
     */
    public async systemVersion(): Promise<models.SystemVersion> {
        return this.api.get<models.SystemVersion>('/version');
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
        out: NodeJS.WritableStream,
    ): Promise<void> {
        return this.api.get<void>(
            `/containers/${id}/archive`,
            {
                path: path,
            },
            'application/x-tar',
            (data) => out.write(data),
        );
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
    ): Promise<models.FileInfo> {
        return this.api
            .sendHTTPRequest('HEAD', `/containers/${id}/archive`, {
                params: {
                    path: path,
                },
            })
            .then((response) => {
                const header = response.headers[
                    'x-docker-container-path-stat'
                ] as string;
                const json = Buffer.from(header, 'base64').toString('utf-8');
                return models.FileInfo.fromJSON(json);
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
        return this.api
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
            });
    }

    /**
     * Returns which files in a container\'s filesystem have been added, deleted, or modified. The `Kind` of modification can be one of:  - `0`: Modified (\"C\") - `1`: Added (\"A\") - `2`: Deleted (\"D\")
     * Get changes on a container’s filesystem
     * @param id ID or name of the container
     */
    public async containerChanges(
        id: string,
    ): Promise<Array<models.FilesystemChange>> {
        return this.api.get<Array<models.FilesystemChange>>(
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
        spec: models.ContainerCreateRequest,
        options?: {
            name?: string;
            platform?: string;
        },
    ): Promise<models.ContainerCreateResponse> {
        return this.api.post<models.ContainerCreateResponse>(
            '/containers/create',
            options,
            spec,
        );
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
        });
    }

    /**
     * Export the contents of a container as a tarball.
     * Export a container
     * @param options
     * @param options.id ID or name of the container
     */
    public async containerExport(options?: { id: string }): Promise<void> {
        // TODO
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
    ): Promise<models.ContainerInspectResponse> {
        return this.api.get<models.ContainerInspectResponse>(
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
        return this.api.post<void>(`/containers/${id}/kill`, options);
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
    }): Promise<Array<models.ContainerSummary>> {
        return this.api.get<Array<models.ContainerSummary>>(
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
            options,
            'application/vnd.docker.raw-stream',
            (data) => demux.write(data),
        );
    }

    /**
     * Use the freezer cgroup to suspend all processes in a container.  Traditionally, when suspending a process the `SIGSTOP` signal is used, which is observable by the process being suspended. With the freezer cgroup the process is unaware, and unable to capture, that it is being suspended, and subsequently resumed.
     * Pause a container
     * @param id ID or name of the container
     */
    public async containerPause(id: string): Promise<void> {
        return this.api.post<void>(`/containers/${id}/pause`);
    }

    /**
     * Delete stopped containers
     * @param options
     * @param options.filters Filters to process on the prune list, encoded as JSON (a 'map[string][]string').  Available filters: - 'until'&lt;timestamp&gt;' Prune containers created before this timestamp. The '&lt;timestamp&gt;' can be Unix timestamps, date formatted timestamps, or Go duration strings (e.g. '10m', '1h30m') computed relative to the daemon machine’s time. - 'label' ('label'&lt;key&gt;', 'label'&lt;key&gt;'&lt;value&gt;', 'label!'&lt;key&gt;', or 'label!'&lt;key&gt;'&lt;value&gt;') Prune containers with (or without, in case 'label!'...' is used) the specified labels.
     */
    public async containerPrune(options?: {
        filters?: string;
    }): Promise<models.ContainerPruneResponse> {
        return this.api.post<models.ContainerPruneResponse>(
            '/containers/prune',
            options,
        );
    }

    /**
     * Rename a container
     * @param id ID or name of the container
     * @param name New name for the container
     */
    public async containerRename(id: string, name: string): Promise<void> {
        return this.api.post<void>(`/containers/${id}/rename?name=${name}`);
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
        });
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
        });
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
        return this.api.post<void>(`/containers/${id}/start`, options);
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
    ): Promise<models.ContainerStatsResponse> {
        return this.api.get<models.ContainerStatsResponse>(
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
        });
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
    ): Promise<models.ContainerTopResponse> {
        return this.api.get<models.ContainerTopResponse>(
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
        return this.api.post<void>(`/containers/${id}/unpause`);
    }

    /**
     * Change various configuration options of a container without having to recreate it.
     * Update a container
     * @param id ID or name of the container
     * @param update
     */
    public async containerUpdate(
        id: string,
        update: models.ContainerUpdateRequest,
    ): Promise<models.ContainerUpdateResponse> {
        return this.api.post<models.ContainerUpdateResponse>(
            `/containers/${id}/update`,
            update,
        );
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
    ): Promise<models.ContainerWaitResponse> {
        return this.api.post<models.ContainerWaitResponse>(
            `/containers/${id}/wait`,
            undefined,
            options,
        );
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
        tar: NodeJS.ReadableStream,
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
        );
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
        container: models.NetworkConnectRequest,
    ): Promise<void> {
        return this.api.post(`/networks/${id}/connect`, container);
    }

    /**
     * Create a network
     * @param config Network configuration
     */
    public async networkCreate(
        config: models.NetworkCreateRequest,
    ): Promise<models.NetworkCreateResponse> {
        return this.api.post('/networks/create', undefined, config);
    }

    /**
     * Remove a network
     * @param id Network ID or name
     */
    public async networkDelete(id: string): Promise<void> {
        return this.api.delete(`/networks/${id}`);
    }

    /**
     * Disconnect a container from a network
     * @param id Network ID or name
     * @param container
     */
    public async networkDisconnect(
        id: string,
        container: models.NetworkDisconnectRequest,
    ): Promise<void> {
        return this.api.post(`/networks/${id}/disconnect`, container);
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
    ): Promise<models.NetworkInspect> {
        return this.api.get(`/networks/${id}`, options);
    }

    /**
     * Returns a list of networks. For details on the format, see the [network inspect endpoint](#operation/NetworkInspect).  Note that it uses a different, smaller representation of a network than inspecting a single network. For example, the list of containers attached to the network is not propagated in API versions 1.28 and up.
     * List networks
     * @param options
     * @param options.filters JSON encoded value of the filters (a 'map[string][]string') to process on the networks list.  Available filters:  - 'dangling'&lt;boolean&gt;' When set to 'true' (or '1'), returns all    networks that are not in use by a container. When set to 'false'    (or '0'), only networks that are in use by one or more    containers are returned. - 'driver'&lt;driver-name&gt;' Matches a network\&#39;s driver. - 'id'&lt;network-id&gt;' Matches all or part of a network ID. - 'label'&lt;key&gt;' or 'label'&lt;key&gt;'&lt;value&gt;' of a network label. - 'name'&lt;network-name&gt;' Matches all or part of a network name. - 'scope'[\&quot;swarm\&quot;|\&quot;global\&quot;|\&quot;local\&quot;]' Filters networks by scope ('swarm', 'global', or 'local'). - 'type'[\&quot;custom\&quot;|\&quot;builtin\&quot;]' Filters networks by type. The 'custom' keyword returns all user-defined networks.
     */
    public async networkList(options?: {
        filters?: Filter;
    }): Promise<Array<models.NetworkSummary>> {
        return this.api.get('/networks', options);
    }

    /**
     * Delete unused networks
     * @param filters Filters to process on the prune list, encoded as JSON (a 'map[string][]string').  Available filters: - 'until'&lt;timestamp&gt;' Prune networks created before this timestamp. The '&lt;timestamp&gt;' can be Unix timestamps, date formatted timestamps, or Go duration strings (e.g. '10m', '1h30m') computed relative to the daemon machine’s time. - 'label' ('label'&lt;key&gt;', 'label'&lt;key&gt;'&lt;value&gt;', 'label!'&lt;key&gt;', or 'label!'&lt;key&gt;'&lt;value&gt;') Prune networks with (or without, in case 'label!'...' is used) the specified labels.
     */
    public async networkPrune(
        filters?: Filter,
    ): Promise<models.NetworkPruneResponse> {
        return this.api.post('/networks/prune', filters);
    }

    // --- Volumes API

    /**
     * Create a volume
     * @param spec Volume configuration
     */
    public async volumeCreate(
        spec: models.VolumeCreateOptions,
    ): Promise<models.Volume> {
        return this.api.post('volumes/create', undefined, spec);
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
        return this.api.delete(`/volumes/${id}`, options);
    }

    /**
     * Inspect a volume
     * @param id Volume name or ID
     */
    public async volumeInspect(id: string): Promise<models.Volume> {
        return this.api.get(`/volumes/${id}`);
    }

    /**
     * List volumes
     * @param filters JSON encoded value of the filters (a 'map[string][]string') to process on the volumes list. Available filters:  - 'dangling'&lt;boolean&gt;' When set to 'true' (or '1'), returns all    volumes that are not in use by a container. When set to 'false'    (or '0'), only volumes that are in use by one or more    containers are returned. - 'driver'&lt;volume-driver-name&gt;' Matches volumes based on their driver. - 'label'&lt;key&gt;' or 'label'&lt;key&gt;:&lt;value&gt;' Matches volumes based on    the presence of a 'label' alone or a 'label' and a value. - 'name'&lt;volume-name&gt;' Matches all or part of a volume name.
     */
    public async volumeList(
        filters?: Filter,
    ): Promise<models.VolumeListResponse> {
        return this.api.get(`/volumes`, {
            filters: filters,
        });
    }

    /**
     * Delete unused volumes
     * @param filters Filters to process on the prune list, encoded as JSON (a 'map[string][]string').  Available filters: - 'label' ('label'&lt;key&gt;', 'label'&lt;key&gt;'&lt;value&gt;', 'label!'&lt;key&gt;', or 'label!'&lt;key&gt;'&lt;value&gt;') Prune volumes with (or without, in case 'label!'...' is used) the specified labels. - 'all' ('all'true') - Consider all (local) volumes for pruning and not just anonymous volumes.
     */
    public async volumePrune(
        filters?: Filter,
    ): Promise<models.VolumePruneResponse> {
        return this.api.post('/volumes/prune', {
            filters: filters,
        });
    }

    // --- Images API

    /**
     * Return image digest and platform information by contacting the registry.
     * Get image information from the registry
     * @param name Image name or id
     */
    public async distributionInspect(
        name: string,
    ): Promise<models.DistributionInspect> {
        return this.api.get(`/distribution/${name}/json`);
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
            credentials?: Credentials | IdentityToken;
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
            (data: string) => {
                data.split('\n').forEach((line) => {
                    if (line) {
                        callback(JSON.parse(line));
                    }
                });
            },
        );
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
    ): Promise<Array<models.ImageDeleteResponseItem>> {
        return this.api.delete(`/image/${name}`, options);
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
    ): Promise<Array<models.HistoryResponseItem>> {
        return this.api.get(`/image/${name}/history`, options);
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
    ): Promise<models.ImageInspect> {
        return this.api.get(`/images/${name}/json`, options);
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
    }): Promise<Array<models.ImageSummary>> {
        return this.api.get('/images/json', options);
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
        execConfig: models.ExecConfig,
    ): Promise<models.IDResponse> {
        return this.api.post(`/containers/${id}/exec`, undefined, execConfig);
    }

    /**
     * Return low-level information
     * Inspect an exec instance
     * @param id Exec instance ID
     */
    public async execInspect(id: string): Promise<models.ExecInspectResponse> {
        return this.api.get(`/exec/${id}/json`);
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
        });
    }

    /**
     * Starts a previously set up ex
     * Start an exec instance
     * @param id Exec instance ID
     * @param execStartConfig
     */
    public async execStart(
        id: string,
        execStartConfig?: models.ExecStartConfig,
    ): Promise<void> {
        return this.api.post(`/exec/${id}/start`, undefined, execStartConfig);
    }
}
