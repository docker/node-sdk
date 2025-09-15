import * as net from 'net';
import * as models from './models';
import { HTTPClient } from './http';
import { Filter } from './filter';

export class DockerClient {

    private api: HTTPClient;

    constructor(socket: net.Socket) {
        this.api = new HTTPClient(socket);
    }

    // --- System API

    /**
     * Validate credentials for a registry and, if available, get an identity token for accessing the registry without password. 
     * Check auth configuration
     * @param authConfig Authentication to check
     */
    public async systemAuth(authConfig: models.AuthConfig): Promise<models.SystemAuthResponse> {
        return this.api.post<models.SystemAuthResponse>('/auth', authConfig);    
    }    

    /**
     * Get data usage information
     * @param type Object types, for which to compute and return data. 
     */
    public async systemDataUsage(type?: Array<'container' | 'image' | 'volume' | 'build-cache'>): Promise<models.SystemDataUsageResponse> {
        return this.api.get<models.SystemDataUsageResponse>('/system/df', {
            type: type
        });
    }

    /**
     * Stream real-time events from the server.  Various objects within Docker report events when something happens to them.  Containers report these events: `attach`, `commit`, `copy`, `create`, `destroy`, `detach`, `die`, `exec_create`, `exec_detach`, `exec_start`, `exec_die`, `export`, `health_status`, `kill`, `oom`, `pause`, `rename`, `resize`, `restart`, `start`, `stop`, `top`, `unpause`, `update`, and `prune`  Images report these events: `create`, `delete`, `import`, `load`, `pull`, `push`, `save`, `tag`, `untag`, and `prune`  Volumes report these events: `create`, `mount`, `unmount`, `destroy`, and `prune`  Networks report these events: `create`, `connect`, `disconnect`, `destroy`, `update`, `remove`, and `prune`  The Docker daemon reports these events: `reload`  Services report these events: `create`, `update`, and `remove`  Nodes report these events: `create`, `update`, and `remove`  Secrets report these events: `create`, `update`, and `remove`  Configs report these events: `create`, `update`, and `remove`  The Builder reports `prune` events 
     * Monitor events
     * @param since Show events created since this timestamp then stream new events.
     * @param until Show events created until this timestamp then stop streaming.
     * @param filters A JSON encoded value of filters (a &#x60;map[string][]string&#x60;) to process on the event list. Available filters:  - &#x60;config&#x3D;&lt;string&gt;&#x60; config name or ID - &#x60;container&#x3D;&lt;string&gt;&#x60; container name or ID - &#x60;daemon&#x3D;&lt;string&gt;&#x60; daemon name or ID - &#x60;event&#x3D;&lt;string&gt;&#x60; event type - &#x60;image&#x3D;&lt;string&gt;&#x60; image name or ID - &#x60;label&#x3D;&lt;string&gt;&#x60; image or container label - &#x60;network&#x3D;&lt;string&gt;&#x60; network name or ID - &#x60;node&#x3D;&lt;string&gt;&#x60; node ID - &#x60;plugin&#x60;&#x3D;&lt;string&gt; plugin name or ID - &#x60;scope&#x60;&#x3D;&lt;string&gt; local or swarm - &#x60;secret&#x3D;&lt;string&gt;&#x60; secret name or ID - &#x60;service&#x3D;&lt;string&gt;&#x60; service name or ID - &#x60;type&#x3D;&lt;string&gt;&#x60; object to filter by, one of &#x60;container&#x60;, &#x60;image&#x60;, &#x60;volume&#x60;, &#x60;network&#x60;, &#x60;daemon&#x60;, &#x60;plugin&#x60;, &#x60;node&#x60;, &#x60;service&#x60;, &#x60;secret&#x60; or &#x60;config&#x60; - &#x60;volume&#x3D;&lt;string&gt;&#x60; volume name 
     */
    public async systemEvents(callback: (event: models.EventMessage) => void) {        
        await this.api.sendHTTPRequestRaw(`GET /events HTTP/1.1
Host: host
User-Agent: docker-ts/0.0.1
Accept: application/x-ndjson

`, -1, (chunk: string) => {
            callback(JSON.parse(chunk) as models.EventMessage);
        })
    }

