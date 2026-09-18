import test from "node:test";
import assert from "node:assert/strict";
import { parseTree, find, findTappable, isVisible } from "../src/locator.js";

const SAMPLE_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" resource-id="" class="android.widget.LinearLayout" content-desc="" clickable="true" bounds="[0,800][1080,900]">
    <node text="Network &amp; internet" resource-id="android:id/title" class="android.widget.TextView" content-desc="" clickable="false" bounds="[198,820][651,868]" />
  </node>
  <node text="Search settings" resource-id="com.android.settings:id/search" class="android.widget.TextView" content-desc="" clickable="false" bounds="[0,0][300,100]" />
</hierarchy>`;

test("parseTree flattens nested nodes and decodes entities", () => {
  const nodes = parseTree(SAMPLE_XML);
  assert.equal(nodes.length, 3);
  assert.equal(nodes[1].text, "Network & internet");
});

test("find matches by exact text", () => {
  const nodes = parseTree(SAMPLE_XML);
  const hit = find(nodes, "Search settings");
  assert.ok(hit);
  assert.equal(hit.id, "com.android.settings:id/search");
});

test("findTappable climbs to the clickable ancestor when the text node itself isn't clickable", () => {
  const nodes = parseTree(SAMPLE_XML);
  const target = findTappable(nodes, "Network & internet");
  assert.equal(target.bounds.x1, 0);
  assert.equal(target.bounds.y1, 800);
});

test("isVisible checks text across all nodes", () => {
  const nodes = parseTree(SAMPLE_XML);
  assert.equal(isVisible(nodes, "Search settings"), true);
  assert.equal(isVisible(nodes, "Nonexistent"), false);
});
