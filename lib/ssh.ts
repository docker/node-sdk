import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client } from 'ssh2';

/**
 * SSH connection utilities for Docker remote access
 */
export class SSH {
    /**
     * Create an SSH connection to a remote Docker daemon
     * @param sshHost SSH host string (e.g., "ssh://user@host:22/var/run/docker.sock")
     * @returns Promise that resolves to a connected socket through SSH tunnel
     */
    static createConnection(sshHost: string): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            // Parse SSH URL: ssh://[user@]host[:port][/path/to/socket]
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

            const conn = new Client();

            conn.on('ready', () => {
                // Create a Unix socket connection through SSH
                conn.openssh_forwardInStreamLocal(socketPath, (err, stream) => {
                    if (err) {
                        conn.end();
                        reject(
                            new Error(
                                `Failed to create SSH tunnel to ${socketPath}: ${err.message}`,
                            ),
                        );
                        return;
                    }

                    // Wrap the SSH stream as a net.Socket
                    const socket = stream as any as net.Socket;

                    // Handle SSH connection cleanup
                    socket.on('close', () => {
                        conn.end();
                    });

                    resolve(socket);
                });
            });

            conn.on('error', (err) => {
                reject(
                    new Error(
                        `SSH connection failed to ${user}@${host}:${port}: ${err.message}`,
                    ),
                );
            });

            // Connect using SSH key authentication (looks for default keys)
            // TODO: Add support for password authentication and custom key paths
            conn.connect({
                host,
                port,
                username: user,
                // Try common SSH key locations
                privateKey: SSH.getPrivateKey(),
                tryKeyboard: true,
            });
        });
    }

    /**
     * Get SSH private key from common locations
     * @returns SSH private key buffer or undefined
     */
    private static getPrivateKey(): Buffer | undefined {
        const keyPaths = [
            path.join(os.homedir(), '.ssh', 'id_rsa'),
            path.join(os.homedir(), '.ssh', 'id_ed25519'),
            path.join(os.homedir(), '.ssh', 'id_ecdsa'),
        ];

        for (const keyPath of keyPaths) {
            try {
                if (fs.existsSync(keyPath)) {
                    return fs.readFileSync(keyPath);
                }
            } catch (err) {
                // Continue to next key
            }
        }

        return undefined;
    }
}
