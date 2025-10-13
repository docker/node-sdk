import type { RegistryPlatform } from './RegistryPlatform.js';

/**
 * OCI Registry Descriptor represents content addressable content
 */
export interface OCIRegistryDescriptor {
    mediaType: string;
    digest: string;
    size: number;
    urls?: string[];
    annotations?: Record<string, string>;
    platform?: RegistryPlatform;
}
