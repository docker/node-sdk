import * as net from 'net';
import * as models from './models';

// Interface pour représenter une réponse HTTP
interface HTTPResponse {
    statusLine: string;
    statusCode: number;
    headers: { [key: string]: string };
    body?: string;
}

// Classe pour parser les réponses HTTP
class HTTPParser {
    public static parseResponse(rawResponse: string): HTTPResponse {
        const lines = rawResponse.split('\r\n');
        const statusLine = lines[0];
        const statusCode = parseInt(statusLine.split(' ')[1]) || 0;
        
        let headerEndIndex = -1;
        const headers: { [key: string]: string } = {};
        
        // Trouver la fin des headers
        for (let i = 1; i < lines.length; i++) {
            if (lines[i] === '') {
                headerEndIndex = i;
                break;
            }
            
            const colonIndex = lines[i].indexOf(':');
            if (colonIndex > 0) {
                const headerName = lines[i].substring(0, colonIndex).trim().toLowerCase();
                const headerValue = lines[i].substring(colonIndex + 1).trim();
                headers[headerName] = headerValue;
            }
        }
        
        const bodyLines = lines.slice(headerEndIndex + 1);
        const body = bodyLines.join('\r\n');
        
        return {
            statusLine,
            statusCode,
            headers,
            body
        };
    }
    
    public static parseChunkedBody(chunkedData: string): string {
        const lines = chunkedData.split('\r\n');
        let result = '';
        let i = 0;
        
        while (i < lines.length) {
            // Lire la taille du chunk (en hexadécimal)
            const chunkSizeLine = lines[i].trim();
            if (!chunkSizeLine) {
                i++;
                continue;
            }
            
            const chunkSize = parseInt(chunkSizeLine, 16);
            
            // Si la taille est 0, c'est la fin
            if (chunkSize === 0) {
                break;
            }
            
            i++; // Passer à la ligne suivante (données du chunk)
            
            // Collecter les données du chunk
            let chunkData = '';
            let remainingSize = chunkSize;
            
            while (remainingSize > 0 && i < lines.length) {
                const line = lines[i];
                if (chunkData) chunkData += '\r\n';
                chunkData += line;
                remainingSize -= Buffer.from(line + '\r\n', 'utf8').length;
                i++;
            }
            
            result += chunkData;
            i++; // Passer la ligne vide après le chunk
        }
        
        return result;
    }
    
    public static extractCompleteChunks(buffer: string): { chunks: string[], remainingBuffer: string } {
        const chunks: string[] = [];
        let remainingBuffer = buffer;
        let pos = 0;
        
        while (pos < remainingBuffer.length) {
            // Find the chunk size line
            const crlfPos = remainingBuffer.indexOf('\r\n', pos);
            if (crlfPos === -1) break;
            
            const chunkSizeLine = remainingBuffer.substring(pos, crlfPos).trim();
            if (!chunkSizeLine) {
                pos = crlfPos + 2;
                continue;
            }
            
            const chunkSize = parseInt(chunkSizeLine, 16);
            
            // If chunk size is 0, this is the end marker
            if (chunkSize === 0) {
                // Include the end marker in remaining buffer for proper completion detection
                remainingBuffer = remainingBuffer.substring(pos);
                break;
            }
            
            // Calculate where the chunk data starts and ends
            const chunkDataStart = crlfPos + 2;
            const chunkDataEnd = chunkDataStart + chunkSize;
            const chunkEnd = chunkDataEnd + 2; // +2 for trailing \r\n
            
            // Check if we have the complete chunk
            if (chunkEnd > remainingBuffer.length) break;
            
            // Extract the chunk data
            const chunkData = remainingBuffer.substring(chunkDataStart, chunkDataEnd);
            chunks.push(chunkData);
            
            // Move past this chunk
            pos = chunkEnd;
        }
        
        // Update remaining buffer to remove processed chunks
        remainingBuffer = remainingBuffer.substring(pos);
        
        return { chunks, remainingBuffer };
    }
}

