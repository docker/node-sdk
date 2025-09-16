import * as net from 'net';

// Docker stream content type constants
const DOCKER_RAW_STREAM = 'application/vnd.docker.raw-stream';
const DOCKER_MULTIPLEXED_STREAM = 'application/vnd.docker.multiplexed-stream';

// Custom error class for 404 Not Found responses
export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

// Custom error class for 401 Unauthorized responses
export class UnauthorizedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

// Custom error class for 409 Conflict responses
export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConflictError';
    }
}

// Function to extract error message from response body
function getErrorMessage(status: string, headers: { [key: string]: string }, body: string | undefined): string {
    const contentType = headers['content-type']?.toLowerCase();
    if (contentType?.includes('application/json') && body) {
        try {
            const jsonBody = JSON.parse(body);
            if (jsonBody.message) {
                return jsonBody.message;
            }
        } catch (parseError) {
            // If JSON parsing fails, return the default message
        }
    }
    return status;
}

// Interface to represent an HTTP response
export interface HTTPResponse {
    statusLine: string;
    statusCode: number;
    headers: { [key: string]: string };
    body?: string;
}

// Class for parsing HTTP responses
class HTTPParser {  
    public static parseChunkedBody(chunkedData: string): string {
        const lines = chunkedData.split('\r\n');
        let result = '';
        let i = 0;
        
        while (i < lines.length) {
            // Read chunk size (in hexadecimal)
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
            
            i++; // Move to next line (chunk data)
            
            // Collect chunk data
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
            i++; // Skip empty line after chunk
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

/**
 * HTTPClient provides HTTP communication capabilities over TCP sockets.
 * Supports GET, POST, and DELETE requests with query parameters and request bodies.
 * Handles chunked transfer encoding and provides streaming response callbacks.
 */
export class HTTPClient {
    private socket: net.Socket;

    constructor(socket: net.Socket) {
        this.socket = socket;
        this.setupEventHandlers();
    }

    private close() {
        this.socket.destroy()
    }

    private setupEventHandlers(): void {
        // Data received from server
        this.socket.on('data', (data: Buffer) => {
            const response = data.toString('utf8');
            this.onDataReceived(response);
        });

        // Error handling
        this.socket.on('error', (error: Error) => {
            console.error('Error:', error.message);
        });
    }

    // Callback called when data is received
    private onDataReceived(data: string): void {
        // This method can be overridden or modified as needed
        // By default, it does nothing more than logging
    }

    // Method to read a complete HTTP response
    public readHTTPResponse(timeout: number = 10000, callback?: (chunk: string) => void): Promise<HTTPResponse> {
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
                        
                        // Check for Docker stream content types
                        const contentType = headers['content-type'];
                        const isDockerStream = contentType === DOCKER_RAW_STREAM || 
                                             contentType === DOCKER_MULTIPLEXED_STREAM;
                        
                        if (isDockerStream && callback) {
                            // For upgrade protocols, forward all remaining data directly to callback
                            const bodyStartIndex = buffer.indexOf('\r\n\r\n') + 4;
                            const remainingData = buffer.substring(bodyStartIndex);
                            
                            if (remainingData) {
                                callback(remainingData);
                            }
                            
                            // Set up direct forwarding for future data
                            const upgradeHandler = (data: Buffer) => {
                                callback(data.toString('utf8'));
                            };
                            
                            this.socket.off('data', dataHandler);
                            this.socket.on('data', upgradeHandler);
                            
                            // Resolve immediately with upgrade response
                            resolved = true;
                            clearTimeout(timeoutId);
                            
                            const response: HTTPResponse = {
                                statusLine,
                                statusCode,
                                headers,
                                body: undefined
                            };
                            
                            resolve(response);
                            return;
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
                        if (callback) {
                            // Extract and process complete chunks
                            const { chunks, remainingBuffer } = HTTPParser.extractCompleteChunks(buffer);
                            buffer = remainingBuffer;
                            
                            // Invoke callback for each complete chunk
                            chunks.forEach(chunk => callback(chunk));
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
                        if (!callback) {
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
                        
                        // Reject promise for HTTP status codes >= 400
                        if (statusCode >= 400) {
                                const errorMessage = getErrorMessage(statusLine, headers, body);
                            if (statusCode === 404) {
                                reject(new NotFoundError(errorMessage));
                            } else if (statusCode === 401) {
                                reject(new UnauthorizedError(errorMessage));
                            } else if (statusCode === 409) {
                                reject(new ConflictError(errorMessage));
                            } else {
                                reject(new Error(errorMessage));
                            }
                        } else {
                            resolve(response);
                        }
                    }
                }
            };

            if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        this.socket.off('data', dataHandler);
                        reject(new Error('Timeout: incomplete HTTP response'));
                    }
                }, timeout);
            }

