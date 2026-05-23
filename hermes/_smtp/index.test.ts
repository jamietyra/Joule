import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDryRun } from './index';

describe('Hermes SMTP DryRun', () => {
  let tmpDir: string;
  let outputPath: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hermes-test-'));
    outputPath = join(tmpDir, 'preview.html');
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    if (existsSync(outputPath)) unlinkSync(outputPath);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('send writes HTML to outputPath and logs JSON line', async () => {
    const client = createDryRun({ outputPath });
    await client.send({
      to: 'demo@example.com',
      subject: 'Joule Weekly Report',
      html: '<h1>Hello</h1><p>Top 3 calls</p>',
    });

    // 1. File written with exact HTML content
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath, 'utf-8')).toBe('<h1>Hello</h1><p>Top 3 calls</p>');

    // 2. console.log called with a JSON string containing mode, to, subject, outputPath
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logged = consoleSpy.mock.calls[0]?.[0] as string;
    expect(typeof logged).toBe('string');
    const parsed = JSON.parse(logged);
    expect(parsed.mode).toBe('dry-run');
    expect(parsed.to).toBe('demo@example.com');
    expect(parsed.subject).toBe('Joule Weekly Report');
    expect(parsed.outputPath).toBe(outputPath);
  });

  it('send preserves the exact HTML content for inspection', async () => {
    const client = createDryRun({ outputPath });
    const html = '<table><tr><td>Carbon: 2.5g</td></tr></table>';
    await client.send({ to: 'a@b.c', subject: 'X', html });
    expect(readFileSync(outputPath, 'utf-8')).toBe(html);
  });
});