class DockerClient {
    private socket: net.Socket;
    private host: string;

    constructor(host: string = 'localhost') {
        this.host = host;
        this.socket = new net.Socket();
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        // Connexion établie
        this.socket.on('connect', () => {
            console.debug(`Connected to ${this.host}`);
        });

        // Données reçues du serveur
        this.socket.on('data', (data: Buffer) => {
            const response = data.toString('utf8');
            this.onDataReceived(response);
        });

        // Connexion fermée
        this.socket.on('close', () => {
            console.debug('Connexion closed');
        });

        // Gestion des erreurs
        this.socket.on('error', (error: Error) => {
            console.error('Error:', error.message);
        });
    }

    // Callback appelé quand des données sont reçues
    private onDataReceived(data: string): void {
        // Cette méthode peut être surchargée ou modifiée selon les besoins
        // Par défaut, elle ne fait rien de plus que le log
    }

    // Méthode pour se connecter au serveur
    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.connect(this.host, () => {
                resolve();
            });

            this.socket.on('error', (error) => {
                reject(error);
            });
        });
    }

    // Méthode pour lire une réponse HTTP complète
    public readHTTPResponse(timeout: number = 10000, chunkCallback?: (chunk: string) => void): Promise<HTTPResponse> {
        return new Promise((resolve, reject) => {
            let buffer = '';
            let timeoutId: NodeJS.Timeout;
            let resolved = false;
            let headersComplete = false;
            let expectedBodyLength = -1;
            let isChunked = false;
            let statusLine = '';
            let statusCode = 0;
            let headers: { [key: string]: string } = {};

            const dataHandler = (data: Buffer) => {
                buffer += data.toString('utf8');
                
                if (!headersComplete) {
                    const lines = buffer.split('\r\n');
                    let headerEndFound = false;
                    let headerEndIndex = -1;
                    
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i] === '' && i > 0) {
                            headerEndFound = true;
                            headerEndIndex = i;
                            break;
                        }
                    }
                    
                    if (headerEndFound) {
                        headersComplete = true;
                        
                        // Parse status line
                        statusLine = lines[0];
                        const statusParts = statusLine.split(' ');
                        statusCode = parseInt(statusParts[1]) || 0;
                        
                        // Parse headers
                        headers = {};
                        for (let i = 1; i < headerEndIndex; i++) {
                            const colonIndex = lines[i].indexOf(':');
                            if (colonIndex > 0) {
                                const headerName = lines[i].substring(0, colonIndex).trim().toLowerCase();
                                const headerValue = lines[i].substring(colonIndex + 1).trim();
                                headers[headerName] = headerValue;
                            }
                        }
                        
                        // Check Content-Length
                        if (headers['content-length']) {
                            expectedBodyLength = parseInt(headers['content-length']);
                        }
                        
                        // Check Transfer-Encoding: chunked
                        if (headers['transfer-encoding'] === 'chunked') {
                            isChunked = true;
                        }
                        
                        // Reset buffer to contain only body data
                        const bodyStartIndex = buffer.indexOf('\r\n\r\n') + 4;
                        buffer = buffer.substring(bodyStartIndex);
                    }
                }
                
                if (headersComplete && !resolved) {
                    let isComplete = false;
                    
                    if (isChunked) {
                        // Handle chunked transfer encoding
                        if (chunkCallback) {
                            // Extract and process complete chunks
                            const { chunks, remainingBuffer } = HTTPParser.extractCompleteChunks(buffer);
                            buffer = remainingBuffer;
                            
                            // Invoke callback for each complete chunk
                            chunks.forEach(chunk => chunkCallback(chunk));
                        }
                        
                        // Check for end of chunked transfer (chunk of size 0)
                        if (buffer.includes('\r\n0\r\n\r\n')) {
                            isComplete = true;
                        }
                    } else if (expectedBodyLength >= 0) {
                        // For Content-Length, check if we have enough data
                        if (buffer.length >= expectedBodyLength) {
                            isComplete = true;
                        }
                    } else {
                        // If no Content-Length or chunked, consider complete
                        isComplete = true;
                    }
                    
                    if (isComplete) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        this.socket.off('data', dataHandler);
                        
                        let body: string | undefined;
                        
                        // Only set body if no callback was provided
                        if (!chunkCallback) {
                            body = buffer;
                            
                            // Dechunk the body if necessary
                            if (isChunked && body) {
                                body = HTTPParser.parseChunkedBody(body);
                            }
                        }
                        
                        const response: HTTPResponse = {
                            statusLine,
                            statusCode,
                            headers,
                            body
                        };
                        
                        resolve(response);
                    }
                }
            };

            // Gérer la fermeture de connexion
            const closeHandler = () => {
                if (!resolved && headersComplete) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    this.socket.off('data', dataHandler);
                    
                    let body: string | undefined;
                    
                    // Only set body if no callback was provided
                    if (!chunkCallback) {
                        body = buffer;
                        
                        if (isChunked && body) {
                            body = HTTPParser.parseChunkedBody(body);
                        }
                    }
                    
                    const response: HTTPResponse = {
                        statusLine,
                        statusCode,
                        headers,
                        body
                    };
                    
                    console.log('Connexion fermée, réponse HTTP reçue');
                    resolve(response);
                }
            };

            if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        this.socket.off('data', dataHandler);
                        this.socket.off('close', closeHandler);
                        reject(new Error('Timeout: réponse HTTP incomplète'));
                    }
                }, timeout);
            }

            this.socket.on('data', dataHandler);
            this.socket.once('close', closeHandler);
        });
    }

    // Méthode pour envoyer une requête HTTP et lire la réponse
    public sendHTTPRequest(request: string, timeout: number = 10000, chunkCallback?: (chunk: string) => void): Promise<HTTPResponse> {
        return new Promise(async (resolve, reject) => {
            if (this.socket.destroyed) {
                reject(new Error('Socket fermé'));
                return;
            }

            try {
                // Envoyer la requête
                await new Promise<void>((resolveWrite, rejectWrite) => {
                    this.socket.write(request, 'utf8', (error) => {
                        if (error) {
                            rejectWrite(error);
                        } else {
                            resolveWrite();
                        }
                    });
                });

                // Lire la réponse
                const response = await this.readHTTPResponse(timeout, chunkCallback);
                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }

    public async get<T>(uri: string): Promise<T> {
        return new Promise(async (resolve, reject) => {
            this.sendHTTPRequest(`GET ${uri} HTTP/1.1
Host: host
User-Agent: docker-ts/0.0.1
Accept: application/json

`).then((response) => {
                const contentType = response.headers['content-type']?.toLowerCase();
                if (contentType?.includes('application/json')) {
                    const parsedBody = JSON.parse(response.body);
                    resolve(parsedBody as T);
                } else {
                    resolve(response.body as T);
                };            
            });
        });
    }

    // Méthode pour fermer la connexion
    public disconnect(): void {
        this.socket.end();
    }


    // TODO this could be generated by openapi-generator with a custom template

    public async systemVersion(): Promise<models.SystemVersion> {
        return this.get<models.SystemVersion>('/version')
    }

    public async systemEvents(callback: (event: models.EventMessage) => void) {        
        await this.sendHTTPRequest(`GET /events HTTP/1.1
Host: host
User-Agent: docker-ts/0.0.1
Accept: application/x-ndjson

`, -1, (chunk: string) => {
            callback(JSON.parse(chunk) as models.EventMessage);
        })
    }

    public async networkInspect(id: string): Promise<models.NetworkInspect> {
        return this.get<models.NetworkInspect>(`/networks/${id}`)
    }
}


const docker = new DockerClient('/var/run/docker.sock');

try {
        await docker.connect();

        let version = await docker.systemVersion();
        console.log("Version:")
        console.dir(version, { depth: null });

        await docker.systemEvents((event: models.EventMessage) => {
            console.log(event);
        });

        docker.disconnect();
} catch (error) {
        console.error(error);
}