            this.socket.on('data', dataHandler);
        });
    }

    // Method to send a raw HTTP request and read the response
    public sendHTTPRequestRaw(request: string, timeout: number = 10000, chunkCallback?: (chunk: string) => void): Promise<HTTPResponse> {
        return new Promise(async (resolve, reject) => {
            if (this.socket.destroyed) {
                reject(new Error('Socket closed'));
                return;
            }

            try {
                // Send the request
                await new Promise<void>((resolveWrite, rejectWrite) => {
                    this.socket.write(request, 'utf8', (error) => {
                        if (error) {
                            rejectWrite(error);
                        } else {
                            resolveWrite();
                        }
                    });
                });

                // Read the response
                const response = await this.readHTTPResponse(timeout, chunkCallback);
                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }

    // Method to send an HTTP request with method, URI and parameters
    public sendHTTPRequest(method: string, uri: string, options?: {
        params?: Record<string, any>,
        body?: object,
        timeout?: number,
        callback?: (data: string) => void,
        accept?: string,
        headers?: Record<string, string>
    }): Promise<HTTPResponse> {
        const { params, body, timeout = 10000, callback, accept = 'application/json', headers } = options || {};
        
        const queryString = this.buildQueryString(params);
        const fullUri = `${uri}${queryString}`;
        
        let request = `${method} ${fullUri} HTTP/1.1
Host: host
User-Agent: docker-ts/0.0.1
Accept: ${accept}
`;
        
        // Add custom headers if provided
        if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
                request += `${key}: ${value}\r\n`;
            });
        }
        
        if (body) {
            const json = JSON.stringify(body);
            request += `Content-type: application/json
Content-length: ${json.length}

${json}`;
        } else {
            request += '\r\n';
        }
        
        return this.sendHTTPRequestRaw(request, timeout, callback);
    }

    private handleResponse<T>(response: HTTPResponse): T {
        const contentType = response.headers['content-type']?.toLowerCase();
        if (contentType?.includes('application/json')) {
            const parsedBody = JSON.parse(response.body);
            return parsedBody as T;
        } else {
            return response.body as T;
        }
    }

    private buildQueryString(params?: Record<string, any>): string {
        if (!params || Object.keys(params).length === 0) {
            return '';
        }
        
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                if (value && typeof value === 'object' && typeof value.toURLParameter === 'function') {
                    searchParams.append(key, value.toURLParameter());
                } else {
                    searchParams.append(key, String(value));
                }
            }
        });
        
        const queryString = searchParams.toString();
        return queryString ? `?${queryString}` : '';
    }

    public async get<T>(uri: string, params?: Record<string, any>): Promise<T> {
        return this.sendHTTPRequest('GET', uri, { params: params })
            .then(response => this.handleResponse<T>(response));
    }


    public async post<T>(uri: string, params?: Record<string, any>, data?: object, timeout?: number, headers?: Record<string, string>): Promise<T> {
        return this.sendHTTPRequest('POST', uri, { params: params, body: data, timeout: timeout, headers: headers })
            .then(response => this.handleResponse<T>(response));
    }    

    public async delete<T>(uri: string, params?: Record<string, any>): Promise<T> {
        return this.sendHTTPRequest('DELETE', uri, { params: params })
            .then(response => this.handleResponse<T>(response));
    }
}
