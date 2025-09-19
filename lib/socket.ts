import * as net from 'net';
import * as http from 'http';
import * as stream from 'stream';

/**
 * Custom HTTP Agent that reuses an existing socket connection.
 * This agent is designed to work with persistent socket connections
 * like Unix domain sockets or long-lived TCP connections.
 */
export class SocketReuseAgent extends http.Agent {
    private socket: net.Socket;

    constructor(socket: net.Socket) {
        super({
            keepAlive: true,
            keepAliveMsecs: 0,
            maxSockets: Infinity,
            maxFreeSockets: 1,
        });

        this.socket = socket;
    }

    createConnection(options: any, callback?: any): stream.Duplex {
        // Ensure our socket is properly configured for HTTP
        this.socket.setNoDelay(true);
        this.socket.setKeepAlive(true);

        if (callback) {
            process.nextTick(callback, null, this.socket);
        }

        return this.socket;
    }
}
