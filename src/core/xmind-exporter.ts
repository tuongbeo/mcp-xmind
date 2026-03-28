import type {
  XMindDocument,
  XMindSheet,
  XMindTopic,
  ExportMarkdownOptions,
  ExportJsonOptions,
  ExportHtmlOptions,
} from './types.js';

export function exportToMarkdown(doc: XMindDocument, opts: ExportMarkdownOptions = {}): string {
  const { sheetIndex, depth = 6, includeNotes = false, includeTasks = false } = opts;
  const sheets = sheetIndex !== undefined ? [doc.sheets[sheetIndex]].filter(Boolean) : doc.sheets;
  return sheets.map((sheet) => renderSheetMarkdown(sheet, depth, includeNotes, includeTasks)).join('\n\n---\n\n');
}

function renderSheetMarkdown(sheet: XMindSheet, maxDepth: number, includeNotes: boolean, includeTasks: boolean): string {
  const lines: string[] = [`# ${sheet.title}`];
  renderTopicMarkdown(sheet.rootTopic, 2, maxDepth, includeNotes, includeTasks, lines);
  return lines.join('\n');
}

function renderTopicMarkdown(topic: XMindTopic, level: number, maxDepth: number, includeNotes: boolean, includeTasks: boolean, lines: string[]): void {
  const prefix = level <= maxDepth ? '#'.repeat(level) : '-';
  lines.push(`${prefix} ${topic.title}`);
  if (includeNotes && topic.notes?.plain) lines.push(`> ${topic.notes.plain}`);
  if (includeTasks && topic.tasks) {
    const t = topic.tasks;
    const check = t.status === 'done' ? '[x]' : '[ ]';
    lines.push(`- ${check} ${topic.title}${t.due ? ` (due: ${t.due})` : ''}${t.assignee ? ` @${t.assignee}` : ''}`);
  }
  for (const child of topic.children ?? []) renderTopicMarkdown(child, level + 1, maxDepth, includeNotes, includeTasks, lines);
}

export function exportToJson(doc: XMindDocument, opts: ExportJsonOptions = {}): string {
  const { pretty = true, includeMetadata = false } = opts;
  const output: Record<string, unknown> = { sheets: doc.sheets };
  if (includeMetadata) output.metadata = { sheetCount: doc.sheets.length, exportedAt: new Date().toISOString() };
  return JSON.stringify(output, null, pretty ? 2 : undefined);
}

