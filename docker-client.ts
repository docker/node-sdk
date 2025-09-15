import * as net from 'net';
import * as models from './models';
import { HTTPClient } from './http';

export class DockerClient {

    private api: HTTPClient;

    constructor(socket: net.Socket) {
        this.api = new HTTPClient(socket);
    }

    

    public systemPing(): Promise<string> {
        return this.api.sendHTTPRequest('GET', '/_ping', { accept: 'text/plain' })
            .then(response => response.body as string);
    }

    public async systemVersion(): Promise<models.SystemVersion> {
        return this.api.get<models.SystemVersion>('/version');
    }

    public async systemInfo(): Promise<models.SystemInfo> {
        return this.api.get<models.SystemInfo>('/info');
    }

    public async systemDataUsage(): Promise<models.SystemDataUsageResponse> {
        return this.api.get<models.SystemDataUsageResponse>('/system/df');
    }

    public async systemAuth(authConfig: models.AuthConfig): Promise<models.SystemAuthResponse> {
        return this.api.post<models.SystemAuthResponse>('/auth', authConfig);    
    }    

    public async systemEvents(callback: (event: models.EventMessage) => void) {        
        await this.api.sendHTTPRequestRaw(`GET /events HTTP/1.1
Host: host
User-Agent: docker-ts/0.0.1
Accept: application/x-ndjson

`, -1, (chunk: string) => {
            callback(JSON.parse(chunk) as models.EventMessage);
        })
    }

    public async containerCreate(spec: models.ContainerCreateRequest, options?: { 
        name?: string, 
        platform?: string
      }): Promise<models.ContainerCreateResponse> {
        return this.api.post<models.ContainerCreateResponse>('/containers/create', spec, options);
    }

    public async containerDelete(id: string, options?: { 
        v?: boolean, 
        force?: boolean, 
        link?: boolean
      }): Promise<void> {
        return this.api.delete<void>(`/containers/${id}`, options);
    }

    public async containerInspect(id: string, options?: { 
            size?: boolean
      }): Promise<models.ContainerInspectResponse> {
        return this.api.get<models.ContainerInspectResponse>(`/containers/${id}/json`, options);
    }

    public async containerKill(id: string, options?: {          
        signal?: string
      }): Promise<void> {
        return this.api.post<void>(`/containers/${id}/kill`, options);
    }

    public async containerList(options?: { 
        all?: boolean, 
        limit?: number, 
        size?: boolean, 
        filters?: string
      }): Promise<Array<models.ContainerSummary>> {
        return this.api.get<Array<models.ContainerSummary>>('/containers/json', options);
    }

    public async containerPause(id: string): Promise<void> {
        return this.api.post<void>(`/containers/${id}/pause`);
    }

    public async containerPrune(options?: { 
        filters?: string
      }): Promise<models.ContainerPruneResponse> {
        return this.api.post<models.ContainerPruneResponse>('/containers/prune', options);
    }

    public async containerRename(id: string, name: string): Promise<void> {
        return this.api.post<void>(`/containers/${id}/rename?name=${name}`);
    }

    public async containerResize(id: string, h: number, w: number): Promise<void> {
        return this.api.post<void>(`/containers/${id}/resize?h=${h}&w=${w}`);
    }

    public async containerRestart(id: string, options?: {         
        signal?: string, 
        timeout?: number
      }): Promise<void> {
        return this.api.post<void>(`/containers/${id}/restart`, undefined, {
            signal: options?.signal,
            t: options?.timeout,
        });
    }

    public async containerStart(id: string, options?: {         
        detachKeys?: string
      }): Promise<void> {
        return this.api.post<void>(`/containers/${id}/start`, undefined, options);
    }

    public async containerStats(id: string, options?: {             
            stream?: boolean, 
            oneShot?: boolean
      }): Promise<models.ContainerStatsResponse> {
        return this.api.get<models.ContainerStatsResponse>(`/containers/${id}/stats`, {
            stream: false, // FIXME implement streaming mode
            oneShot: options?.oneShot
        });
    }

    public async containerStop(id: string, options?: {         
        signal?: string, 
        timeout?: number
      }): Promise<void> {
        return this.api.post<void>(`/containers/${id}/start`, undefined,  {
            signal: options?.signal,
            t: options?.timeout,
        });
    }

    public async containerTop(id: string, options?: { 
        psArgs?: string
      }): Promise<models.ContainerTopResponse> {
        return this.api.get<models.ContainerTopResponse>(`/containers/${id}/top`, {
            ps_args: options?.psArgs
        });
    }

    public async containerUnpause(id: string): Promise<void> {
        return this.api.post<void>(`/containers/${id}/unpause`);
    }    

    public async containerUpdate(id: string, update: models.ContainerUpdateRequest): Promise<models.ContainerUpdateResponse> {
        return this.api.post<models.ContainerUpdateResponse>(`/containers/${id}/update`, update);
    }

    public async containerWait(id: string, options?: {             
        condition?: 'not-running' | 'next-exit' | 'removed'
      }): Promise<models.ContainerWaitResponse> {
        return this.api.post<models.ContainerWaitResponse>(`/containers/${id}/wait`, undefined, options, -1);
    }
}