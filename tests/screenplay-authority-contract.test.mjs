import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  assessScreenplayDialogueInventory,
  extractScreenplayDialogueInventory,
  screenplayContentChecksum,
  validateScreenplayAuthorityDocument
} from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { applyScreenplayDocumentMigration } from "../packages/local-runtime/src/project-migrations.mjs";

const CONTENT_V1 = [
  "# EP01",
  "",
  "## 场一｜入口｜傍晚",
  "",
  "木箱底板裂开。",
  "",
  "陆星野：“这箱谁的？”",
  "",
  "苏禾：“先问。”"
].join("\n");

const CONTENT_V2 = CONTENT_V1.replace("木箱底板裂开。", "木箱底板发出清晰裂响。");

function authority(content = CONTENT_V1, overrides = {}) {
  return {
    documentId: "script-node-1",
    revision: 1,
    checksum: screenplayContentChecksum(content),
    content,
    ...overrides
  };
}

test("screenplay authority verifies exact UTF-8 SHA-256 and minimum screenplay structure", () => {
  assert.equal(
    screenplayContentChecksum("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
  assert.equal(validateScreenplayAuthorityDocument(authority()).ok, true);
  const synopsis = "八位年轻人抵达公寓，搬进一只箱子，并决定把这里叫作无名公寓。";
  const validation = validateScreenplayAuthorityDocument(authority(synopsis));
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((entry) => entry.code === "screenplay_scene_heading_required"), true);
  const forged = validateScreenplayAuthorityDocument(authority(CONTENT_V1, { checksum: "0".repeat(64) }));
  assert.equal(forged.issues.some((entry) => entry.code === "checksum_mismatch"), true);
  const uppercase = validateScreenplayAuthorityDocument(authority(CONTENT_V1, {
    checksum: screenplayContentChecksum(CONTENT_V1).toUpperCase()
  }));
  assert.equal(uppercase.issues.some((entry) => entry.code === "invalid_checksum"), true);
});

test("an authoritative screenplay cannot still declare itself a draft or pending review", () => {
  const draft = CONTENT_V1.replace(
    "# EP01",
    "# EP01\n\n状态：本地真源草案；待绑定当前 StoryPacket revision 后复审"
  );
  const validation = validateScreenplayAuthorityDocument(authority(draft));
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some((entry) => entry.code === "screenplay_document_not_final"),
    true
  );
});

test("dialogue inventory rejects missing, extra, reordered, renamed or rewritten lines", () => {
  const complete = [
    { ordinal: 1, speaker: "陆星野", text: "这箱谁的？" },
    { ordinal: 2, speaker: "苏禾", text: "先问。" }
  ];
  assert.equal(assessScreenplayDialogueInventory({
    dialogueInventory: complete,
    screenplayDocument: authority()
  }).ok, true);
  for (const candidate of [
    complete.slice(0, 1),
    [...complete, { ordinal: 3, speaker: "何小满", text: "别动。" }],
    [complete[1], complete[0]],
    [{ ...complete[0], speaker: "林远" }, complete[1]],
    [{ ...complete[0], text: "这箱是谁的？" }, complete[1]]
  ]) {
    assert.equal(assessScreenplayDialogueInventory({
      dialogueInventory: candidate,
      screenplayDocument: authority()
    }).ok, false);
  }
});

test("plain Fountain speaker blocks are extracted and unowned audible quotes fail closed", () => {
  const fountain = [
    "# EP01",
    "## 场一｜入口｜傍晚",
    "木箱底板裂开。",
    "陆星野",
    "（压低声音）",
    "这箱谁的？"
  ].join("\n");
  assert.deepEqual(
    extractScreenplayDialogueInventory(authority(fountain)).map(({ ordinal, speaker, text }) => ({ ordinal, speaker, text })),
    [{ ordinal: 1, speaker: "陆星野", text: "这箱谁的？" }]
  );

  const ambiguous = [
    "# EP01",
    "## 场一｜入口｜傍晚",
    "木箱底板裂开。",
    "（电话里）有人说“走。”"
  ].join("\n");
  const validation = validateScreenplayAuthorityDocument(authority(ambiguous));
  assert.equal(extractScreenplayDialogueInventory(authority(ambiguous)).length, 0);
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((entry) => entry.code === "ambiguous_dialogue_format"), true);
});

