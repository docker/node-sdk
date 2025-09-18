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
function getErrorMessage(
    status: string,
    headers: { [key: string]: string },
    body: string | undefined,
): string {
    const contentType = headers['content-type']?.toLowerCase();
    if (contentType?.includes('application/json') && body) {
        const jsonBody = JSON.parse(body);
        if (jsonBody.message) {
            return jsonBody.message;
        }
    }
    return status;
}

// Class to represent an HTTP request
export class HTTPRequest {
    public method: string;
    public uri: string;
    public headers: { [key: string]: string };

    constructor(
        method: string,
        uri: string,
        headers: { [key: string]: string } = {},
    ) {
        this.method = method;
        this.uri = uri;
        this.headers = headers;
    }

    public addHeader(key: string, value: string): void {
        this.headers[key] = value;
    }

    public setHeaders(headers: { [key: string]: string }): void {
        this.headers = { ...this.headers, ...headers };
    }
}

// Interface to represent an HTTP response
export interface HTTPResponse {
    statusLine: string;
    statusCode: number;
    headers: { [key: string]: string };
    body?: string;
}

// Class for parsing HTTP responses
export class HTTPParser {
    public static parseChunkedBody(chunkedData: string): string {
        const { chunks } = HTTPParser.extractChunks(chunkedData);
        return chunks.join('');
    }

