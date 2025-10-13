import type {
    Agent,
    Response as UndiciResponse,
    RequestInit as UndiciRequestInit,
} from 'undici';
import { fetch } from 'undici';
import type {
    OCIImageIndex,
    OCIManifest,
    RegistryAuth,
    RegistryErrorResponse,
    TagsList,
} from './types/index.js';

/**
 * OCI Distribution Specification media types
 */
export const MediaTypes = {
    // Manifest types
    MANIFEST_V2: 'application/vnd.docker.distribution.manifest.v2+json',
    MANIFEST_LIST_V2:
        'application/vnd.docker.distribution.manifest.list.v2+json',
    OCI_MANIFEST_V1: 'application/vnd.oci.image.manifest.v1+json',
    OCI_INDEX_V1: 'application/vnd.oci.image.index.v1+json',

    // Config types
    CONTAINER_IMAGE_V1: 'application/vnd.docker.container.image.v1+json',
    OCI_CONFIG_V1: 'application/vnd.oci.image.config.v1+json',

    // Layer types
    IMAGE_LAYER: 'application/vnd.docker.image.rootfs.diff.tar.gzip',
    IMAGE_LAYER_FOREIGN:
        'application/vnd.docker.image.rootfs.foreign.diff.tar.gzip',
    OCI_LAYER: 'application/vnd.oci.image.layer.v1.tar+gzip',
} as const;

/**
 * Custom error class for registry-specific errors
 */
export class RegistryError extends Error {
    public code: string;
    public statusCode?: number;
    public detail?: any;

    constructor(
        message: string,
        code: string,
        statusCode?: number,
        detail?: any,
    ) {
        super(message);
        this.name = 'RegistryError';
        this.code = code;
        this.statusCode = statusCode;
        this.detail = detail;
    }
}

/**
 * OCI Registry Client
 *
 * Implements the OCI Distribution Specification for interacting with container registries.
 * Supports manifest operations, blob operations, and tag management.
 *
 * @example
 * ```typescript
 * const client = new RegistryClient('https://registry-1.docker.io', {
 *   username: 'myuser',
 *   password: 'mypassword'
 * });
 *
 * // Read a manifest
 * const manifest = await client.getManifest('library/nginx', 'latest');
 *
 * // List tags
 * const tags = await client.listTags('library/nginx');
 * ```
 */
export class RegistryClient {
    private baseUrl: string;
    private auth?: RegistryAuth;
    private agent?: Agent;
    private userAgent: string;
    private bearerToken?: string;
    private tokenExpiry?: number;

