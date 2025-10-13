/**
 * Platform describes the platform which the image is built for
 */
export interface RegistryPlatform {
    architecture: string;
    os: string;
    'os.version'?: string;
    'os.features'?: string[];
    variant?: string;
}
