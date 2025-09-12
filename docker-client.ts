import * as net from 'net';
import * as models from './models';
import { TCPClient } from './tcp-client';

export class DockerClient {

    private api: TCPClient;

    constructor(socket: net.Socket) {
        this.api = new TCPClient(socket);
    }

    

    public async systemPing(options): Promise<string> {
        return this.api.get<string>('/_ping');
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
    
    public async systemEvents(callback: (event: models.EventMessage) => void) {        
        await this.api.sendHTTPRequest(`GET /events HTTP/1.1
Host: host
User-Agent: docker-ts/0.0.1
Accept: application/x-ndjson

`, -1, (chunk: string) => {
            callback(JSON.parse(chunk) as models.EventMessage);
        })
    }
}