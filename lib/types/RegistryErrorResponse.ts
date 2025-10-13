/**
 * Registry error response
 */
export interface RegistryErrorResponse {
    errors: RegistryErrorItem[];
}

/**
 * Individual registry error
 */
export interface RegistryErrorItem {
    code: string;
    message: string;
    detail?: any;
}
