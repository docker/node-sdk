import { Writable } from 'stream';

// Logger handles container logs and calls a callback for each line
export class Logger extends Writable {
    private buffer: string = '';
    private callback: (line: string) => void;

    constructor(callback: (line: string) => void) {
        super({ objectMode: false });
        this.callback = callback;
    }

    override _write(
        chunk: any,
        encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ): void {
        try {
            this.buffer += chunk.toString();

            let newlineIndex;
            while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
                const line = this.buffer.substring(0, newlineIndex);
                this.buffer = this.buffer.substring(newlineIndex + 1);
                this.callback(line);
            }

            callback();
        } catch (error) {
            callback(error instanceof Error ? error : new Error(String(error)));
        }
    }

    override _final(callback: (error?: Error | null) => void): void {
        try {
            if (this.buffer.length > 0) {
                this.callback(this.buffer);
                this.buffer = '';
            }
            callback();
        } catch (error) {
            callback(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