export function exportToHtml(doc: XMindDocument, opts: ExportHtmlOptions = {}): string {
  const { sheetIndex, style = 'tree', includeNotes = false } = opts;
  const sheets = sheetIndex !== undefined ? [doc.sheets[sheetIndex]].filter(Boolean) : doc.sheets;
  const body = sheets.map((sheet) => renderSheetHtml(sheet, style, includeNotes)).join('\n');
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>XMind Export</title>\n<style>\n  body{font-family:system-ui,sans-serif;margin:2rem;color:#333}\n  h1{color:#1a1a2e;border-bottom:2px solid #4a90d9;padding-bottom:.5rem}\n  details{margin:.25rem 0} summary{cursor:pointer;padding:.2rem .4rem;border-radius:4px}\n  summary:hover{background:#f0f4ff} .node-leaf{padding:.2rem .4rem;margin:.1rem 0}\n  .notes{color:#666;font-style:italic;font-size:.9em;margin-left:1rem}\n  ul{list-style:disc;padding-left:1.5rem}\n  table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:.4rem .8rem;text-align:left}\n  th{background:#f5f5f5}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>`;
}

function renderSheetHtml(sheet: XMindSheet, style: 'outline' | 'tree' | 'table', includeNotes: boolean): string {
  if (style === 'table') return renderTableHtml(sheet);
  if (style === 'outline') return renderOutlineHtml(sheet, includeNotes);
  return renderTreeHtml(sheet, includeNotes);
}

function renderTreeHtml(sheet: XMindSheet, includeNotes: boolean): string {
  return `<section>\n<h1>${esc(sheet.title)}</h1>\n${renderTopicTree(sheet.rootTopic, includeNotes)}\n</section>`;
}

function renderTopicTree(topic: XMindTopic, includeNotes: boolean): string {
  const notes = includeNotes && topic.notes?.plain ? `<div class="notes">${esc(topic.notes.plain)}</div>` : '';
  if (!topic.children?.length) return `<div class="node-leaf">${esc(topic.title)}${notes}</div>`;
  const children = topic.children.map((c) => renderTopicTree(c, includeNotes)).join('\n');
  return `<details open>\n<summary>${esc(topic.title)}${notes}</summary>\n${children}\n</details>`;
}

function renderOutlineHtml(sheet: XMindSheet, includeNotes: boolean): string {
  return `<section>\n<h1>${esc(sheet.title)}</h1>\n<ul>\n${renderTopicOutline(sheet.rootTopic, includeNotes)}\n</ul>\n</section>`;
}

function renderTopicOutline(topic: XMindTopic, includeNotes: boolean): string {
  const notes = includeNotes && topic.notes?.plain ? ` <em>${esc(topic.notes.plain)}</em>` : '';
  if (!topic.children?.length) return `<li>${esc(topic.title)}${notes}</li>`;
  const children = topic.children.map((c) => renderTopicOutline(c, includeNotes)).join('\n');
  return `<li>${esc(topic.title)}${notes}\n<ul>\n${children}\n</ul>\n</li>`;
}

function renderTableHtml(sheet: XMindSheet): string {
  const rows: string[] = [];
  collectTableRows(sheet.rootTopic, [], rows);
  const tableRows = rows.map((row) => `<tr><td>${row}</td></tr>`).join('\n');
  return `<section>\n<h1>${esc(sheet.title)}</h1>\n<table>\n<thead><tr><th>Topic</th></tr></thead>\n<tbody>\n${tableRows}\n</tbody>\n</table>\n</section>`;
}

function collectTableRows(topic: XMindTopic, path: string[], rows: string[]): void {
  rows.push(esc([...path, topic.title].join(' › ')));
  for (const child of topic.children ?? []) collectTableRows(child, [...path, topic.title], rows);
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Mindmap renderer ─────────────────────────────────────────────────────────

export interface ToMarkmapOptions {
  maxDepth?: number;
  includeNotes?: boolean;
  includeTasks?: boolean;
}

export function toMarkmapMarkdown(sheet: XMindSheet, opts: ToMarkmapOptions = {}): string {
  const { maxDepth = Infinity, includeNotes = false, includeTasks = true } = opts;
  const lines: string[] = [];
  function walk(topic: XMindTopic, depth: number): void {
    if (depth > maxDepth) return;
    const heading = depth <= 6 ? '#'.repeat(depth) : '-';
    let line = `${heading} ${topic.title}`;
    if (includeTasks && topic.tasks?.status) {
      const icon: Record<string, string> = { todo: '☐', 'in-progress': '◑', done: '☑' };
      line += ` ${icon[topic.tasks.status] ?? ''}`;
    }
    if (topic.markers?.length) line += `  <!-- markers: ${topic.markers.join(', ')} -->`;
    lines.push(line);
    if (includeNotes && topic.notes?.plain) {
      const preview = topic.notes.plain.slice(0, 80).replace(/\n/g, ' ');
      lines.push(`${'  '.repeat(Math.min(depth, 6))}*${preview}*`);
    }
    for (const child of topic.children ?? []) walk(child, depth + 1);
  }
  walk(sheet.rootTopic, 1);
  return lines.join('\n');
}

export interface BuildMarkmapHtmlOpts {
  theme?: 'default' | 'colorful' | 'dark' | 'forest';
  maxWidth?: number;
  xmindBase64?: string;
  fileName?: string;
}

/**
 * Build a self-contained SVG mind map HTML — ZERO external dependencies.
 *
 * All previous approaches (markmap-autoloader, markmap-lib, markmap-view)
 * fail in Claude's sandboxed artifact iframe with:
 *   "Cannot read properties of undefined (reading 'markmap')"
 * because their module graphs reference opts.markmap during init.
 *
 * This renderer uses only vanilla JS + SVG:
 *   - Parse ATX headings → node tree (no YAML, no remark)
 *   - Horizontal tree layout algorithm (pure JS, no D3)
 *   - Pan & zoom via pointer events + SVG transform
 *   - Click node to collapse/expand subtrees
 *   - Depth-based colours from theme palette
 *   - Download .xmind button (base64 embedded, offline-capable)
 */
export function buildMarkmapHtml(
  markdown: string,
  title: string,
  opts: BuildMarkmapHtmlOpts = {}
): string {
  const { theme = 'default', xmindBase64, fileName } = opts;

  const colorMap: Record<string, string[]> = {
    default:  ['#534AB7', '#1D9E75', '#185FA5', '#BA7517', '#993556', '#0F6E56'],
    colorful: ['#E24B4A', '#534AB7', '#1D9E75', '#185FA5', '#D4537E', '#BA7517'],
    dark:     ['#7F77DD', '#5DCAA5', '#378ADD', '#EF9F27', '#D4537E', '#9FE1CB'],
    forest:   ['#1D9E75', '#0F6E56', '#3B6D11', '#639922', '#085041', '#04342C'],
  };
  const palette = JSON.stringify(colorMap[theme] ?? colorMap.default);

  const safeTitle = esc(title);
  const safeFileName = esc(fileName ?? `${title}.xmind`);
  const safeMd = markdown.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  const dlBtn = xmindBase64
    ? `<button class="dl" onclick="dl()">&#8615; Download .xmind</button>`
    : '';
  const dlFn = xmindBase64
    ? `function dl(){var b='${xmindBase64}',n=atob(b),a=new Uint8Array(n.length);for(var i=0;i<n.length;i++)a[i]=n.charCodeAt(i);var bl=new Blob([a],{type:'application/octet-stream'}),u=URL.createObjectURL(bl),l=document.createElement('a');l.href=u;l.download='${safeFileName}';document.body.appendChild(l);l.click();document.body.removeChild(l);URL.revokeObjectURL(u);}`
    : 'function dl(){}';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${safeTitle}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#fafaf9;display:flex;flex-direction:column;height:100vh;overflow:hidden}
.bar{height:44px;flex-shrink:0;display:flex;align-items:center;gap:10px;padding:0 14px;background:#fff;border-bottom:1px solid #e5e5e3;font-size:13px;color:#6b6b66}
.badge{padding:2px 8px;background:#EEEDFE;color:#3C3489;border-radius:10px;font-size:11px}
.ttl{font-weight:500;color:#1a1a18}.hint{color:#aaa9a3;font-size:12px}.sp{flex:1}
.dl{padding:4px 12px;border-radius:6px;border:1px solid #d4d4d0;background:#f5f5f3;color:#333;font-size:12px;cursor:pointer}
.dl:hover{background:#eaeae8}
#cv{flex:1;cursor:grab;touch-action:none;display:block;width:100%;height:100%}
#cv.gr{cursor:grabbing}
</style></head>
<body>
<div class="bar">
  <span class="badge">XMind</span>
  <span class="ttl">${safeTitle}</span>
  <span class="hint">Scroll=zoom &middot; Drag=pan &middot; Click&#9679;=collapse</span>
  <span class="sp"></span>
  ${dlBtn}
</div>
<svg id="cv"><g id="g"></g></svg>
<script>
${dlFn}
(function(){
var PAL=${palette};
var ROW=34,COL=190,PX=14,PY=8,R=5;
var SVG='http://www.w3.org/2000/svg';

function mk(tag,a){var e=document.createElementNS(SVG,tag);for(var k in a)e.setAttribute(k,a[k]);return e;}

// parse markdown headings -> tree
function parse(md){
  var lines=md.trim().split('\\n');
  var root={t:'root',ch:[],d:0,_c:false};
  var stk=[{n:root,d:0}];
  lines.forEach(function(l){
    var m=l.match(/^(#{1,6})\\s+(.*)/);
    if(!m)return;
    var d=m[1].length,node={t:m[2].trim(),ch:[],d:d,_c:false};
    while(stk.length>1&&stk[stk.length-1].d>=d)stk.pop();
    stk[stk.length-1].n.ch.push(node);
    stk.push({n:node,d:d});
  });
  return root.ch[0]||root;
}

// measure text (canvas fallback)
var _ctx=(function(){try{return document.createElement('canvas').getContext('2d');}catch(e){return null;}})();
function tw(s){if(_ctx){_ctx.font='13px system-ui,sans-serif';return _ctx.measureText(s).width||s.length*7;}return s.length*7;}

// layout
function layout(root){
  var rows=[];
  function cnt(n){if(n._c||!n.ch.length){rows.push(n);return 1;}var t=0;n.ch.forEach(function(c){t+=cnt(c);});return t;}
  cnt(root);
  rows.forEach(function(n,i){n._y=i*ROW;});
  function sy(n){if(n._c||!n.ch.length)return;n.ch.forEach(sy);n._y=(n.ch[0]._y+n.ch[n.ch.length-1]._y)/2;}
  sy(root);
  function sx(n,d){n._x=d*COL;n._w=tw(n.t)+PX*2;if(!n._c)n.ch.forEach(function(c){sx(c,d+1);});}
  sx(root,0);
}

// render
function render(root){
  layout(root);
  var g=document.getElementById('g');
  g.innerHTML='';
  var mx=0,my=0;
  function draw(n,par){
    if(par){
      var lx1=par._x+par._w,lx2=n._x,mx2=(lx1+lx2)/2;
      g.insertBefore(mk('path',{fill:'none',stroke:'#ccc','stroke-width':'1.5',
        d:'M'+lx1+','+par._y+'C'+mx2+','+par._y+' '+mx2+','+n._y+' '+lx2+','+n._y}),g.firstChild);
    }
    var depth=n.d-1,ci=depth<0?0:depth%PAL.length,col=PAL[ci];
    var bh=26,ry=bh/2;
    var grp=mk('g',{});
    var rect=mk('rect',{x:n._x,y:n._y-ry,width:n._w,height:bh,rx:ry,
      fill:depth<=0?col:'#fff',stroke:col,'stroke-width':'1.5'});
    var txt=mk('text',{x:n._x+PX,y:n._y,'dominant-baseline':'central',
      'font-size':'13','font-family':'system-ui,sans-serif',
      fill:depth<=0?'#fff':'#222'});
    txt.textContent=n.t;
    grp.appendChild(rect);grp.appendChild(txt);
    if(n.ch.length){
      var cx=n._x+n._w+R+3,cy=n._y;
      var dot=mk('circle',{cx:cx,cy:cy,r:R,fill:col,stroke:'#fff','stroke-width':'1.5',cursor:'pointer'});
      var lbl=mk('text',{x:cx,y:cy,'text-anchor':'middle','dominant-baseline':'central',
        'font-size':'10','font-family':'system-ui','fill':'#fff','pointer-events':'none'});
      lbl.textContent=n._c?'+':'\u2212';
      (function(node,d,l){dot.addEventListener('click',function(e){e.stopPropagation();node._c=!node._c;d.textContent=node._c?'+':'\u2212';render(ROOT);});})(n,lbl,dot);
      grp.appendChild(dot);grp.appendChild(lbl);
    }
    g.appendChild(grp);
    mx=Math.max(mx,n._x+n._w+R*3+14);my=Math.max(my,n._y+ROW);
    if(!n._c)n.ch.forEach(function(c){draw(c,n);});
  }
  draw(root,null);
  // auto-fit
  var sv=document.getElementById('cv');
  var vw=sv.clientWidth||800,vh=sv.clientHeight||500;
  var sc=Math.min((vw-32)/mx,(vh-16)/my,1.2);
  VX=16;VY=Math.max(16,(vh-my*sc)/2);SCALE=sc;applyT();
}

// pan/zoom
var VX=16,VY=16,SCALE=1,DRAG=false,DX=0,DY=0,ROOT;
function applyT(){document.getElementById('g').setAttribute('transform','translate('+VX+','+VY+') scale('+SCALE+')');}
var sv=document.getElementById('cv');
sv.addEventListener('wheel',function(e){e.preventDefault();
  var d=e.deltaY>0?0.9:1.1;SCALE=Math.max(0.15,Math.min(5,SCALE*d));applyT();},{passive:false});
sv.addEventListener('pointerdown',function(e){DRAG=true;DX=e.clientX-VX;DY=e.clientY-VY;sv.classList.add('gr');sv.setPointerCapture(e.pointerId);});
sv.addEventListener('pointermove',function(e){if(!DRAG)return;VX=e.clientX-DX;VY=e.clientY-DY;applyT();});
sv.addEventListener('pointerup',function(){DRAG=false;sv.classList.remove('gr');});

// boot
ROOT=parse(\`${safeMd}\`);
render(ROOT);
})();
</script>
</body></html>`;
}