    public static extractChunks(buffer: string): {
        chunks: string[];
        remainingBuffer: string;
    } {
        const chunks: string[] = [];
        let remainingBuffer = buffer;
        let pos = 0;

        while (pos < remainingBuffer.length) {
            // Find the chunk size line
            const crlfPos = remainingBuffer.indexOf('\r\n', pos);
            if (crlfPos === -1) break;

            const chunkSizeLine = remainingBuffer
                .substring(pos, crlfPos)
                .trim();
            if (!chunkSizeLine) {
                pos = crlfPos + 2;
                continue;
            }

            const chunkSize = parseInt(chunkSizeLine, 16);

            // If chunk size is 0, this is the end marker (empty chunk)
            if (chunkSize === 0) {
                // Add empty chunk to indicate end of transfer
                chunks.push('');
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
            const chunkData = remainingBuffer.substring(
                chunkDataStart,
                chunkDataEnd,
            );
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

    close() {
        this.socket.destroy();
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
    private onDataReceived(_: string): void {
        // This method can be overridden or modified as needed
        // By default, it does nothing more than logging
    }

    // Method to read a complete HTTP response
    public readHTTPResponse(
        callback?: (chunk: string) => void,
    ): Promise<HTTPResponse> {
        return new Promise((resolve, reject) => {
            let buffer = '';
            let body = '';
            let resolved = false;
            let headersComplete = false;
            let expectedBodyLength = -1;
            let isChunked = false;
            let statusLine: string | undefined = '';
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
                        const statusParts = statusLine?.split(' ');
                        statusCode = parseInt(statusParts?.[1] ?? '0') ?? 0;

                        // Parse headers
                        headers = {};
                        for (let i = 1; i < headerEndIndex; i++) {
                            const colonIndex = lines?.[i]?.indexOf(':') ?? -1;
                            if (colonIndex > 0) {
                                const headerName = lines?.[i]
                                    ?.substring(0, colonIndex)
                                    .trim()
                                    .toLowerCase();
                                const headerValue = lines?.[i]
                                    ?.substring(colonIndex + 1)
                                    .trim();
                                headers[headerName] = headerValue;
                            }
                        }

                        // Check Content-Length
                        if (headers['content-length']) {
                            expectedBodyLength = parseInt(
                                headers['content-length'],
                            );
                        }

                        // Check Transfer-Encoding: chunked
                        if (headers['transfer-encoding'] === 'chunked') {
                            isChunked = true;
                        }

                        // Check for Docker stream content types
                        const contentType = headers['content-type'];
                        const isDockerStream =
                            contentType === DOCKER_RAW_STREAM ||
                            contentType === DOCKER_MULTIPLEXED_STREAM;

                        if (isDockerStream && callback) {
                            // For upgrade protocols, forward all remaining data directly to callback
                            const bodyStartIndex =
                                buffer.indexOf('\r\n\r\n') + 4;
                            const remainingData =
                                buffer.substring(bodyStartIndex);

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

                            const response: HTTPResponse = {
                                statusLine,
                                statusCode,
                                headers,
                                body: undefined,
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
                        // Always extract complete chunks
                        const { chunks, remainingBuffer } =
                            HTTPParser.extractChunks(buffer);
                        buffer = remainingBuffer;

                        // Process chunks and detect end of transfer
                        chunks.forEach((chunk) => {
                            if (chunk === '') {
                                // Empty chunk indicates end of chunked transfer
                                isComplete = true;
                            } else {
                                if (callback) {
                                    callback(chunk);
                                } else {
                                    body += chunk;
                                }
                            }
                        });
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
                        this.socket.off('data', dataHandler);

                        let responseBody: string | undefined;

                        // Only set body if no callback was provided
                        if (!callback) {
                            if (isChunked) {
                                // Use the concatenated body from chunks
                                responseBody = body;
                            } else {
                                // Use the buffer for non-chunked responses
                                responseBody = buffer;
                            }
                        }

                        const response: HTTPResponse = {
                            statusLine,
                            statusCode,
                            headers,
                            body: responseBody,
                        };

                        // Reject promise for HTTP status codes >= 400
                        if (statusCode >= 400) {
                            const errorMessage = getErrorMessage(
                                statusLine,
                                headers,
                                responseBody,
                            );
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

            this.socket.on('data', dataHandler);
        });
    }

    // Method to send an HTTP request with method, URI and parameters
    public sendHTTPRequest(
        method: string,
        uri: string,
        options?: {
            params?: Record<string, any>;
            data?: object;
            callback?: (data: string) => void;
            accept?: string;
            headers?: Record<string, string>;
        },
    ): Promise<HTTPResponse> {
        const {
            params,
            data,
            callback,
            accept = 'application/json',
            headers = {},
        } = options || {};

        // Prepare HTTPRequest
        const queryString = this.buildQueryString(params);
        const httpRequest = new HTTPRequest(method, `${uri}${queryString}`, {
            Host: 'host',
            'User-Agent': 'docker-ts/0.0.1',
        });

        // Add any custom headers
        httpRequest.setHeaders(headers);
        httpRequest.addHeader('Accept', accept);

        // Prepare body data and headers
        let body: string | NodeJS.ReadableStream | undefined;
        if (data) {
            // Check if body is a stream
            if (
                typeof data === 'object' &&
                'read' in data &&
                typeof (data as any).read === 'function'
            ) {
                // Use chunked transfer encoding for streams
                body = data as NodeJS.ReadableStream;
                httpRequest.addHeader('Transfer-Encoding', 'chunked');
            } else {
                // Convert to JSON string for objects
                body = JSON.stringify(data);
                httpRequest.addHeader('Content-Type', 'application/json');
                httpRequest.addHeader('Content-Length', body.length.toString());
            }
        }

        return new Promise(async (resolve, reject) => {
            if (this.socket.destroyed) {
                reject(new Error('Socket closed'));
                return;
            }

            // Write HTTPRequest to socket
            try {
                let requestData = `${httpRequest.method} ${httpRequest.uri} HTTP/1.1\r\n`;
                Object.entries(httpRequest.headers).forEach(([key, value]) => {
                    requestData += `${key}: ${value}\r\n`;
                });
                requestData += '\r\n';
                this.socket.write(requestData, 'utf8');

                if (body) {
                    if (typeof body === 'string') {
                        this.socket.write(body);
                    } else {
                        await this.writeStreamChunked(body).catch((error) => {
                            reject(error);
                        });
                    }
                }

                this.readHTTPResponse(callback)
                    .then((response) => {
                        resolve(response);
                    })
                    .catch((error) => {
                        reject(error + ' ' + httpRequest.uri);
                    });
            } catch (error) {
                reject(error);
            }
        });
    }

    private async writeStreamChunked(
        stream: NodeJS.ReadableStream,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => {
                const chunkSize = chunk.length;
                if (chunkSize > 0) {
                    // Write chunk size in hexadecimal followed by CRLF
                    this.socket.write(`${chunkSize.toString(16)}\r\n`);
                    // Write the chunk data followed by CRLF
                    this.socket.write(chunk);
                    this.socket.write('\r\n');
                }
            });

            stream.on('end', () => {
                // Write the final zero-length chunk to indicate end of stream
                this.socket.write('0\r\n\r\n');
                resolve();
            });

            stream.on('error', (error) => {
                reject(error);
            });
        });
    }

    private handleResponse<T>(response: HTTPResponse): T {
        const contentType = response.headers['content-type']?.toLowerCase();
        if (contentType?.includes('application/json') && response.body) {
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
                if (
                    value &&
                    typeof value === 'object' &&
                    typeof value.toURLParameter === 'function'
                ) {
                    searchParams.append(key, value.toURLParameter());
                } else {
                    searchParams.append(key, String(value));
                }
            }
        });

        const queryString = searchParams.toString();
        return queryString ? `?${queryString}` : '';
    }

    public async get<T>(
        uri: string,
        params?: Record<string, any>,
        accept?: string,
        callback?: (data: any) => boolean,
    ): Promise<T> {
        return this.sendHTTPRequest('GET', uri, {
            params: params,
            accept: accept,
            callback: callback,
        }).then((response) => this.handleResponse<T>(response));
    }

    public async post<T>(
        uri: string,
        params?: Record<string, any>,
        data?: object,
        headers?: Record<string, string>,
        callback?: (data: any) => void,
    ): Promise<T> {
        return this.sendHTTPRequest('POST', uri, {
            params: params,
            data: data,
            headers: headers,
            callback: callback,
        }).then((response) => this.handleResponse<T>(response));
    }

    public async put<T>(
        uri: string,
        params: Record<string, any>,
        data: object,
        type: string,
    ): Promise<T> {
        return this.sendHTTPRequest('PUT', uri, {
            params: params,
            data: data,
            headers: {
                'Content-Type': type,
            },
        }).then((response) => this.handleResponse<T>(response));
    }

    public async delete<T>(
        uri: string,
        params?: Record<string, any>,
    ): Promise<T> {
        return this.sendHTTPRequest('DELETE', uri, { params: params }).then(
            (response) => this.handleResponse<T>(response),
        );
    }
}
