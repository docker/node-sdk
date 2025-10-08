import * as net from 'net';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client } from 'ssh2';

/**
 * SSH connection utilities for Docker remote access
 */
export class SSH {
    /**
     * Get SSH private key from common locations
     * @returns SSH private key buffer or undefined
     */
    private static async getPrivateKey(): Promise<Buffer | undefined> {
        const keyPaths = [
            path.join(os.homedir(), '.ssh', 'id_rsa'),
            path.join(os.homedir(), '.ssh', 'id_ed25519'),
            path.join(os.homedir(), '.ssh', 'id_ecdsa'),
        ];

        for (const keyPath of keyPaths) {
            try {
                return await fsPromises.readFile(keyPath);
            } catch (err) {
                // Continue to next key
            }
        }

        return undefined;
    }

    /**
     * Create a socket factory function for SSH connections that can be used with SocketAgent
     * @param sshHost SSH host string (e.g., "ssh://user@host:22/var/run/docker.sock")
     * @returns Function that creates new SSH socket connections
     */
    static async createSocketFactory(
        sshHost: string,
    ): Promise<() => net.Socket> {
        // Preload the private key asynchronously
        const privateKey = await SSH.getPrivateKey();

        // Parse SSH connection parameters once
        const sshUrl = sshHost.substring(6); // Remove "ssh://" prefix

        let user = 'root'; // Default user
        let host: string;
        let port = 22; // Default SSH port
        let socketPath = '/var/run/docker.sock'; // Default Docker socket path

        // Parse user@host part
        const atIndex = sshUrl.indexOf('@');
        let hostPart: string;

        if (atIndex !== -1) {
            user = sshUrl.substring(0, atIndex);
            hostPart = sshUrl.substring(atIndex + 1);
        } else {
            hostPart = sshUrl;
        }

        // Parse host:port/path part
        const slashIndex = hostPart.indexOf('/');
        let hostPortPart: string;

        if (slashIndex !== -1) {
            hostPortPart = hostPart.substring(0, slashIndex);
            socketPath = hostPart.substring(slashIndex);
        } else {
            hostPortPart = hostPart;
        }

        // Parse host:port part
        const colonIndex = hostPortPart.lastIndexOf(':');
        if (colonIndex !== -1) {
            host = hostPortPart.substring(0, colonIndex);
            port = parseInt(hostPortPart.substring(colonIndex + 1)) || 22;
        } else {
            host = hostPortPart;
        }

        // Return factory function that creates new SSH connections
        return () => {
            const conn = new Client();
            const sshStream = new net.Socket();

            conn.on('ready', () => {
                // Create a Unix socket connection through SSH
                conn.openssh_forwardOutStreamLocal(
                    socketPath,
                    (err, stream) => {
                        if (err) {
                            conn.end();
                            sshStream.emit(
                                'error',
                                new Error(
                                    `Failed to create SSH tunnel to ${socketPath}: ${err.message}`,
                                ),
                            );
                            return;
                        }

                        // Pipe the SSH stream to our socket wrapper
                        stream.pipe(sshStream);
                        sshStream.pipe(stream);

                        // Handle SSH connection cleanup
                        sshStream.on('close', () => {
                            conn.end();
                        });

                        sshStream.emit('connect');
                    },
                );
            });

            conn.on('error', (err) => {
                sshStream.emit(
                    'error',
                    new Error(
                        `SSH connection failed to ${user}@${host}:${port}: ${err.message}`,
                    ),
                );
            });

            // Connect using SSH key authentication (preloaded key)
            conn.connect({
                host,
                port,
                username: user,
                privateKey: privateKey,
                tryKeyboard: true,
            });

            return sshStream;
        };
    }
}
