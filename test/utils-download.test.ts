/**
 * imageToInlineData, URL branch (P6 review finding #1). The README says downloads
 * are checked by content type AND magic bytes; 1.x checked only the header.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));

import { lookup } from 'dns/promises';
import axios from 'axios';
import { imageToInlineData } from '../src/utils.js';

// A complete 1x1 PNG (file-type needs more than the 8-byte signature).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

function serve(body: Buffer, contentType: string): void {
  (axios.get as Mock).mockResolvedValue({ data: body, headers: { 'content-type': contentType } });
}

describe('imageToInlineData: URL downloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lookup as Mock).mockResolvedValue({ address: '93.184.216.34', family: 4 });
  });

  it('accepts an image whose bytes match an allowed type', async () => {
    serve(PNG, 'image/png');
    const result = await imageToInlineData('https://example.com/a.png');
    expect(result).toEqual({ mimeType: 'image/png', data: PNG.toString('base64') });
  });

  it('rejects a non-image body served as image/png', async () => {
    serve(Buffer.from('<html>not an image</html>'), 'image/png');
    await expect(imageToInlineData('https://example.com/a.png')).rejects.toThrow(/not a valid image.*unrecognised/);
  });

  it('sends the detected type, not the header, when they disagree', async () => {
    serve(JPEG, 'image/png');
    const result = await imageToInlineData('https://example.com/a.png');
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('still rejects a disallowed Content-Type before sniffing', async () => {
    serve(PNG, 'text/html');
    await expect(imageToInlineData('https://example.com/a.png')).rejects.toThrow('Invalid Content-Type');
  });
});
