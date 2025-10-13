import type { OCIRegistryDescriptor } from './Descriptor.js';

/**
 * OCI Image Manifest
 */
export interface OCIManifest {
    schemaVersion: number;
    mediaType?: string;
    config: OCIRegistryDescriptor;
    layers: OCIRegistryDescriptor[];
    annotations?: Record<string, string>;
}
