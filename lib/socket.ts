import { Agent } from 'undici';
import { type Socket } from 'node:net';

/**
 * HTTP Agent that creates socket connections using a provided factory function.
 * This allows flexible socket creation strategies while supporting connection pooling.
 */
export class SocketAgent extends Agent {
    constructor(createSocketFn: () => Socket) {
        super({
            connect: (options, callback) => {
                const socket = createSocketFn();

                socket.on('connect', () => {
                    callback(null, socket);
                });

                socket.on('error', (err) => {
                    callback(err, null);
                });

                return socket;
            },
        });
    }
}
