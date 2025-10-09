import type { Agent, IncomingMessage, RequestOptions } from 'node:http';
import { request } from 'node:http';
import type { Readable, Writable, Duplex } from 'node:stream';
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
    res: IncomingMessage,
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
    sock?: Duplex;
}

/**
 * HTTPClient provides HTTP communication capabilities over TCP sockets.
 * Supports GET, POST, and DELETE requests with query parameters and request bodies.
 * Handles chunked transfer encoding and provides streaming response callbacks.
 */
export class HTTPClient {
    private agent: Agent;
    private userAgent: string;

    constructor(agent: Agent, userAgent: string) {
        this.agent = agent;
        this.userAgent = userAgent;
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
        return null
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

    public async head<T>(
        uri: string,
        params?: Record<string, any>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        return fetch(`${uri}${queryString}`, {
            method: 'HEAD',
            headers: {
                'User-Agent': this.userAgent,
            },
        });
    }

    public async get(
        uri: string,
        accept: string,
        params?: Record<string, any>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        return fetch(`${uri}${queryString}`, {
            method: 'GET',
            headers: {
                'User-Agent': this.userAgent,
                Accept: accept,
            },
        });
    }

    public async getJSON<T>(
        uri: string,
        params?: Record<string, any>,
    ): Promise<T> {
        return this.get(uri, 'application/json', params)
            .then((response) => { return response.json() as T })
    }

    public async post<T>(
        uri: string,
        params?: Record<string, any>,
        data?: object,
        headers?: Record<string, string>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        const requestHeaders: Record<string, string> = {
            'User-Agent': this.userAgent,
            ...headers,
        };

        return fetch(`${uri}${queryString}`, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(data),
        });
    }

    public async put<T>(
        uri: string,
        params: Record<string, any>,
        data: object,
        type: string,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        return fetch(`${uri}${queryString}`, {
            method: 'PUT',
            headers: {
                'User-Agent': this.userAgent,
                'Content-Type': type,
            },
            body: JSON.stringify(data),
        })
    }

    public async delete<T>(
        uri: string,
        params?: Record<string, any>,
    ): Promise<Response> {
        const queryString = this.buildQueryString(params);
        return fetch(`${uri}${queryString}`, {
            method: 'DELETE',
            headers: {
                'User-Agent': this.userAgent,
            },
        });
    }
}
