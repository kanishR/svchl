import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function parseBounds(bounds) {
  const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(bounds || "");
  if (!m) return null;
  const [, x1, y1, x2, y2] = m.map(Number);
  return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

// Flattens the uiautomator <node> tree into a plain array of nodes.
export function parseTree(xml) {
  const doc = parser.parse(xml);
  const nodes = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    const children = n.node ? (Array.isArray(n.node) ? n.node : [n.node]) : [];
    if (n.bounds !== undefined) {
      nodes.push({
        text: n.text || "",
        desc: n["content-desc"] || "",
        id: n["resource-id"] || "",
        className: n.class || "",
        clickable: n.clickable === "true",
        bounds: parseBounds(n.bounds),
      });
    }
    for (const child of children) walk(child);
  };
  walk(doc.hierarchy);
  return nodes;
}

// A step target can be a plain string (matched against text/desc), or an
// object with one of: text, desc, UNSAFE_id.
function matches(node, target) {
  if (typeof target === "string") {
    return node.text === target || node.desc === target;
  }
  if (target.text !== undefined) return node.text === target.text;
  if (target.desc !== undefined) return node.desc === target.desc;
  if (target.UNSAFE_id !== undefined) {
    return node.id === target.UNSAFE_id || node.id.endsWith(`:id/${target.UNSAFE_id}`);
  }
  return false;
}

export function find(nodes, target) {
  return nodes.find((n) => n.bounds && matches(n, target)) || null;
}

// Prefers a clickable ancestor's bounds when the exact text node itself
// isn't clickable (common for text inside a button).
export function findTappable(nodes, target) {
  const hit = find(nodes, target);
  if (hit && hit.clickable) return hit;
  if (hit) {
    const overlapping = nodes
      .filter((n) => n.clickable && n.bounds && containsPoint(n.bounds, hit.bounds))
      .sort((a, b) => area(a.bounds) - area(b.bounds));
    if (overlapping[0]) return overlapping[0];
  }
  return hit;
}

function area(b) {
  return (b.x2 - b.x1) * (b.y2 - b.y1);
}

function containsPoint(outer, inner) {
  return (
    inner.cx >= outer.x1 && inner.cx <= outer.x2 && inner.cy >= outer.y1 && inner.cy <= outer.y2
  );
}

export function isVisible(nodes, expectation) {
  return nodes.some((n) => matches(n, expectation));
}

// Layout containers carry a resource-id with no text on almost every
// screen; only surface elements a flow could actually target.
export function visibleElements(nodes) {
  return nodes.filter((n) => n.text || n.desc || (n.clickable && n.id));
}

// A short id identifying "the same logical screen" across visits, for
// svchl crawl's dedup. Built from resource-ids (stable across data
// refreshes — a fare or a date changing shouldn't count as a new screen)
// with a fallback to text only for elements that have no id at all
// (common for static labels like nav tiles). Order-independent.
export function screenSignature(nodes) {
  const parts = visibleElements(nodes)
    .map((n) => (n.id ? `id:${n.id}` : `t:${n.text || n.desc}`) + (n.clickable ? "*" : ""))
    .sort();
  return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 12);
}

export function labelFor(target) {
  if (typeof target === "string") return target;
  if (target.text !== undefined) return target.text;
  if (target.desc !== undefined) return target.desc;
  if (target.UNSAFE_id !== undefined) return `UNSAFE_id:${target.UNSAFE_id}`;
  return JSON.stringify(target);
}
