// test/fixtures/generate.ts
// Run once to build deterministic .xmind test fixtures
import { buildXmindFile } from '../../src/core/xmind-builder.js';
import type { XMindDocument, XMindTopic } from '../../src/core/types.js';

function topic(id: string, title: string, children?: XMindTopic[]): XMindTopic {
  return { id, title, ...(children ? { children } : {}) };
}

export const simpleDoc: XMindDocument = {
  sheets: [{
    id: 'sheet-0',
    title: 'Simple Sheet',
    rootTopic: topic('fixture-0-0-0', 'Root Topic', [
      topic('fixture-0-1-0', 'Child A', [
        topic('fixture-0-2-0', 'Grandchild', []),
      ]),
      topic('fixture-0-1-1', 'Child B', [
        topic('fixture-0-2-1', 'Leaf', []),
      ]),
    ]),
  }],
};

function makeSheet(sheetIdx: number): XMindDocument['sheets'][0] {
  return {
    id: `sheet-${sheetIdx}`,
    title: `Sheet ${sheetIdx + 1}`,
    rootTopic: topic(`fixture-${sheetIdx}-0-0`, `Root ${sheetIdx + 1}`, [
      topic(`fixture-${sheetIdx}-1-0`, `Topic A${sheetIdx + 1}`, [
        topic(`fixture-${sheetIdx}-2-0`, `Sub A${sheetIdx + 1}`),
      ]),
      topic(`fixture-${sheetIdx}-1-1`, `Topic B${sheetIdx + 1}`),
    ]),
  };
}

export const multiSheetDoc: XMindDocument = {
  sheets: [makeSheet(0), makeSheet(1), makeSheet(2)],
};

export const withTasksDoc: XMindDocument = {
  sheets: [{
    id: 'sheet-tasks',
    title: 'Tasks Sheet',
    rootTopic: {
      id: 'fixture-t-0-0',
      title: 'Project Plan',
      children: [
        { id: 'fixture-t-1-0', title: 'Design Phase', tasks: { status: 'done', priority: 1, progress: 100 },
          children: [{ id: 'fixture-t-2-0', title: 'Wireframes', tasks: { status: 'done' } }] },
        { id: 'fixture-t-1-1', title: 'Development Phase', tasks: { status: 'in-progress', priority: 2, progress: 45 },
          children: [
            { id: 'fixture-t-2-1', title: 'API', tasks: { status: 'done' } },
            { id: 'fixture-t-2-2', title: 'UI', tasks: { status: 'in-progress', assignee: 'alice' } },
            { id: 'fixture-t-2-3', title: 'Testing', tasks: { status: 'todo', due: '2025-06-01' } },
          ] },
        { id: 'fixture-t-1-2', title: 'Launch', tasks: { status: 'todo', priority: 3 } },
      ],
    },
  }],
};

export const withRelationshipsDoc: XMindDocument = {
  sheets: [{
    id: 'sheet-rels', title: 'Relationships Sheet',
    rootTopic: topic('fixture-r-0-0', 'System', [
      topic('fixture-r-1-0', 'Frontend'),
      topic('fixture-r-1-1', 'Backend'),
      topic('fixture-r-1-2', 'Database'),
      topic('fixture-r-1-3', 'Auth Service'),
    ]),
    relationships: [
      { id: 'rel-0', end1Id: 'fixture-r-1-0', end2Id: 'fixture-r-1-1', title: 'calls' },
      { id: 'rel-1', end1Id: 'fixture-r-1-1', end2Id: 'fixture-r-1-2', title: 'queries' },
      { id: 'rel-2', end1Id: 'fixture-r-1-0', end2Id: 'fixture-r-1-3', title: 'authenticates via' },
    ],
  }],
};

export const fixtures = {
  simple: buildXmindFile(simpleDoc),
  multiSheet: buildXmindFile(multiSheetDoc),
  withTasks: buildXmindFile(withTasksDoc),
  withRelationships: buildXmindFile(withRelationshipsDoc),
};
