import * as net from 'net';
import * as http from 'http';
import * as stream from 'stream';

/**
 * HTTP Agent that creates socket connections using a provided factory function.
 * This allows flexible socket creation strategies while supporting connection pooling.
 */
export class SocketAgent extends http.Agent {
    private socketFactory: () => net.Socket;

    constructor(createSocketFn: () => net.Socket) {
        super({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: Infinity,
            maxFreeSockets: 10,
            maxTotalSockets: Infinity,
            timeout: 120000,
            scheduling: 'lifo',
        });

        this.socketFactory = createSocketFn;

        // Override createConnection to use our socket factory
        this.createConnection = (
            options: any,
            callback?: (err: Error | null, socket?: stream.Duplex) => void,
        ): stream.Duplex => {
            const socket = this.socketFactory();
            socket.setNoDelay(true);
            socket.setKeepAlive(true, 30000);
            socket.setTimeout(0);

            if (callback) {
                const onConnect = () => {
                    socket.removeListener('error', onError);
                    callback(null, socket);
                };

                const onError = (error: Error) => {
                    socket.removeListener('connect', onConnect);
                    callback(error);
                };

                socket.once('connect', onConnect);
                socket.once('error', onError);
            }

            return socket;
        };
    }
}
