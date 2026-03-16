import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

export function unzipXmind(buffer: ArrayBuffer): Record<string, Uint8Array> {
  const uint8 = new Uint8Array(buffer);
  return unzipSync(uint8);
}

export function buildXmindZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const zipFiles: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    zipFiles[name] = typeof content === 'string' ? strToU8(content) : content;
  }
  return zipSync(zipFiles);
}

export function extractContentJson(buffer: ArrayBuffer): unknown {
  const files = unzipXmind(buffer);
  if ('content.json' in files) {
    const text = strFromU8(files['content.json']);
    return JSON.parse(text) as unknown;
  }
  if ('content.xml' in files) {
    return { __xml: strFromU8(files['content.xml']) };
  }
  throw new Error('No content.json or content.xml found in .xmind file');
}
