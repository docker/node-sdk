function isObject(value: unknown): value is object {
    return value !== null && typeof value === 'object';
}

export function isFileNotFoundError(error: unknown): boolean {
    return isObject(error) && 'code' in error && error.code === 'ENOENT';
}

export function getErrorMessage(error: unknown): string | undefined {
    if (!error) {
        return;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (error instanceof Error) {
        return error.message;
    }
    if (
        isObject(error) &&
        'message' in error &&
        typeof error.message === 'string'
    ) {
        return error.message;
    }
    return;
}

export function parseIntWithDefault(
    value: string | undefined,
    defaultValue: number,
): number {
    if (value === undefined) {
        return defaultValue;
    }
    const number = parseInt(value);
    return Number.isNaN(number) ? defaultValue : number;
}

export function parseDockerHost(
    dockerHost: string,
    defaultPort: number,
): { host: string; port: number } {
    const tcpAddress = dockerHost.substring(6); // Remove "tcp://" prefix
    const [host, portStr] = tcpAddress.split(':');
    if (!host) {
        throw new Error(`Invalid Docker host: ${dockerHost}`);
    }
    const port = parseIntWithDefault(portStr, defaultPort);
    return { host, port };
}
