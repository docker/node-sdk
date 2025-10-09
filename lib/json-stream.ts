import { WritableStream } from 'node:stream/web';

export class JSONStream<T> extends WritableStream {
    private buffer: string = '';

    constructor(onJSON?: (jsonObj: T) => void) {
        super({
            write: (chunk: Uint8Array) => {
                this.processChunk(chunk, onJSON);
            },
            close: () => {
                if (this.buffer.trim() && onJSON) {
                    this.processLine(this.buffer.trim(), onJSON);
                }
            },
        });
    }

    private processChunk(
        chunk: Uint8Array,
        onJSON?: (jsonObj: any) => void,
    ): void {
        const text = new TextDecoder().decode(chunk);
        this.buffer += text;

        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim() && onJSON) {
                this.processLine(line.trim(), onJSON);
            }
        }
    }

    private processLine(line: string, onJSON: (jsonObj: any) => void): void {
        try {
            onJSON(JSON.parse(line) as T);
        } catch (error) {
            console.error(`Failed to parse JSON line: ${line}`, error);
        }
    }
}
