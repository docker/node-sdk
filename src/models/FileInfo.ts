export class FileInfo {
    name: string;
    size: number;
    mode: number;
    mtime: Date;
    linkTarget: string;

    constructor(
        name: string,
        size: number,
        mode: number,
        mtime: Date,
        linkTarget: string
    ) {
        this.name = name;
        this.size = size;
        this.mode = mode;
        this.mtime = mtime;
        this.linkTarget = linkTarget;
    }

    static fromJSON(s: string): FileInfo {
        const json = JSON.parse(s);
        return new FileInfo(
            json.name,
            json.size,
            json.mode,
            new Date(json.mtime),
            json.linkTarget
        );
    }
}