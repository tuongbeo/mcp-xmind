import type { XMindDocument, XMindTopic } from '../core/types.js';

export interface FuzzyMatchResult {
  matched: boolean;
  score: number;
}

export function fuzzyMatch(query: string, text: string): FuzzyMatchResult {
  // Callers are responsible for normalising case before calling this function.
  const q = query;
  const t = text;

  if (t === q) return { matched: true, score: 1.0 };
  if (t.includes(q)) return { matched: true, score: 0.8 };

  // Simple character-based fuzzy match
  let qi = 0;
  let matchCount = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      matchCount++;
      qi++;
    }
  }

  if (qi === q.length) {
    const score = (matchCount / t.length) * 0.6;
    return { matched: true, score };
  }

  return { matched: false, score: 0 };
}

export function fuzzyPath(doc: XMindDocument, pathQuery: string): XMindTopic | null {
  const segments = pathQuery.split('/').map((s) => s.trim().toLowerCase());

  for (const sheet of doc.sheets) {
    const result = searchTopicByPath(sheet.rootTopic, segments, 0);
    if (result) return result;
  }
  return null;
}

function searchTopicByPath(
  topic: XMindTopic,
  segments: string[],
  depth: number
): XMindTopic | null {
  if (depth >= segments.length) return null;

  // Normalise topic title to lowercase for comparison
  const { matched } = fuzzyMatch(segments[depth], topic.title.toLowerCase());
  if (!matched) return null;

  if (depth === segments.length - 1) return topic;

  for (const child of topic.children ?? []) {
    const found = searchTopicByPath(child, segments, depth + 1);
    if (found) return found;
  }

  return null;
}