    /**
     * Create a new RegistryClient
     *
     * @param baseUrl - Base URL of the registry (e.g., 'https://registry-1.docker.io')
     * @param auth - Optional authentication credentials
     * @param agent - Optional undici Agent for custom connection handling
     * @param userAgent - Optional custom User-Agent header
     */
    constructor(
        baseUrl: string,
        auth?: RegistryAuth,
        agent?: Agent,
        userAgent: string = 'oci-registry-client/1.0',
    ) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.auth = auth;
        this.agent = agent;
        this.userAgent = userAgent;
    }

    /**
     * Close the client and cleanup resources
     */
    public close(): void {
        if (this.agent) {
            this.agent.destroy();
        }
    }

    /**
     * Get a manifest from the registry
     *
     * @param repository - Repository name (e.g., 'library/nginx')
     * @param reference - Tag or digest (e.g., 'latest' or 'sha256:...')
     * @returns The manifest object (either Manifest or Index depending on media type)
     *
     * @example
     * ```typescript
     * const manifest = await client.getManifest('library/nginx', 'latest');
     * console.log(manifest.config.digest);
     * ```
     */
    public async getManifest(
        repository: string,
        reference: string,
    ): Promise<OCIManifest | OCIImageIndex> {
        const url = `${this.baseUrl}/v2/${repository}/manifests/${reference}`;
        const headers = await this.buildHeaders({
            Accept: [
                MediaTypes.OCI_MANIFEST_V1,
                MediaTypes.OCI_INDEX_V1,
                MediaTypes.MANIFEST_V2,
                MediaTypes.MANIFEST_LIST_V2,
            ].join(', '),
        });

        const response = await this.fetch(url, { headers });
        await this.handleResponse(response);

        return response.json() as Promise<OCIManifest | OCIImageIndex>;
    }

    /**
     * Check if a manifest exists and get its digest
     *
     * @param repository - Repository name
     * @param reference - Tag or digest
     * @returns The manifest digest from the Docker-Content-Digest header
     *
     * @example
     * ```typescript
     * const digest = await client.headManifest('library/nginx', 'latest');
     * console.log(digest); // sha256:...
     * ```
     */
    public async resolve(
        repository: string,
        reference: string,
    ): Promise<string> {
        const url = `${this.baseUrl}/v2/${repository}/manifests/${reference}`;
        const headers = await this.buildHeaders({
            Accept: [
                MediaTypes.OCI_MANIFEST_V1,
                MediaTypes.OCI_INDEX_V1,
                MediaTypes.MANIFEST_V2,
                MediaTypes.MANIFEST_LIST_V2,
            ].join(', '),
        });

        const response = await this.fetch(url, {
            method: 'HEAD',
            headers,
        });
        await this.handleResponse(response);

        const digest = response.headers.get('Docker-Content-Digest');
        if (!digest) {
            throw new Error(
                'Docker-Content-Digest header not found in response',
            );
        }

        return digest;
    }

    /**
     * Push a manifest to the registry
     *
     * @param repository - Repository name
     * @param reference - Tag or digest
     * @param manifest - The manifest object to push
     * @returns The digest of the uploaded manifest
     *
     * @example
     * ```typescript
     * const manifest = {
     *   schemaVersion: 2,
     *   mediaType: MediaTypes.OCI_MANIFEST_V1,
     *   config: {...},
     *   layers: [...]
     * };
     * const digest = await client.putManifest('myrepo/myimage', 'v1.0', manifest);
     * ```
     */
    public async putManifest(
        repository: string,
        reference: string,
        manifest: OCIManifest | OCIImageIndex,
    ): Promise<string> {
        const url = `${this.baseUrl}/v2/${repository}/manifests/${reference}`;
        const body = JSON.stringify(manifest);
        const headers = await this.buildHeaders({
            'Content-Type': manifest.mediaType || MediaTypes.OCI_MANIFEST_V1,
            'Content-Length': String(Buffer.byteLength(body)),
        });

        const response = await this.fetch(url, {
            method: 'PUT',
            headers,
            body,
        });
        await this.handleResponse(response);

        const digest = response.headers.get('Docker-Content-Digest');
        if (!digest) {
            throw new Error(
                'Docker-Content-Digest header not found in response',
            );
        }

        return digest;
    }

    /**
     * Delete a manifest from the registry
     *
     * @param repository - Repository name
     * @param digest - Manifest digest (must be a digest, not a tag)
     *
     * @example
     * ```typescript
     * await client.deleteManifest('myrepo/myimage', 'sha256:abc123...');
     * ```
     */
    public async deleteManifest(
        repository: string,
        digest: string,
    ): Promise<void> {
        if (!digest.startsWith('sha256:') && !digest.startsWith('sha512:')) {
            throw new Error('deleteManifest requires a digest, not a tag');
        }

        const url = `${this.baseUrl}/v2/${repository}/manifests/${digest}`;
        const headers = await this.buildHeaders();

        const response = await this.fetch(url, {
            method: 'DELETE',
            headers,
        });
        await this.handleResponse(response);
    }

    /**
     * Get a blob from the registry
     *
     * @param repository - Repository name
     * @param digest - Blob digest
     * @returns ReadableStream of the blob content
     *
     * @example
     * ```typescript
     * const stream = await client.getBlob('library/nginx', 'sha256:abc123...');
     * // Pipe to file or process the stream
     * ```
     */
    public async getBlob(
        repository: string,
        digest: string,
    ): Promise<ReadableStream> {
        const url = `${this.baseUrl}/v2/${repository}/blobs/${digest}`;
        const headers = await this.buildHeaders();

        const response = await this.fetch(url, { headers });
        await this.handleResponse(response);

        if (!response.body) {
            throw new Error('No response body received');
        }

        return response.body;
    }

    /**
     * Check if a blob exists
     *
     * @param repository - Repository name
     * @param digest - Blob digest
     * @returns Boolean indicating if the blob exists
     *
     * @example
     * ```typescript
     * const exists = await client.headBlob('library/nginx', 'sha256:abc123...');
     * if (!exists) {
     *   // Upload the blob
     * }
     * ```
     */
    public async headBlob(
        repository: string,
        digest: string,
    ): Promise<boolean> {
        const url = `${this.baseUrl}/v2/${repository}/blobs/${digest}`;
        const headers = await this.buildHeaders();

        const response = await this.fetch(url, {
            method: 'HEAD',
            headers,
        });

        return response.status === 200;
    }

    /**
     * Delete a blob from the registry
     *
     * @param repository - Repository name
     * @param digest - Blob digest
     *
     * @example
     * ```typescript
     * await client.deleteBlob('myrepo/myimage', 'sha256:abc123...');
     * ```
     */
    public async deleteBlob(repository: string, digest: string): Promise<void> {
        const url = `${this.baseUrl}/v2/${repository}/blobs/${digest}`;
        const headers = await this.buildHeaders();

        const response = await this.fetch(url, {
            method: 'DELETE',
            headers,
        });
        await this.handleResponse(response);
    }

    /**
     * Initiate a blob upload
     *
     * @param repository - Repository name
     * @returns Upload location URL
     *
     * @example
     * ```typescript
     * const uploadUrl = await client.initiateUpload('myrepo/myimage');
     * // Use uploadUrl for chunked upload or monolithic upload
     * ```
     */
    public async initiateUpload(repository: string): Promise<string> {
        const url = `${this.baseUrl}/v2/${repository}/blobs/uploads/`;
        const headers = await this.buildHeaders();

        const response = await this.fetch(url, {
            method: 'POST',
            headers,
        });
        await this.handleResponse(response);

        const location = response.headers.get('Location');
        if (!location) {
            throw new Error(
                'Location header not found in upload initiation response',
            );
        }

        // Handle relative URLs
        if (location.startsWith('http://') || location.startsWith('https://')) {
            return location;
        }
        return `${this.baseUrl}${location}`;
    }

    /**
     * Upload a blob in a single request (monolithic upload)
     *
     * @param repository - Repository name
     * @param blob - Blob content as ReadableStream or Buffer
     * @param digest - Expected digest of the blob
     * @returns The digest of the uploaded blob
     *
     * @example
     * ```typescript
     * const blobData = Buffer.from('layer content...');
     * const digest = await client.uploadBlob('myrepo/myimage', blobData, 'sha256:abc123...');
     * ```
     */
    public async uploadBlob(
        repository: string,
        blob: ReadableStream | Buffer,
        digest: string,
    ): Promise<string> {
        const uploadUrl = await this.initiateUpload(repository);

        // Add digest parameter to complete the upload
        const url = new URL(uploadUrl);
        url.searchParams.set('digest', digest);

        const headers = await this.buildHeaders({
            'Content-Type': 'application/octet-stream',
        });

        const body = blob instanceof Buffer ? blob : blob;

        const response = await this.fetch(url.toString(), {
            method: 'PUT',
            headers,
            body: body as any,
        });
        await this.handleResponse(response);

        const resultDigest = response.headers.get('Docker-Content-Digest');
        if (!resultDigest) {
            throw new Error(
                'Docker-Content-Digest header not found in response',
            );
        }

        return resultDigest;
    }

    /**
     * List tags for a repository
     *
     * @param repository - Repository name
     * @param n - Maximum number of tags to return (optional)
     * @param last - Last tag from previous request for pagination (optional)
     * @returns TagsList containing repository name and array of tags
     *
     * @example
     * ```typescript
     * const tags = await client.listTags('library/nginx');
     * console.log(tags.tags); // ['latest', '1.21', '1.20', ...]
     *
     * // With pagination
     * const firstPage = await client.listTags('library/nginx', 10);
     * const secondPage = await client.listTags('library/nginx', 10, firstPage.tags[9]);
     * ```
     */
    public async listTags(
        repository: string,
        n?: number,
        last?: string,
    ): Promise<TagsList> {
        const url = new URL(`${this.baseUrl}/v2/${repository}/tags/list`);
        if (n !== undefined) {
            url.searchParams.set('n', String(n));
        }
        if (last !== undefined) {
            url.searchParams.set('last', last);
        }

        const headers = await this.buildHeaders();
        const response = await this.fetch(url.toString(), { headers });
        await this.handleResponse(response);

        return response.json() as Promise<TagsList>;
    }

    /**
     * Check if the registry supports the OCI Distribution API
     *
     * @returns Boolean indicating if the v2 API is supported
     *
     * @example
     * ```typescript
     * const isSupported = await client.checkVersion();
     * if (!isSupported) {
     *   throw new Error('Registry does not support OCI Distribution API v2');
     * }
     * ```
     */
    public async checkVersion(): Promise<boolean> {
        const url = `${this.baseUrl}/v2/`;
        const headers = await this.buildHeaders();

        const response = await this.fetch(url, { headers });
        return response.status === 200;
    }

    /**
     * Ping the registry to check connectivity and authentication
     *
     * Sends a GET request to the /v2/ endpoint and verifies the response is 200 OK.
     * This is useful for checking if the registry is reachable and if credentials are valid.
     *
     * @returns Promise that resolves if the registry responds with 200 OK
     * @throws Error if the registry is not reachable or returns a non-200 status
     *
     * @example
     * ```typescript
     * try {
     *   await client.ping();
     *   console.log('Registry is reachable');
     * } catch (error) {
     *   console.error('Registry is not reachable:', error);
     * }
     * ```
     */
    public async ping(): Promise<void> {
        const url = `${this.baseUrl}/v2/`;
        const headers = await this.buildHeaders();

        const response = await this.fetch(url, { headers });

        if (response.status !== 200) {
            throw new Error(
                `Registry ping failed: ${response.status} ${response.statusText}`,
            );
        }
    }

    /**
     * Build request headers with authentication
     */
    private async buildHeaders(
        additional?: Record<string, string>,
    ): Promise<Record<string, string>> {
        const headers: Record<string, string> = {
            'User-Agent': this.userAgent,
            ...additional,
        };

        // Add authentication headers
        if (
            this.bearerToken &&
            this.tokenExpiry &&
            Date.now() < this.tokenExpiry
        ) {
            headers.Authorization = `Bearer ${this.bearerToken}`;
        } else if (this.auth?.token) {
            headers.Authorization = `Bearer ${this.auth.token}`;
        } else if (this.auth?.identityToken) {
            headers.Authorization = `Bearer ${this.auth.identityToken}`;
        } else if (this.auth?.username && this.auth?.password) {
            const credentials = Buffer.from(
                `${this.auth.username}:${this.auth.password}`,
            ).toString('base64');
            headers.Authorization = `Basic ${credentials}`;
        }

        return headers;
    }

    /**
     * Wrapper around fetch to use the configured agent
     */
    private async fetch(
        url: string,
        options?: UndiciRequestInit,
    ): Promise<UndiciResponse> {
        const fetchOptions: UndiciRequestInit = {
            ...options,
            dispatcher: this.agent,
        };

        try {
            return await fetch(url, fetchOptions);
        } catch (error) {
            // Handle WWW-Authenticate challenge for token-based auth
            if (error instanceof Error && error.message.includes('401')) {
                // Try to handle auth challenge and retry
                await this.handleAuthChallenge(url);
                return await fetch(url, {
                    ...fetchOptions,
                    headers: await this.buildHeaders(
                        options?.headers as Record<string, string>,
                    ),
                });
            }
            throw error;
        }
    }

    /**
     * Handle authentication challenges (WWW-Authenticate)
     */
    private async handleAuthChallenge(url: string): Promise<void> {
        // First, make a request to get the auth challenge
        const response = await fetch(url, {
            dispatcher: this.agent,
            headers: {
                'User-Agent': this.userAgent,
            },
        });

        if (response.status === 401) {
            const wwwAuth = response.headers.get('WWW-Authenticate');
            if (wwwAuth && wwwAuth.startsWith('Bearer ')) {
                // Parse the challenge
                const challenge = this.parseAuthChallenge(wwwAuth);
                if (challenge.realm) {
                    // Request a token
                    await this.fetchBearerToken(
                        challenge.realm,
                        challenge.service,
                        challenge.scope,
                    );
                }
            }
        }
    }

    /**
     * Parse WWW-Authenticate challenge header
     */
    private parseAuthChallenge(header: string): {
        realm?: string;
        service?: string;
        scope?: string;
    } {
        const challenge: { realm?: string; service?: string; scope?: string } =
            {};

        // Remove "Bearer " prefix
        const params = header.substring(7);

        // Parse key="value" pairs
        const regex = /(\w+)="([^"]+)"/g;
        let match;
        while ((match = regex.exec(params)) !== null) {
            const key = match[1];
            const value = match[2];
            if (key === 'realm' || key === 'service' || key === 'scope') {
                challenge[key] = value;
            }
        }

        return challenge;
    }

    /**
     * Fetch a bearer token from the auth service
     */
    private async fetchBearerToken(
        realm: string,
        service?: string,
        scope?: string,
    ): Promise<void> {
        const url = new URL(realm);
        if (service) {
            url.searchParams.set('service', service);
        }
        if (scope) {
            url.searchParams.set('scope', scope);
        }

        const headers: Record<string, string> = {
            'User-Agent': this.userAgent,
        };

        // Add basic auth if credentials are provided
        if (this.auth?.username && this.auth?.password) {
            const credentials = Buffer.from(
                `${this.auth.username}:${this.auth.password}`,
            ).toString('base64');
            headers.Authorization = `Basic ${credentials}`;
        }

        const response = await fetch(url.toString(), {
            headers,
            dispatcher: this.agent,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch bearer token: ${response.status}`);
        }

        const tokenResponse = (await response.json()) as {
            token?: string;
            access_token?: string;
            expires_in?: number;
        };

        this.bearerToken = tokenResponse.token || tokenResponse.access_token;
        if (tokenResponse.expires_in) {
            this.tokenExpiry = Date.now() + tokenResponse.expires_in * 1000;
        }
    }

    /**
     * Handle response errors
     */
    private async handleResponse(response: UndiciResponse): Promise<void> {
        if (!response.ok) {
            let errorMessage = `Registry request failed: ${response.status} ${response.statusText}`;
            let errorCode = 'UNKNOWN';
            let detail: any = undefined;

            try {
                const contentType = response.headers.get('Content-Type');
                if (contentType?.includes('application/json')) {
                    const errorResponse =
                        (await response.json()) as RegistryErrorResponse;
                    if (
                        errorResponse.errors &&
                        errorResponse.errors.length > 0
                    ) {
                        const firstError = errorResponse.errors[0];
                        if (firstError) {
                            errorMessage = firstError.message;
                            errorCode = firstError.code;
                            detail = firstError.detail;
                        }
                    }
                }
            } catch {
                // Failed to parse error response, use default message
            }

            throw new RegistryError(
                errorMessage,
                errorCode,
                response.status,
                detail,
            );
        }
    }
}
