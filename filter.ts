export class Filter {
  private data: Map<string, Set<string>> = new Map();

  set(key: string, values: string[]): void {
    this.data.set(key, new Set(values));
  }

  add(key: string, value: string): void {
    if (!this.data.has(key)) {
      this.data.set(key, new Set());
    }
    this.data.get(key)!.add(value);
  }

  get(key: string): string[] {
    const values = this.data.get(key);
    return values ? Array.from(values) : [];
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  keys(): string[] {
    return Array.from(this.data.keys());
  }

  toJSON(): Record<string, Record<string, boolean>> {
    const result: Record<string, Record<string, boolean>> = {};
    
    for (const [key, values] of this.data) {
      result[key] = {};
      for (const value of values) {
        result[key][value] = true;
      }
    }
    
    return result;
  }

  toURLParameter(): string {
    return JSON.stringify(this.toJSON());
  }

}