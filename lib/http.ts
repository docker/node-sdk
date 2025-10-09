import type { IncomingMessage } from 'node:http';
import type { ReadableStream } from 'stream/web';
import { Agent, Response, fetch } from 'undici';

// Docker stream content type constants
const DOCKER_RAW_STREAM = 'application/vnd.docker.raw-stream';
const DOCKER_MULTIPLEXED_STREAM = 'application/vnd.docker.multiplexed-stream';
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
    res: IncomingMessage,
    body: string | undefined,
): string | undefined {
    const contentType = res.headers['content-type']?.toLowerCase();
    if (contentType?.includes(APPLICATION_JSON) && body) {
        const jsonBody = JSON.parse(body);
        if (jsonBody.message) {
            return jsonBody.message;
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
    private userAgent: string;
    private baseUrl: string;

    constructor(agent: Agent, userAgent: string) {
        this.agent = agent;
        this.userAgent = userAgent;
        this.baseUrl = 'http://localhost:2375';
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
            headers: {
                'User-Agent': this.userAgent,
            },
            dispatcher: this.agent,
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
                'User-Agent': this.userAgent,
                Accept: accept,
            },
            dispatcher: this.agent,
        });
    }

    public async getJSON<T>(
        uri: string,
        params?: Record<string, any>,
    ): Promise<T> {
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
            'User-Agent': this.userAgent,
            'Content-Type': APPLICATION_JSON,
            ...headers,
        };
        let body: ReadableStream | string = '';
        if (data) {
            if ('getReader' in data && typeof data.getReader === 'function') {
                body = data as ReadableStream;
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
                'User-Agent': this.userAgent,
                'Content-Type': type,
            },
            body: JSON.stringify(data),
            dispatcher: this.agent,
        });
    }

    public async delete(
        uri: string,
        params?: Record<string, any>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        return fetch(`${this.baseUrl}${uri}${queryString}`, {
            method: 'DELETE',
            headers: {
                'User-Agent': this.userAgent,
            },
            dispatcher: this.agent,
        });
    }

    public async upgrade(
        uri: string,
        params?: Record<string, any>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        // FIXME To hint potential proxies about connection hijacking,
        // the Docker client _should_ send connection upgrade headers.
        // but this is blocked by fetch()
        return fetch(`${this.baseUrl}${uri}${queryString}`, {
            method: 'POST',
            headers: {
                'User-Agent': this.userAgent,
                // 'Connection': 'Upgrade',
                // 'Upgrade': 'tcp',
            },
            dispatcher: this.agent,
        });
    }
}
