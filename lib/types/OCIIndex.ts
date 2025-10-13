import type { OCIRegistryDescriptor } from './Descriptor.js';

/**
 * OCI Image Index (manifest list)
 */
export interface OCIImageIndex {
    schemaVersion: number;
    mediaType?: string;
    manifests: OCIRegistryDescriptor[];
    annotations?: Record<string, string>;
}
