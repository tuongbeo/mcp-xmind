// src/tools/_shared.ts — helpers used by all write tools
import { KVAdapter } from '../storage/kv-adapter.js';
import { parseXmindBuffer } from '../core/xmind-parser.js';
import { buildXmindFile } from '../core/xmind-builder.js';
import { countNodes } from '../core/xmind-mutator.js';
import { XmindError } from '../utils/errors.js';
import type { XMindDocument, FileMetadata } from '../core/types.js';
import { v4 as uuidv4 } from 'uuid';

export async function readDoc(kv: KVAdapter, fileKey: string): Promise<XMindDocument> {
  const buf = await kv.getFile(fileKey);
  if (!buf) throw new XmindError('FILE_NOT_FOUND', `File not found: ${fileKey}`);
  return parseXmindBuffer(buf);
}

export async function persistDoc(
  kv: KVAdapter,
  doc: XMindDocument,
  outputKey: string
): Promise<void> {
  const built = buildXmindFile(doc);
  await kv.putFile(outputKey, built);
  const meta: FileMetadata = {
    fileName: outputKey.split('/').pop() ?? outputKey,
    fileKey: outputKey,
    fileSize: built.byteLength,
    sheetCount: doc.sheets.length,
    nodeCount: countNodes(doc),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await kv.index(outputKey, meta);
}

export function outputKey(fileKey: string, outputFileName?: string): string {
  return outputFileName ? `${uuidv4()}/${outputFileName}` : fileKey;
}
