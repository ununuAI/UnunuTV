import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalProjectId,
  isCanonicalProjectId,
  projectRouteId
} from "@ununu/unutv-contracts";
import { ProjectStore } from "../packages/local-runtime/src/project-store.mjs";

const bareId = "bdc2576a-1250-4418-bcd8-31be23ceb1e1";
const canonicalId = `project-${bareId}`;

test("bare route UUID and stored project ID resolve to one canonical project identity", () => {
  assert.equal(canonicalProjectId(bareId), canonicalId);
  assert.equal(canonicalProjectId(canonicalId), canonicalId);
  assert.equal(projectRouteId(canonicalId), bareId);
  assert.equal(isCanonicalProjectId(canonicalId), true);
});

test("ProjectStore canonicalizes a bare route UUID before selecting or opening SQLite", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-project-id-normalization-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const store = new ProjectStore(dataRoot);
  context.after(() => store.close());
  const createdAt = "2026-07-28T00:00:00.000Z";
  store.create({ id: canonicalId, title: "Canonical project", createdAt, updatedAt: createdAt });

  assert.equal(store.database(bareId), store.database(canonicalId));
  assert.equal(store.open(bareId).id, canonicalId);
  assert.deepEqual(await readdir(path.join(dataRoot, "projects")), [canonicalId]);
  assert.equal(store.open("not-a-project"), undefined);
  assert.throws(
    () => store.database("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    (error) => error.code === "project_not_found" && error.status === 404
  );
  assert.deepEqual(await readdir(path.join(dataRoot, "projects")), [canonicalId]);
});
