import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** every .ts file under a directory */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('the pixel font', () => {
  it('has every letter the app writes (else: python3 tools/font_subset.py)', () => {
    const want = new Set<string>();
    for (const f of [...sources('src'), 'index.html', 'public/manifest.webmanifest'])
      for (const c of readFileSync(f, 'utf8')) if (c.codePointAt(0)! > 0x7f && !/\s/.test(c)) want.add(c);
    const have = new Set(readFileSync('src/fonts/window-pixel.txt', 'utf8').trim());
    expect([...want].filter((c) => !have.has(c)).join('')).toBe('');
  });
});
