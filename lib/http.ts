import * as http from 'http';
import * as stream from 'stream';
import { getErrorMessage } from './util.js';

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

// Function to parse content-type header and extract charset parameter
function parseContentType(contentType?: string): {
    type: string;
    charset?: string;
} {
    if (!contentType) {
        return { type: '' };
    }

    const parts = contentType.split(';').map((part) => part.trim());
    const type = parts[0]?.toLowerCase() || '';

    let charset: string | undefined;
    for (let i = 1; i < parts.length; i++) {
        const param = parts[i]?.toLowerCase() || '';
        if (param.startsWith('charset=')) {
            charset = param.split('=')[1];
            break;
        }
    }

    return { type, charset };
}

// Function to extract error message from response body
function getErrorMessageFromResp(
    res: http.IncomingMessage,
    body: string | undefined,
): string | undefined {
    const contentType = res.headers['content-type']?.toLowerCase();
    if (contentType?.includes('application/json') && body) {
        const jsonBody = JSON.parse(body);
        if (jsonBody.message) {
            return jsonBody.message;
        }
    }
    return res.statusMessage;
}

// Interface to represent an HTTP response
export interface HTTPResponse {
    statusMessage?: string;
    statusCode?: number;
    headers: { [key: string]: string };
    body?: string;
    sock?: stream.Duplex;
}

/**
 * HTTPClient provides HTTP communication capabilities over TCP sockets.
 * Supports GET, POST, and DELETE requests with query parameters and request bodies.
 * Handles chunked transfer encoding and provides streaming response callbacks.
 */
export class HTTPClient {
    private agent: http.Agent;

    constructor(agent: http.Agent) {
        this.agent = agent;
    }

    close() {
        this.agent.destroy();
    }

    // Method to send an HTTP request with method, URI and parameters
    public sendHTTPRequest(
        method: string,
        uri: string,
        options?: {
            params?: Record<string, any>;
            data?: any;
            callback?: (data: Buffer, encoding?: BufferEncoding) => void;
            accept?: string;
            headers?: Record<string, string>;
        },
    ): Promise<HTTPResponse> {
        return new Promise((resolve, reject) => {
            const {
                params,
                data,
                callback,
                accept = 'application/json',
                headers = {},
            } = options || {};

            // Build query string and construct full path
            const queryString = this.buildQueryString(params);
            const path = `${uri}${queryString}`;

            // Prepare headers
            const requestHeaders: Record<string, string> = {
                Host: 'host',
                'User-Agent': 'node-sdk/0.0.1',
                Accept: accept,
                ...headers,
            };

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
                    body = data as stream.Readable;
                    requestHeaders['Transfer-Encoding'] = 'chunked';
                } else {
                    // Convert to JSON string for objects
                    body = JSON.stringify(data);
                    requestHeaders['Content-Type'] = 'application/json';
                    requestHeaders['Content-Length'] = body.length.toString();
                }
            }

            // Create HTTP request options using our instance agent
            const requestOptions: http.RequestOptions = {
                method,
                host: 'dockerhost',
                path,
                headers: requestHeaders,
                agent: this.agent,
            };

            // Helper function to create response object
            const createResponse = (
                res: http.IncomingMessage,
                body?: string,
            ): HTTPResponse => {
                const responseHeaders: { [key: string]: string } = {};
                // Convert headers to lowercase keys
                Object.entries(res.headers).forEach(([key, value]) => {
                    responseHeaders[key.toLowerCase()] = Array.isArray(value)
                        ? value.join(', ')
                        : value || '';
                });

                return {
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                    headers: responseHeaders,
                    body,
                };
            };

            const req = http.request(requestOptions, (res) => {
                let responseBody = '';

                // Helper function to handle response completion
                const handleResponseEnd = (body?: string) => {
                    const response = createResponse(res, body);

                    if (res.statusCode && res.statusCode >= 400) {
                        const errorMessage =
                            getErrorMessageFromResp(res, body) ?? '';
                        if (res.statusCode === 404) {
                            reject(new NotFoundError(errorMessage));
                        } else if (res.statusCode === 401) {
                            reject(new UnauthorizedError(errorMessage));
                        } else if (res.statusCode === 409) {
                            reject(new ConflictError(errorMessage));
                        } else {
                            reject(new Error(errorMessage));
                        }
                    } else {
                        resolve(response);
                    }
                };

                // Helper function to handle response errors
                const handleResponseError = (error: Error) => {
                    reject(
                        new Error(
                            `Response stream error: ${getErrorMessage(error)}`,
                        ),
                    );
                };

                // Set up common error handler
                res.on('error', handleResponseError);

                // Check for Docker stream content types
                const contentType = res.headers['content-type'];
                const { type: mimeType, charset } =
                    parseContentType(contentType);
                var encoding = (charset || 'utf8') as BufferEncoding;

                const isDockerStream =
                    mimeType === DOCKER_RAW_STREAM ||
                    mimeType === DOCKER_MULTIPLEXED_STREAM;

                if (isDockerStream && callback) {
                    // For upgrade protocols, forward all data directly to callback
                    res.on('data', (data: Buffer) => {
                        callback(data, encoding);
                    });

                    // Resolve immediately with upgrade response
                    resolve(createResponse(res));
                    return;
                }

                // Handle chunked responses with callback
                if (
                    res.headers['transfer-encoding'] === 'chunked' &&
                    callback
                ) {
                    res.on('data', (chunk: Buffer) => {
                        callback(chunk, encoding);
                    });

                    res.on('end', () => handleResponseEnd());
                } else {
                    // Collect response body for non-streaming responses
                    res.on('data', (chunk: Buffer) => {
                        responseBody += chunk.toString(encoding);
                    });

                    res.on('end', () => handleResponseEnd(responseBody));
                }
            });

            req.on('error', (error) => {
                reject(new Error(`Request error: ${error.message}`));
            });

            req.on('upgrade', (res, socket, head) => {
                const resp = createResponse(res);
                resp.sock = socket;
                resolve(resp);
            });

            // Write request body
            if (body) {
                if (typeof body === 'string') {
                    req.write(body);
                    req.end();
                } else {
                    const input = body as stream.Readable;
                    input.pipe(req);
                }
            } else {
                req.end();
            }
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
        callback?: (data: Buffer) => boolean,
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
        callback?: (data: Buffer) => void,
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