    /**
     * This is a dummy endpoint you can use to test if the server is accessible.
     * Ping
     */
    public systemPing(): Promise<string> {
        return this.api.sendHTTPRequest('HEAD', '/_ping', { accept: 'text/plain' })
            .then(response => response.headers['api-version'] as string);
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
     * Returns which files in a container\'s filesystem have been added, deleted, or modified. The `Kind` of modification can be one of:  - `0`: Modified (\"C\") - `1`: Added (\"A\") - `2`: Deleted (\"D\") 
     * Get changes on a container’s filesystem
     * @param id ID or name of the container
     */
    public async containerChanges(id: string): Promise<Array<models.FilesystemChange>> {
        return this.api.get<Array<models.FilesystemChange>>(`/containers/${id}/cha,ges`);
    }

    /**
     * Create a container
     * @param spec Container to create
     * @param name Assign the specified name to the container. Must match &#x60;/?[a-zA-Z0-9][a-zA-Z0-9_.-]+&#x60;. 
     * @param platform Platform in the format &#x60;os[/arch[/variant]]&#x60; used for image lookup.  When specified, the daemon checks if the requested image is present in the local image cache with the given OS and Architecture, and otherwise returns a &#x60;404&#x60; status.  If the option is not set, the host\&#39;s native OS and Architecture are used to look up the image in the image cache. However, if no platform is passed and the given image does exist in the local image cache, but its OS or architecture does not match, the container is created with the available image, and a warning is added to the &#x60;Warnings&#x60; field in the response, for example;      WARNING: The requested image\&#39;s platform (linux/arm64/v8) does not              match the detected host platform (linux/amd64) and no              specific platform was requested 
     */
    public async containerCreate(spec: models.ContainerCreateRequest, options?: { 
        name?: string, 
        platform?: string
      }): Promise<models.ContainerCreateResponse> {
        return this.api.post<models.ContainerCreateResponse>('/containers/create', spec, options);
    }

    /**
     * Remove a container
     * @param id ID or name of the container
     * @param volumes Remove anonymous volumes associated with the container.
     * @param force If the container is running, kill it before removing it.
     * @param link Remove the specified link associated with the container.
     */
    public async containerDelete(id: string, options?: { 
        volumes?: boolean, 
        force?: boolean, 
        link?: boolean
      }): Promise<void> {
        return this.api.delete<void>(`/containers/${id}`, {
            v: options?.volumes,
            force: options?.force,
            link: options?.link
        });
    }

    /**
     * Export the contents of a container as a tarball.
     * Export a container
     * @param id ID or name of the container
     */
    public async containerExport(options?: { 
        id: string
      }): Promise<void> {
        // TODO
    }

    /**
     * Return low-level information about a container.
     * Inspect a container
     * @param id ID or name of the container
     * @param size Return the size of container as fields &#x60;SizeRw&#x60; and &#x60;SizeRootFs&#x60;
     */
    public async containerInspect(id: string, options?: { 
            size?: boolean
      }): Promise<models.ContainerInspectResponse> {
        return this.api.get<models.ContainerInspectResponse>(`/containers/${id}/json`, options);
    }

    /**
     * Send a POSIX signal to a container, defaulting to killing to the container. 
     * Kill a container
     * @param id ID or name of the container
     * @param signal Signal to send to the container as an integer or string (e.g. &#x60;SIGINT&#x60;). 
     */    
    public async containerKill(id: string, options?: {          
        signal?: string
      }): Promise<void> {
        return this.api.post<void>(`/containers/${id}/kill`, options);
    }

    /**
     * Returns a list of containers. For details on the format, see the [inspect endpoint](#operation/ContainerInspect).  Note that it uses a different, smaller representation of a container than inspecting a single container. For example, the list of linked containers is not propagated . 
     * List containers
     * @param all Return all containers. By default, only running containers are shown. 
     * @param limit Return this number of most recently created containers, including non-running ones. 
     * @param size Return the size of container as fields &#x60;SizeRw&#x60; and &#x60;SizeRootFs&#x60;. 
     * @param filters Filters to process on the container list, encoded as JSON (a &#x60;map[string][]string&#x60;). For example, &#x60;{\&quot;status\&quot;: [\&quot;paused\&quot;]}&#x60; will only return paused containers.  Available filters:  - &#x60;ancestor&#x60;&#x3D;(&#x60;&lt;image-name&gt;[:&lt;tag&gt;]&#x60;, &#x60;&lt;image id&gt;&#x60;, or &#x60;&lt;image@digest&gt;&#x60;) - &#x60;before&#x60;&#x3D;(&#x60;&lt;container id&gt;&#x60; or &#x60;&lt;container name&gt;&#x60;) - &#x60;expose&#x60;&#x3D;(&#x60;&lt;port&gt;[/&lt;proto&gt;]&#x60;|&#x60;&lt;startport-endport&gt;/[&lt;proto&gt;]&#x60;) - &#x60;exited&#x3D;&lt;int&gt;&#x60; containers with exit code of &#x60;&lt;int&gt;&#x60; - &#x60;health&#x60;&#x3D;(&#x60;starting&#x60;|&#x60;healthy&#x60;|&#x60;unhealthy&#x60;|&#x60;none&#x60;) - &#x60;id&#x3D;&lt;ID&gt;&#x60; a container\&#39;s ID - &#x60;isolation&#x3D;&#x60;(&#x60;default&#x60;|&#x60;process&#x60;|&#x60;hyperv&#x60;) (Windows daemon only) - &#x60;is-task&#x3D;&#x60;(&#x60;true&#x60;|&#x60;false&#x60;) - &#x60;label&#x3D;key&#x60; or &#x60;label&#x3D;\&quot;key&#x3D;value\&quot;&#x60; of a container label - &#x60;name&#x3D;&lt;name&gt;&#x60; a container\&#39;s name - &#x60;network&#x60;&#x3D;(&#x60;&lt;network id&gt;&#x60; or &#x60;&lt;network name&gt;&#x60;) - &#x60;publish&#x60;&#x3D;(&#x60;&lt;port&gt;[/&lt;proto&gt;]&#x60;|&#x60;&lt;startport-endport&gt;/[&lt;proto&gt;]&#x60;) - &#x60;since&#x60;&#x3D;(&#x60;&lt;container id&gt;&#x60; or &#x60;&lt;container name&gt;&#x60;) - &#x60;status&#x3D;&#x60;(&#x60;created&#x60;|&#x60;restarting&#x60;|&#x60;running&#x60;|&#x60;removing&#x60;|&#x60;paused&#x60;|&#x60;exited&#x60;|&#x60;dead&#x60;) - &#x60;volume&#x60;&#x3D;(&#x60;&lt;volume name&gt;&#x60; or &#x60;&lt;mount point destination&gt;&#x60;) 
     */
    public async containerList(options?: { 
        all?: boolean, 
        limit?: number, 
        size?: boolean, 
        filters?: string
      }): Promise<Array<models.ContainerSummary>> {
        return this.api.get<Array<models.ContainerSummary>>('/containers/json', options);
    }

    /**
     * Get `stdout` and `stderr` logs from a container.  Note: This endpoint works only for containers with the `json-file` or `journald` logging driver. 
     * Get container logs
     * @param id ID or name of the container
     * @param follow Keep connection after returning logs.
     * @param stdout Return logs from &#x60;stdout&#x60;
     * @param stderr Return logs from &#x60;stderr&#x60;
     * @param since Only return logs since this time, as a UNIX timestamp
     * @param until Only return logs before this time, as a UNIX timestamp
     * @param timestamps Add timestamps to every log line
     * @param tail Only return this number of log lines from the end of the logs. Specify as an integer or &#x60;all&#x60; to output all log lines. 
     */
     public async containerLogs(options?: { 
        id: string, 
        follow?: boolean, 
        stdout?: boolean, 
        stderr?: boolean, 
        since?: number, 
        until?: number, 
        timestamps?: boolean, 
        tail?: string
      }): Promise<void> {
        // TODO
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
     * @param filters Filters to process on the prune list, encoded as JSON (a &#x60;map[string][]string&#x60;).  Available filters: - &#x60;until&#x3D;&lt;timestamp&gt;&#x60; Prune containers created before this timestamp. The &#x60;&lt;timestamp&gt;&#x60; can be Unix timestamps, date formatted timestamps, or Go duration strings (e.g. &#x60;10m&#x60;, &#x60;1h30m&#x60;) computed relative to the daemon machine’s time. - &#x60;label&#x60; (&#x60;label&#x3D;&lt;key&gt;&#x60;, &#x60;label&#x3D;&lt;key&gt;&#x3D;&lt;value&gt;&#x60;, &#x60;label!&#x3D;&lt;key&gt;&#x60;, or &#x60;label!&#x3D;&lt;key&gt;&#x3D;&lt;value&gt;&#x60;) Prune containers with (or without, in case &#x60;label!&#x3D;...&#x60; is used) the specified labels. 
     */
    public async containerPrune(options?: { 
        filters?: string
      }): Promise<models.ContainerPruneResponse> {
        return this.api.post<models.ContainerPruneResponse>('/containers/prune', options);
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
     * @param h Height of the TTY session in characters
     * @param w Width of the TTY session in characters
     */
    public async containerResize(id: string, h: number, w: number): Promise<void> {
        return this.api.post<void>(`/containers/${id}/resize?h=${h}&w=${w}`);
    }

    /**
     * Restart a container
     * @param id ID or name of the container
     * @param signal Signal to send to the container as an integer or string (e.g. &#x60;SIGINT&#x60;). 
     * @param t Number of seconds to wait before killing the container
     */    
    public async containerRestart(id: string, options?: {         
        signal?: string, 
        timeout?: number
      }): Promise<void> {
        return this.api.post<void>(`/containers/${id}/restart`, undefined, {
            signal: options?.signal,
            t: options?.timeout,
        });
    }

    /**
     * Start a container
     * @param id ID or name of the container
     * @param detachKeys Override the key sequence for detaching a container. Format is a single character &#x60;[a-Z]&#x60; or &#x60;ctrl-&lt;value&gt;&#x60; where &#x60;&lt;value&gt;&#x60; is one of: &#x60;a-z&#x60;, &#x60;@&#x60;, &#x60;^&#x60;, &#x60;[&#x60;, &#x60;,&#x60; or &#x60;_&#x60;. 
     */    
    public async containerStart(id: string, options?: {         
        detachKeys?: string
      }): Promise<void> {
        return this.api.post<void>(`/containers/${id}/start`, undefined, options);
    }

    /**
     * This endpoint returns a live stream of a container’s resource usage statistics.  The `precpu_stats` is the CPU statistic of the *previous* read, and is used to calculate the CPU usage percentage. It is not an exact copy of the `cpu_stats` field.  If either `precpu_stats.online_cpus` or `cpu_stats.online_cpus` is nil then for compatibility with older daemons the length of the corresponding `cpu_usage.percpu_usage` array should be used.  On a cgroup v2 host, the following fields are not set * `blkio_stats`: all fields other than `io_service_bytes_recursive` * `cpu_stats`: `cpu_usage.percpu_usage` * `memory_stats`: `max_usage` and `failcnt` Also, `memory_stats.stats` fields are incompatible with cgroup v1.  To calculate the values shown by the `stats` command of the docker cli tool the following formulas can be used: * used_memory = `memory_stats.usage - memory_stats.stats.cache` * available_memory = `memory_stats.limit` * Memory usage % = `(used_memory / available_memory) * 100.0` * cpu_delta = `cpu_stats.cpu_usage.total_usage - precpu_stats.cpu_usage.total_usage` * system_cpu_delta = `cpu_stats.system_cpu_usage - precpu_stats.system_cpu_usage` * number_cpus = `length(cpu_stats.cpu_usage.percpu_usage)` or `cpu_stats.online_cpus` * CPU usage % = `(cpu_delta / system_cpu_delta) * number_cpus * 100.0` 
     * Get container stats based on resource usage
     * @param id ID or name of the container
     * @param stream Stream the output. If false, the stats will be output once and then it will disconnect. 
     * @param oneShot Only get a single stat instead of waiting for 2 cycles. Must be used with &#x60;stream&#x3D;false&#x60;. 
     */
    public async containerStats(id: string, options?: {             
            stream?: boolean, 
            oneShot?: boolean
      }): Promise<models.ContainerStatsResponse> {
        return this.api.get<models.ContainerStatsResponse>(`/containers/${id}/stats`, {
            stream: false, // FIXME implement streaming mode
            oneShot: options?.oneShot
        });
    }

    /**
     * Stop a container
     * @param id ID or name of the container
     * @param signal Signal to send to the container as an integer or string (e.g. &#x60;SIGINT&#x60;). 
     * @param t Number of seconds to wait before killing the container
     */
    public async containerStop(id: string, options?: {         
        signal?: string, 
        timeout?: number
      }): Promise<void> {
        return this.api.post<void>(`/containers/${id}/start`, undefined,  {
            signal: options?.signal,
            t: options?.timeout,
        });
    }

    /**
     * On Unix systems, this is done by running the `ps` command. This endpoint is not supported on Windows. 
     * List processes running inside a container
     * @param id ID or name of the container
     * @param psArgs The arguments to pass to &#x60;ps&#x60;. For example, &#x60;aux&#x60;
     */    
    public async containerTop(id: string, options?: { 
        psArgs?: string
      }): Promise<models.ContainerTopResponse> {
        return this.api.get<models.ContainerTopResponse>(`/containers/${id}/top`, {
            ps_args: options?.psArgs
        });
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
    public async containerUpdate(id: string, update: models.ContainerUpdateRequest): Promise<models.ContainerUpdateResponse> {
        return this.api.post<models.ContainerUpdateResponse>(`/containers/${id}/update`, update);
    }

    /**
     * Block until a container stops, then returns the exit code.
     * Wait for a container
     * @param id ID or name of the container
     * @param condition Wait until a container state reaches the given condition.  Defaults to &#x60;not-running&#x60; if omitted or empty. 
     */
    public async containerWait(id: string, options?: {             
        condition?: 'not-running' | 'next-exit' | 'removed'
      }): Promise<models.ContainerWaitResponse> {
        return this.api.post<models.ContainerWaitResponse>(`/containers/${id}/wait`, undefined, options, -1);
    }

        /**
     * Upload a tar archive to be extracted to a path in the filesystem of container id. `path` parameter is asserted to be a directory. If it exists as a file, 400 error will be returned with message \"not a directory\". 
     * Extract an archive of files or folders to a directory in a container
     * @param id ID or name of the container
     * @param path Path to a directory in the container to extract the archive’s contents into. 
     * @param inputStream The input stream must be a tar archive compressed with one of the following algorithms: &#x60;identity&#x60; (no compression), &#x60;gzip&#x60;, &#x60;bzip2&#x60;, or &#x60;xz&#x60;. 
     * @param noOverwriteDirNonDir If &#x60;1&#x60;, &#x60;true&#x60;, or &#x60;True&#x60; then it will be an error if unpacking the given content would cause an existing directory to be replaced with a non-directory and vice versa. 
     * @param copyUIDGID If &#x60;1&#x60;, &#x60;true&#x60;, then it will copy UID/GID maps to the dest file or dir 
     */
     public async putContainerArchive(options?: { 
        id: string, 
        path: string, 
        inputStream: Blob, 
        noOverwriteDirNonDir?: string, 
        copyUIDGID?: string
      }): Promise<void> {
        // TODO
    }

    // --- Network API

    /**
     * The network must be either a local-scoped network or a swarm-scoped network with the `attachable` option set. A network cannot be re-attached to a running container
     * Connect a container to a network
     * @param id Network ID or name
     * @param container 
     */
    public async networkConnect(id: string, container: models.NetworkConnectRequest): Promise<void> {
        return this.api.post(`/networks/${id}/connect`, container);
    }

    /**
     * Create a network
     * @param networkConfig Network configuration
     */
    public async networkCreate(config: models.NetworkCreateRequest): Promise<models.NetworkCreateResponse> {
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
    public async networkDisconnect(id: string, container: models.NetworkDisconnectRequest): Promise<void> {
        return this.api.post(`/networks/${id}/disconnect`, container);
    }

    /**
     * Inspect a network
     * @param id Network ID or name
     * @param verbose Detailed inspect output for troubleshooting
     * @param scope Filter the network by scope (swarm, global, or local)
     */
    public async networkInspect(id: string, options?: { 
        verbose?: boolean, 
        scope?: string
    }): Promise<models.NetworkInspect> {
        return this.api.get(`/networks/${id}`, options);
    }

    /**
     * Returns a list of networks. For details on the format, see the [network inspect endpoint](#operation/NetworkInspect).  Note that it uses a different, smaller representation of a network than inspecting a single network. For example, the list of containers attached to the network is not propagated in API versions 1.28 and up. 
     * List networks
     * @param filters JSON encoded value of the filters (a &#x60;map[string][]string&#x60;) to process on the networks list.  Available filters:  - &#x60;dangling&#x3D;&lt;boolean&gt;&#x60; When set to &#x60;true&#x60; (or &#x60;1&#x60;), returns all    networks that are not in use by a container. When set to &#x60;false&#x60;    (or &#x60;0&#x60;), only networks that are in use by one or more    containers are returned. - &#x60;driver&#x3D;&lt;driver-name&gt;&#x60; Matches a network\&#39;s driver. - &#x60;id&#x3D;&lt;network-id&gt;&#x60; Matches all or part of a network ID. - &#x60;label&#x3D;&lt;key&gt;&#x60; or &#x60;label&#x3D;&lt;key&gt;&#x3D;&lt;value&gt;&#x60; of a network label. - &#x60;name&#x3D;&lt;network-name&gt;&#x60; Matches all or part of a network name. - &#x60;scope&#x3D;[\&quot;swarm\&quot;|\&quot;global\&quot;|\&quot;local\&quot;]&#x60; Filters networks by scope (&#x60;swarm&#x60;, &#x60;global&#x60;, or &#x60;local&#x60;). - &#x60;type&#x3D;[\&quot;custom\&quot;|\&quot;builtin\&quot;]&#x60; Filters networks by type. The &#x60;custom&#x60; keyword returns all user-defined networks. 
     */
    public async networkList(filters?: Filter): Promise<Array<models.NetworkSummary>> {
        return this.api.get('/networks', filters);
    }

    /**
     * Delete unused networks
     * @param filters Filters to process on the prune list, encoded as JSON (a &#x60;map[string][]string&#x60;).  Available filters: - &#x60;until&#x3D;&lt;timestamp&gt;&#x60; Prune networks created before this timestamp. The &#x60;&lt;timestamp&gt;&#x60; can be Unix timestamps, date formatted timestamps, or Go duration strings (e.g. &#x60;10m&#x60;, &#x60;1h30m&#x60;) computed relative to the daemon machine’s time. - &#x60;label&#x60; (&#x60;label&#x3D;&lt;key&gt;&#x60;, &#x60;label&#x3D;&lt;key&gt;&#x3D;&lt;value&gt;&#x60;, &#x60;label!&#x3D;&lt;key&gt;&#x60;, or &#x60;label!&#x3D;&lt;key&gt;&#x3D;&lt;value&gt;&#x60;) Prune networks with (or without, in case &#x60;label!&#x3D;...&#x60; is used) the specified labels. 
     */
    public async networkPrune(filters?: Filter): Promise<models.NetworkPruneResponse> {
        return this.api.post('/networks/prune', filters);
    }

    // --- Volumes API

    /**
     * Create a volume
     * @param volumeConfig Volume configuration
     */
    public async volumeCreate(spec: models.VolumeCreateOptions): Promise<models.Volume> {
        return this.api.post('volumes/create', undefined, spec);
    }

    /**
     * Instruct the driver to remove the volume.
     * Remove a volume
     * @param id Volume name or ID
     * @param force Force the removal of the volume
     */
    public async volumeDelete(id: string, options?: { 
        force?: boolean
      }): Promise<void> {
        return this.api.delete(`/volumes/${id}`, options)
    }

    /**
     * Inspect a volume
     * @param name Volume name or ID
     */
    public async volumeInspect(id: string): Promise<models.Volume> {
        return this.api.get(`/volumes/${id}`);
    }

    /**
     * List volumes
     * @param filters JSON encoded value of the filters (a &#x60;map[string][]string&#x60;) to process on the volumes list. Available filters:  - &#x60;dangling&#x3D;&lt;boolean&gt;&#x60; When set to &#x60;true&#x60; (or &#x60;1&#x60;), returns all    volumes that are not in use by a container. When set to &#x60;false&#x60;    (or &#x60;0&#x60;), only volumes that are in use by one or more    containers are returned. - &#x60;driver&#x3D;&lt;volume-driver-name&gt;&#x60; Matches volumes based on their driver. - &#x60;label&#x3D;&lt;key&gt;&#x60; or &#x60;label&#x3D;&lt;key&gt;:&lt;value&gt;&#x60; Matches volumes based on    the presence of a &#x60;label&#x60; alone or a &#x60;label&#x60; and a value. - &#x60;name&#x3D;&lt;volume-name&gt;&#x60; Matches all or part of a volume name. 
     */
    public async volumeList(filters?: Filter): Promise<models.VolumeListResponse> {
        return this.api.get(`/volumes`, {
            filters: filters
        })
    }

    /**
     * Delete unused volumes
     * @param filters Filters to process on the prune list, encoded as JSON (a &#x60;map[string][]string&#x60;).  Available filters: - &#x60;label&#x60; (&#x60;label&#x3D;&lt;key&gt;&#x60;, &#x60;label&#x3D;&lt;key&gt;&#x3D;&lt;value&gt;&#x60;, &#x60;label!&#x3D;&lt;key&gt;&#x60;, or &#x60;label!&#x3D;&lt;key&gt;&#x3D;&lt;value&gt;&#x60;) Prune volumes with (or without, in case &#x60;label!&#x3D;...&#x60; is used) the specified labels. - &#x60;all&#x60; (&#x60;all&#x3D;true&#x60;) - Consider all (local) volumes for pruning and not just anonymous volumes. 
     */
    public async volumePrune(filters?: Filter): Promise<models.VolumePruneResponse> {
        return this.api.post('/volumes/prune', {
            filters: filters
        })
    }

    // --- Images API

    /**
     * Return image digest and platform information by contacting the registry. 
     * Get image information from the registry
     * @param name Image name or id
     */
    public async distributionInspect(name: string): Promise<models.DistributionInspect> {
        return this.api.get(`/distribution/${name}/json`);
    }

    /**
     * Pull or import an image.
     * Create an image
     * @param fromImage Name of the image to pull. If the name includes a tag or digest, specific behavior applies:  - If only &#x60;fromImage&#x60; includes a tag, that tag is used. - If both &#x60;fromImage&#x60; and &#x60;tag&#x60; are provided, &#x60;tag&#x60; takes precedence. - If &#x60;fromImage&#x60; includes a digest, the image is pulled by digest, and &#x60;tag&#x60; is ignored. - If neither a tag nor digest is specified, all tags are pulled. 
     * @param fromSrc Source to import. The value may be a URL from which the image can be retrieved or &#x60;-&#x60; to read the image from the request body. This parameter may only be used when importing an image.
     * @param repo Repository name given to an image when it is imported. The repo may include a tag. This parameter may only be used when importing an image.
     * @param tag Tag or digest. If empty when pulling an image, this causes all tags for the given image to be pulled.
     * @param message Set commit message for imported image.
     * @param xRegistryAuth A base64url-encoded auth configuration.  Refer to the [authentication section](#section/Authentication) for details. 
     * @param changes Apply &#x60;Dockerfile&#x60; instructions to the image that is created, for example: &#x60;changes&#x3D;ENV DEBUG&#x3D;true&#x60;. Note that &#x60;ENV DEBUG&#x3D;true&#x60; should be URI component encoded.  Supported &#x60;Dockerfile&#x60; instructions: &#x60;CMD&#x60;|&#x60;ENTRYPOINT&#x60;|&#x60;ENV&#x60;|&#x60;EXPOSE&#x60;|&#x60;ONBUILD&#x60;|&#x60;USER&#x60;|&#x60;VOLUME&#x60;|&#x60;WORKDIR&#x60; 
     * @param platform Platform in the format os[/arch[/variant]].  When used in combination with the &#x60;fromImage&#x60; option, the daemon checks if the given image is present in the local image cache with the given OS and Architecture, and otherwise attempts to pull the image. If the option is not set, the host\&#39;s native OS and Architecture are used. If the given image does not exist in the local image cache, the daemon attempts to pull the image with the host\&#39;s native OS and Architecture. If the given image does exists in the local image cache, but its OS or architecture does not match, a warning is produced.  When used with the &#x60;fromSrc&#x60; option to import an image from an archive, this option sets the platform information for the imported image. If the option is not set, the host\&#39;s native OS and Architecture are used for the imported image. 
     * @param inputImage Image content if the value &#x60;-&#x60; has been specified in fromSrc query parameter
     */
     public async imageCreate(options?: { 
        fromImage?: string, 
        fromSrc?: string, 
        repo?: string, 
        tag?: string, 
        message?: string, 
        xRegistryAuth?: string, 
        changes?: Array<string>, 
        platform?: string, 
        inputImage?: string
      }): Promise<void> {
        // TODO xRegistryAuth?: string, 
        return this.api.post('/images/create', {
            fromImage: options?.fromImage, 
            fromSrc: options?.fromSrc, 
            repo: options?.repo, 
            tag: options?.tag, 
            message: options?.message, 
            changes: options?.changes, 
            platform: options?.platform, 
            inputImage: options?.inputImage
        });
      }

    /**
     * Remove an image, along with any untagged parent images that were referenced by that image.  Images can\'t be removed if they have descendant images, are being used by a running container or are being used by a build. 
     * Remove an image
     * @param name Image name or ID
     * @param force Remove the image even if it is being used by stopped containers or has other tags
     * @param noprune Do not delete untagged parent images
     * @param platforms Select platform-specific content to delete. Multiple values are accepted. Each platform is a OCI platform encoded as a JSON string. 
     */
    public async imageDelete(name: string, options?: { 
        force?: boolean, 
        noprune?: boolean, 
        platforms?: Array<string>
    }): Promise<Array<models.ImageDeleteResponseItem>> {
        return this.api.delete(`/image/${name}`, options)
    }

    /**
     * Return parent layers of an image.
     * Get the history of an image
     * @param name Image name or ID
     * @param platform JSON-encoded OCI platform to select the platform-variant. If omitted, it defaults to any locally available platform, prioritizing the daemon\&#39;s host platform.  If the daemon provides a multi-platform image store, this selects the platform-variant to show the history for. If the image is a single-platform image, or if the multi-platform image does not provide a variant matching the given platform, an error is returned.  Example: &#x60;{\&quot;os\&quot;: \&quot;linux\&quot;, \&quot;architecture\&quot;: \&quot;arm\&quot;, \&quot;variant\&quot;: \&quot;v5\&quot;}&#x60; 
     */
    public async imageHistory(name: string, options?: {         
        platform?: string
    }): Promise<Array<models.HistoryResponseItem>> {
            return this.api.get(`/image/${name}/history`, options);
    }

    /**
     * Return low-level information about an image.
     * Inspect an image
     * @param name Image name or id
     * @param manifests Include Manifests in the image summary.
     */
    public async imageInspect(name: string, options?: { 
        manifests?: boolean
    }): Promise<models.ImageInspect> {
        return this.api.get(`/images/${name}/json`, options);
    }

    /**
     * Returns a list of images on the server. Note that it uses a different, smaller representation of an image than inspecting a single image.
     * List Images
     * @param all Show all images. Only images from a final layer (no children) are shown by default.
     * @param filters A JSON encoded value of the filters (a &#x60;map[string][]string&#x60;) to process on the images list.  Available filters:  - &#x60;before&#x60;&#x3D;(&#x60;&lt;image-name&gt;[:&lt;tag&gt;]&#x60;,  &#x60;&lt;image id&gt;&#x60; or &#x60;&lt;image@digest&gt;&#x60;) - &#x60;dangling&#x3D;true&#x60; - &#x60;label&#x3D;key&#x60; or &#x60;label&#x3D;\&quot;key&#x3D;value\&quot;&#x60; of an image label - &#x60;reference&#x60;&#x3D;(&#x60;&lt;image-name&gt;[:&lt;tag&gt;]&#x60;) - &#x60;since&#x60;&#x3D;(&#x60;&lt;image-name&gt;[:&lt;tag&gt;]&#x60;,  &#x60;&lt;image id&gt;&#x60; or &#x60;&lt;image@digest&gt;&#x60;) - &#x60;until&#x3D;&lt;timestamp&gt;&#x60; 
     * @param sharedSize Compute and show shared size as a &#x60;SharedSize&#x60; field on each image.
     * @param digests Show digest information as a &#x60;RepoDigests&#x60; field on each image.
     * @param manifests Include &#x60;Manifests&#x60; in the image summary.
     */
    public async imageList(options?: { 
        all?: boolean, 
        filters?: Filter, 
        sharedSize?: boolean, 
        digests?: boolean, 
        manifests?: boolean
    }): Promise<Array<models.ImageSummary>> {
        return this.api.get('/images/json', options);
    }
}