test("screenplay content revisions are server-owned, idempotent and independent from structured rows", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-screenplay-authority-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "剧本权威合同" });
  const node = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "EP01 完整剧本"
  });

  const first = await runtime.app.saveScreenplayDocument({
    projectId: project.id,
    nodeId: node.id,
    document: {
      format: "ScreenplayDocumentInputV1",
      content: CONTENT_V1,
      checksum: screenplayContentChecksum(CONTENT_V1),
      expectedRevision: 0
    }
  });
  assert.equal(first.documentId, node.id);
  assert.equal(first.revision, 1);

  const same = await runtime.app.saveScreenplayDocument({
    projectId: project.id,
    nodeId: node.id,
    document: {
      format: "ScreenplayDocumentInputV1",
      content: CONTENT_V1,
      checksum: screenplayContentChecksum(CONTENT_V1),
      expectedRevision: 1
    }
  });
  assert.equal(same.revision, 1);
  await assert.rejects(
    () => runtime.app.saveScreenplayDocument({
      projectId: project.id,
      nodeId: node.id,
      document: {
        format: "ScreenplayDocumentInputV1",
        content: CONTENT_V2,
        checksum: screenplayContentChecksum(CONTENT_V2),
        expectedRevision: 0
      }
    }),
    (error) => error?.code === "screenplay_document_revision_conflict"
  );

  await runtime.app.createScriptRow({
    projectId: project.id,
    nodeId: node.id,
    payload: { sceneHeading: "场一", action: "木箱裂开" }
  });
  const afterRows = await runtime.app.getScriptDocument({ projectId: project.id, nodeId: node.id });
  assert.equal(afterRows.revision, 1);
  assert.equal(afterRows.screenplayDocument.revision, 1);

  const second = await runtime.app.saveScreenplayDocument({
    projectId: project.id,
    nodeId: node.id,
    document: {
      format: "ScreenplayDocumentInputV1",
      content: CONTENT_V2,
      checksum: screenplayContentChecksum(CONTENT_V2),
      expectedRevision: 1
    }
  });
  assert.equal(second.revision, 2);
  const reopened = await runtime.app.getScriptDocument({ projectId: project.id, nodeId: node.id });
  assert.equal(reopened.revision, 1);
  assert.equal(reopened.screenplayDocument.revision, 2);
  assert.equal(reopened.screenplayDocument.checksum, screenplayContentChecksum(CONTENT_V2));
});

test("legacy script payload content migrates to server-owned revision one with a recomputed checksum", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE runtime_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE script_documents (
      node_id TEXT PRIMARY KEY,
      current_revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
  const timestamp = "2026-07-28T00:00:00.000Z";
  database.prepare("INSERT INTO nodes (id, payload_json, updated_at) VALUES (?, ?, ?)")
    .run("legacy-script", JSON.stringify({ content: CONTENT_V1, checksum: "forged" }), timestamp);
  database.prepare("INSERT INTO script_documents (node_id, current_revision, updated_at) VALUES (?, 4, ?)")
    .run("legacy-script", timestamp);
  const migration = applyScreenplayDocumentMigration(database);
  assert.equal(migration.migratedDocuments, 1);
  const row = database.prepare(`
    SELECT d.current_revision AS rowsRevision,
      d.current_screenplay_revision AS screenplayRevision,
      v.content_text AS content, v.content_sha256 AS checksum
    FROM script_documents d
    JOIN screenplay_document_versions v
      ON v.node_id=d.node_id AND v.revision=d.current_screenplay_revision
    WHERE d.node_id=?
  `).get("legacy-script");
  assert.equal(row.rowsRevision, 4);
  assert.equal(row.screenplayRevision, 1);
  assert.equal(row.content, CONTENT_V1);
  assert.equal(row.checksum, screenplayContentChecksum(CONTENT_V1));
  assert.equal(applyScreenplayDocumentMigration(database).applied, false);
  database.close();
});
