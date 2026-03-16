// ============================================================
// Core Type Definitions for XMind MCP Server
// ============================================================

export type LayoutType = 'map' | 'org-chart' | 'fishbone' | 'timeline' | 'tree-table';

export interface XMindTask {
  due?: string;        // ISO date
  assignee?: string;
  priority?: 1 | 2 | 3;
  progress?: number;   // 0-100
  status?: 'todo' | 'in-progress' | 'done';
}

export interface XMindTopic {
  id: string;
  title: string;
  children?: XMindTopic[];
  notes?: { plain?: string; html?: string };
  labels?: string[];
  markers?: string[];           // Format: "Category.name" e.g. "Task.done"
  callout?: string;
  boundary?: { range: string; title?: string };
  summary?: { range: string; title: string };
  href?: string;                // Internal link: "xmind:#<topicId>"
  image?: string;               // Base64 or URL
  tasks?: XMindTask;
  branch?: 'folded' | 'open';
  structureClass?: string;      // "org.xmind.ui.fishbone.leftHeaded" etc.
}

export interface XMindRelationship {
  id: string;
  end1Id: string;
  end2Id: string;
  title?: string;
}

export interface XMindSheet {
  id: string;
  title: string;
  rootTopic: XMindTopic;
  relationships?: XMindRelationship[];
  theme?: string;
  layout?: LayoutType;
}

export interface XMindDocument {
  sheets: XMindSheet[];
}

export interface ExportMarkdownOptions {
  sheetIndex?: number;
  depth?: number;
  includeNotes?: boolean;
  includeTasks?: boolean;
}

export interface ExportJsonOptions {
  pretty?: boolean;
  includeMetadata?: boolean;
}

export interface ExportHtmlOptions {
  sheetIndex?: number;
  style?: 'outline' | 'tree' | 'table';
  includeNotes?: boolean;
}

export interface FileMetadata {
  fileName: string;
  fileKey: string;
  fileSize: number;
  sheetCount: number;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  topic: XMindTopic;
  path: string[];
  score: number;
  sheetIndex: number;
}

export interface TaskResult {
  topic: string;
  path: string[];
  task: XMindTask;
  sheetIndex: number;
}
