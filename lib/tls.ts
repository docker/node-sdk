import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { getErrorMessage } from './util.js';
import type { SecureContextOptions } from 'tls';

/**
 * TLS certificate utilities for secure Docker connections
 */
export class TLS {
    /**
     * Load TLS certificates from a directory
     * @param certPath Path to directory containing ca.pem, cert.pem, and key.pem files
     * @returns TLS options object for HTTPS agent
     */
    static async loadCertificates(
        certPath: string,
    ): Promise<SecureContextOptions> {
        const tlsOptions: SecureContextOptions = {};

        try {
            // Load CA certificate
            const caPath = path.join(certPath, 'ca.pem');
            try {
                tlsOptions.ca = await fsPromises.readFile(caPath);
            } catch {
                // CA certificate is optional
            }

            // Load client certificate
            const certPemPath = path.join(certPath, 'cert.pem');
            try {
                tlsOptions.cert = await fsPromises.readFile(certPemPath);
            } catch {
                // Client certificate is optional
            }

            // Load client private key
            const keyPath = path.join(certPath, 'key.pem');
            try {
                tlsOptions.key = await fsPromises.readFile(keyPath);
            } catch {
                // Private key is optional
            }

            return tlsOptions;
        } catch (error) {
            throw new Error(
                `Failed to load TLS certificates from ${certPath}: ${getErrorMessage(error)}`,
            );
        }
    }
}
