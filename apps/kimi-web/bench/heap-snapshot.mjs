// apps/kimi-web/bench/heap-snapshot.mjs
// Detached-DOM-node count from a V8 heap snapshot.
//
// Chromium has no live detached-node counter (`DOM.getDetachedNodes` does not
// exist in current builds), so the count comes from a snapshot: every node
// carries a `detachedness` field, 2 meaning the renderer holds it with no path
// to a document. A snapshot of this app's heap runs to hundreds of megabytes of
// JSON, so the chunks are parsed as they arrive and only the nodes array is
// read — the rest of the snapshot is discarded, and the parser never holds more
// than one chunk.

const NODES_KEY = '"nodes":[';
const FIELDS_KEY = '"node_fields":[';
const DETACHED = 2;
/** Enough to catch a key split across a chunk boundary. */
const OVERLAP = 64;
/** The header is small; a bigger buffer than this means the keys are not there. */
const HEADER_LIMIT = 64 * 1024;

/**
 * Field layout, read from the snapshot's own header. The field list has changed
 * between builds (older snapshots carry a `trace_node_id` between `edge_count`
 * and `detachedness`), so the indices are derived rather than assumed.
 */
function readFieldLayout(header) {
  const at = header.indexOf(FIELDS_KEY);
  if (at === -1) return null;
  const end = header.indexOf(']', at);
  if (end === -1) return null;
  const fields = header
    .slice(at + FIELDS_KEY.length, end)
    .split(',')
    .map((name) => name.replaceAll(/"/g, '').trim());
  const detachednessField = fields.indexOf('detachedness');
  if (detachednessField === -1) return null;
  return {
    fieldCount: fields.length,
    selfSizeField: Math.max(0, fields.indexOf('self_size')),
    detachednessField,
  };
}

/**
 * Read the node array out of a stream of snapshot chunks and count the detached
 * ones. Returns null when the snapshot carried no nodes array, or no layout to
 * read it with (an empty snapshot, or a format this parser does not know).
 */
function parseChunks(chunks) {
  const layout = { fieldCount: 6, selfSizeField: 3, detachednessField: 5 };
  let phase = 'seek';
  let buffer = '';
  let field = 0;
  let value = 0;
  let inNumber = false;
  let totalNodes = 0;
  let detachedNodes = 0;
  let detachedBytes = 0;
  let pendingSize = 0;
  let pendingDetached = false;

  const endField = () => {
    if (field === layout.selfSizeField) pendingSize = value;
    if (field === layout.detachednessField) pendingDetached = value === DETACHED;
    if (field === layout.fieldCount - 1) {
      totalNodes += 1;
      if (pendingDetached) {
        detachedNodes += 1;
        detachedBytes += pendingSize;
      }
    }
    field = (field + 1) % layout.fieldCount;
    value = 0;
    inNumber = false;
  };

  for (const chunk of chunks) {
    if (phase === 'done') break;
    if (phase === 'seek') {
      buffer += chunk;
      const at = buffer.indexOf(NODES_KEY);
      if (at === -1) {
        // Keep just enough to match a key split across chunks.
        if (buffer.length > OVERLAP) buffer = buffer.slice(-OVERLAP);
        if (buffer.length > HEADER_LIMIT) return null;
        continue;
      }
      Object.assign(layout, readFieldLayout(buffer.slice(0, at)) ?? {});
      buffer = buffer.slice(at + NODES_KEY.length);
      phase = 'nodes';
    }
    if (phase === 'nodes') buffer += chunk;
    for (let i = 0; i < buffer.length; i++) {
      const c = buffer.codePointAt(i);
      if (c >= 48 && c <= 57) {
        value = value * 10 + (c - 48);
        inNumber = true;
      } else if (c === 44 /* , */) {
        endField();
      } else if (c === 93 /* ] */) {
        if (inNumber) endField();
        phase = 'done';
        break;
      }
      // Anything else (whitespace) is a separator, not a terminator.
    }
    buffer = phase === 'done' ? '' : buffer.slice(i + 1);
  }
  if (totalNodes === 0) return null;
  return { totalNodes, detachedNodes, detachedBytes };
}

/**
 * Take a heap snapshot through `cdp` and count the detached nodes in it.
 * Throws whatever CDP throws; callers decide what an unavailable count means.
 */
export async function countDetachedNodes(cdp) {
  await cdp.send('HeapProfiler.enable');
  const chunks = [];
  const listener = (msg) => {
    if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(msg.params.chunk);
  };
  cdp.listeners.push(listener);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, treatGlobalObjectsAsRoots: true });
  } finally {
    cdp.listeners = cdp.listeners.filter((l) => l !== listener);
  }
  const parsed = parseChunks(chunks);
  if (!parsed) throw new Error('heap snapshot carried no nodes array');
  return parsed;
}
