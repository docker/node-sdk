import * as fs from 'fs';
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
    static loadCertificates(certPath: string): SecureContextOptions {
        const tlsOptions: SecureContextOptions = {};

        try {
            // Load CA certificate
            const caPath = path.join(certPath, 'ca.pem');
            if (fs.existsSync(caPath)) {
                tlsOptions.ca = fs.readFileSync(caPath);
            }

            // Load client certificate
            const certPemPath = path.join(certPath, 'cert.pem');
            if (fs.existsSync(certPemPath)) {
                tlsOptions.cert = fs.readFileSync(certPemPath);
            }

            // Load client private key
            const keyPath = path.join(certPath, 'key.pem');
            if (fs.existsSync(keyPath)) {
                tlsOptions.key = fs.readFileSync(keyPath);
            }

            return tlsOptions;
        } catch (error) {
            throw new Error(
                `Failed to load TLS certificates from ${certPath}: ${getErrorMessage(error)}`,
            );
        }
    }
}
