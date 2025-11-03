import type { IncomingMessage } from 'node:http';
import type { ReadableStream } from 'stream/web';
import { Agent, Response, fetch, upgrade } from 'undici';
import { Readable } from 'node:stream';

// Docker stream content type constants
export const DOCKER_RAW_STREAM = 'application/vnd.docker.raw-stream';
export const DOCKER_MULTIPLEXED_STREAM =
    'application/vnd.docker.multiplexed-stream';
export const APPLICATION_JSON = 'application/json';
export const APPLICATION_NDJSON = 'application/x-ndjson';

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
function _parseContentType(contentType?: string): {
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
function _getErrorMessageFromResp(
    res: IncomingMessage,
    body: string | undefined,
): string | undefined {
    const contentType = res.headers['content-type']?.toLowerCase();
    if (contentType?.includes(APPLICATION_JSON) && body) {
        const jsonBody = JSON.parse(body);
        if (jsonBody.message) {
            return jsonBody.message as string;
        }
    }
    return res.statusMessage;
}

/**
 * HTTPClient provides HTTP communication capabilities over TCP sockets.
 * Supports GET, POST, and DELETE requests with query parameters and request bodies.
 * Handles chunked transfer encoding and provides streaming response callbacks.
 */
export class HTTPClient {
    private agent: Agent;
    private fetchOptions: object;
    private headers: Record<string, string>;
    private baseUrl: string;

    constructor(
        agent: Agent,
        fetchOptions: object,
        userAgent: string,
        headers?: Record<string, string>,
    ) {
        this.agent = agent;
        this.fetchOptions = fetchOptions;
        this.headers = headers || {};
        this.headers['User-Agent'] = userAgent;
        this.baseUrl = 'http://localhost:2375';
    }

    close(): Promise<void> {
        if (this.agent.destroy) {
            return this.agent.destroy();
        } else {
            return Promise.resolve();
        }
    }

    // Method to send an HTTP request with method, URI and parameters
    public sendHTTPRequest(
        _method: string,
        _uri: string,
        _options?: {
            params?: Record<string, any>;
            data?: any;
            callback?: (data: Buffer, encoding?: BufferEncoding) => void;
            accept?: string;
            headers?: Record<string, string>;
        },
    ): Promise<Response> {
        throw new Error('sendHTTPRequest method not implemented');
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

    public async head(
        uri: string,
        params?: Record<string, any>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        return fetch(`${this.baseUrl}${uri}${queryString}`, {
            method: 'HEAD',
            headers: this.headers,
            dispatcher: this.agent,
            ...this.fetchOptions,
        });
    }

    public async get(
        uri: string,
        accept: string,
        params?: Record<string, any>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        return fetch(`${this.baseUrl}${uri}${queryString}`, {
            method: 'GET',
            headers: {
                Accept: accept,
                ...this.headers,
            },
            dispatcher: this.agent,
            ...this.fetchOptions,
        });
    }

    public getJSON<T>(uri: string, params?: Record<string, any>): Promise<T> {
        return this.get(uri, APPLICATION_JSON, params).then((response) => {
            if (response.status === 404) {
                throw NotFoundError;
            }
            return response.json() as T;
        });
    }

    public async post(
        uri: string,
        params?: Record<string, any>,
        data?: object | ReadableStream,
        headers?: Record<string, string>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        const requestHeaders: Record<string, string> = {
            'Content-Type': APPLICATION_JSON,
            ...headers,
            ...this.headers,
        };
        let body: ReadableStream | string = '';
        if (data) {
            if (isReadableStream(data)) {
                body = data;
            } else {
                body = JSON.stringify(data);
            }
        }

        return fetch(`${this.baseUrl}${uri}${queryString}`, {
            method: 'POST',
            headers: requestHeaders,
            body: body,
            duplex: 'half',
            dispatcher: this.agent,
            ...this.fetchOptions,
        });
    }

    public async put(
        uri: string,
        params: Record<string, any>,
        data: object,
        type: string,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        return fetch(`${this.baseUrl}${uri}${queryString}`, {
            method: 'PUT',
            headers: {
                'Content-Type': type,
                ...this.headers,
            },
            body: JSON.stringify(data),
            dispatcher: this.agent,
            ...this.fetchOptions,
        });
    }

    public async delete(
        uri: string,
        params?: Record<string, any>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        return fetch(`${this.baseUrl}${uri}${queryString}`, {
            method: 'DELETE',
            headers: this.headers,
            dispatcher: this.agent,
            ...this.fetchOptions,
        });
    }

    public async upgrade(
        uri: string,
        params?: Record<string, any>,
    ): Promise<Upgrade> {
        const queryString = this.buildQueryString(params);

        try {
            const { headers, socket } = await upgrade(
                `${this.baseUrl}${uri}${queryString}`,
                {
                    method: 'POST',
                    headers: this.headers,
                    dispatcher: this.agent,
                    protocol: 'tcp',
                },
            );
            const header = headers['content-type'] || '';
            let content: string;
            if (Array.isArray(header)) {
                content = header[0] || '';
            } else {
                content = header;
            }

            return {
                content: content,
                socket: socket,
            };
        } catch (error) {
            // Check if undici.upgrade is not implemented (e.g., in Bun)
            if (
                error instanceof Error &&
                error.message.includes('not yet implemented')
            ) {
                // Fall back to a plain POST request
                // see https://docs.docker.com/reference/api/engine/version/v1.51/#tag/Container/operation/ContainerAttach
                const response = await fetch(
                    `${this.baseUrl}${uri}${queryString}`,
                    {
                        method: 'POST',
                        headers: {
                            ...this.headers,
                        },
                        dispatcher: this.agent,
                        ...this.fetchOptions,
                    },
                );

                const header = response.headers.get('content-type') || '';

                // Convert the response body to a Node Duplex stream
                if (!response.body) {
                    throw new Error('No response body available');
                }

                const readable = Readable.fromWeb(response.body as any);

                return {
                    content: header,
                    socket: readable,
                };
            }
            throw error;
        }
    }
}

interface Upgrade {
    content: string;
    socket: Readable;
}

function isReadableStream(data: any): data is ReadableStream {
    return 'getReader' in data && typeof data.getReader === 'function';
}
