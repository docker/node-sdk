import type { Response } from 'undici';

// jsonMessages processes a response stream with newline-delimited JSON messages and yields each parsed message.
export async function* jsonMessages<T>(
    response: Response,
): AsyncGenerator<T, void, undefined> {
    if (!response.body) {
        throw new Error('No response body');
    }

    // Extract charset from Content-Type header, default to utf-8
    const contentType = response.headers.get('content-type') || '';
    const charsetMatch = contentType.match(/charset=([^;]+)/i);
    let charset = 'utf-8';
    if (charsetMatch && charsetMatch[1]) {
        charset = charsetMatch[1].trim();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder(charset);
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine !== '') {
                    try {
                        yield JSON.parse(trimmedLine) as T;
                    } catch (error) {
                        console.warn(
                            'Failed to parse JSON line:',
                            trimmedLine,
                            error,
                        );
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim() !== '') {
            try {
                yield JSON.parse(buffer.trim()) as T;
            } catch (error) {
                console.warn('Failed to parse final JSON line:', buffer, error);
            }
        }
    } finally {
        reader.releaseLock();
    }
}
