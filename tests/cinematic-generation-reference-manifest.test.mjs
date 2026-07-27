import assert from "node:assert/strict";
import test from "node:test";
import { auditCompiledProviderReferenceSet } from "../packages/core/src/use-cases/cinematic-generation-run-use-case.mjs";

const binding = (mediaId, providerIndex, providerEligible = true) => ({ mediaId, providerIndex, providerEligible });

test("formal generation blocks a compiled/provider reference manifest mismatch", () => {
  const envelope = { referenceBindings: [binding("media-scene", 1), binding("media-camera", 2)] };
  const audit = auditCompiledProviderReferenceSet(envelope, { referenceMediaIds: ["media-scene"] });
  assert.equal(audit.ok, false);
  assert.equal(audit.errors[0].code, "compiled_provider_reference_manifest_mismatch");
});

test("formal generation accepts the exact ordered effective reference set", () => {
  const envelope = { referenceBindings: [binding("media-character", 1), binding("media-scene", 2), binding("media-camera", 3)] };
  const audit = auditCompiledProviderReferenceSet(envelope, { referenceMediaIds: ["media-character", "media-scene", "media-camera"] });
  assert.equal(audit.ok, true);
  assert.deepEqual(audit.expectedMediaIds, ["media-character", "media-scene", "media-camera"]);
});

test("frame inputs are excluded from ordinary reference images but remain explicit frame inputs", () => {
  const envelope = { referenceBindings: [binding("media-scene", 1)] };
  const audit = auditCompiledProviderReferenceSet(envelope, { firstFrameMediaId: "media-first", referenceMediaIds: ["media-scene"] });
  assert.equal(audit.ok, true);
  assert.deepEqual(audit.expectedMediaIds, ["media-scene"]);
});
