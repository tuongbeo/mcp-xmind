// src/utils/errors.ts — Typed MCP error responses

export type ErrorCode =
  | 'FILE_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'CANNOT_DELETE_ROOT'
  | 'CIRCULAR_REFERENCE'
  | 'LAST_SHEET'
  | 'INVALID_UPDATES'
  | 'CORRUPT_FILE'
  | 'FILE_TOO_LARGE'
  | 'PARSE_ERROR'
  | 'PARENT_NOT_FOUND'
  | 'SHEET_NOT_FOUND'
  | 'INVALID_POSITION'
  | 'INVALID_FILE';

export class XmindError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'XmindError';
  }

  toMcpContent(): { type: 'text'; text: string }[] {
    return [{ type: 'text', text: `[${this.code}] ${this.message}` }];
  }

  toMcpError(): { code: ErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export function isXmindError(err: unknown): err is XmindError {
  return err instanceof XmindError;
}
