import assert from "node:assert/strict";
import test from "node:test";
import {
  assessGenerationUnitCharacterIdentityBindings,
  deriveCinematicCharacterIdentityBindings,
  orderedCharacterAuthorityIdsForShots
} from "@ununu/unutv-core";
import { createCinematicGenerationRunUseCase } from "../packages/core/src/use-cases/cinematic-generation-run-use-case.mjs";

function authority(authorityId, displayName, assetId, revision = 3) {
  return {
    authorityId,
    authorityType: "character",
    displayName,
    status: "accepted",
    revision,
    externalProviderIdentity: {
      provider: "ark",
      capability: "virtual_person_asset",
      assetId,
      source: "owner_locked_episode_authority"
    }
  };
}

const authorities = [
  authority("character-xulan", "许岚", "asset-20260401123823-6d4x2"),
  authority("character-xiali", "夏梨", "asset-20260310030618-88hlb")
];

function unit(virtualPersonAssetIds) {
  return {
    requiredCapabilities: ["virtual_person_asset"],
    generationParameters: { virtualPersonAssetIds }
  };
}

test("appearance order deterministically derives Authority-owned virtual person IDs", () => {
  const result = deriveCinematicCharacterIdentityBindings({
    authorities,
    characterAuthorityIds: ["character-xiali", "character-xulan"]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.virtualPersonAssetIds, [
    "asset-20260310030618-88hlb",
    "asset-20260401123823-6d4x2"
  ]);
  assert.deepEqual(result.bindings.map((entry) => [entry.authorityId, entry.authorityRevision]), [
    ["character-xiali", 3],
    ["character-xulan", 3]
  ]);
});

test("shot cast falls back to named and collective blocking when explicit authority ids are absent", () => {
  const castAuthorities = [
    authority("character-lu", "陆星野", "asset-20260224202014-9gmg4"),
    authority("character-he", "何小满", "asset-20260224201618-vsb5b"),
    authority("character-lin", "林远", "asset-20260720211108-5c7sh")
  ];
  assert.deepEqual(
    orderedCharacterAuthorityIdsForShots({
      authorities: castAuthorities,
      shots: [{
        shotId: "S01",
        blocking: { actors: ["陆星野承重扫视", "其余二人因裂响短暂停顿"] }
      }]
    }),
    ["character-lu", "character-he", "character-lin"]
  );
  assert.deepEqual(
    orderedCharacterAuthorityIdsForShots({
      authorities: castAuthorities,
      shots: [{
        shotId: "S03",
        blocking: { actors: ["林远低声回应"] }
      }]
    }),
    ["character-lin"]
  );
});

test("GenerationUnit cannot hand-fill a different, missing, extra, or reordered virtual person ID", () => {
  const characterAuthorityIds = ["character-xiali", "character-xulan"];
  for (const virtualPersonAssetIds of [
    ["asset-20260401123823-6d4x2", "asset-20260310030618-88hlb"],
    ["asset-20260310030618-88hlb"],
    ["asset-20260310030618-88hlb", "asset-20260401123823-6d4x2", "asset-20260310022434-wvg96"]
  ]) {
    const result = assessGenerationUnitCharacterIdentityBindings({
      authorities,
      characterAuthorityIds,
      generationUnit: unit(virtualPersonAssetIds)
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((entry) => entry.code === "generation_unit_virtual_person_binding_mismatch"));
  }
});

test("duplicate virtual person ownership across accepted character Authorities is rejected", () => {
  const result = deriveCinematicCharacterIdentityBindings({
    authorities: [
      authorities[0],
      authority("character-other", "另一角色", authorities[0].externalProviderIdentity.assetId)
    ],
    characterAuthorityIds: ["character-xulan", "character-other"]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "character_virtual_person_identity_reused"));
});

test("formal run blocks missing, reordered, extra, hand-filled, and stale Authority identity before budget or Provider", async () => {
  const currentVersions = [
    {
      authorityId: "character-xiali",
      authorityRevision: 3,
      provider: "ark",
      source: "owner_locked_episode_authority",
      virtualPersonAssetId: "asset-20260310030618-88hlb"
    },
    {
      authorityId: "character-xulan",
      authorityRevision: 3,
      provider: "ark",
      source: "owner_locked_episode_authority",
      virtualPersonAssetId: "asset-20260401123823-6d4x2"
    }
  ];
  const cases = [
    { name: "missing", characterAuthorityIds: ["character-xiali"], actualIds: [], sourceVersions: currentVersions.slice(0, 1) },
    { name: "reordered", characterAuthorityIds: ["character-xiali", "character-xulan"], actualIds: [currentVersions[1].virtualPersonAssetId, currentVersions[0].virtualPersonAssetId], sourceVersions: currentVersions },
    { name: "extra", characterAuthorityIds: ["character-xiali"], actualIds: [currentVersions[0].virtualPersonAssetId, currentVersions[1].virtualPersonAssetId], sourceVersions: currentVersions.slice(0, 1) },
    { name: "hand-filled", characterAuthorityIds: ["character-xiali"], actualIds: [currentVersions[1].virtualPersonAssetId], sourceVersions: currentVersions.slice(0, 1) },
    {
      name: "authority-revision-stale",
      characterAuthorityIds: ["character-xiali"],
      actualIds: [currentVersions[0].virtualPersonAssetId],
      sourceVersions: [{ ...currentVersions[0], authorityRevision: 2 }]
    }
  ];
  for (const scenario of cases) {
    let providerCalls = 0;
    let budgetCalls = 0;
    const generationUnit = {
      generationUnitId: `unit-identity-gate-${scenario.name}`,
      revision: 1,
      sequenceWorkspaceBinding: { sequencePrevisId: "previs-1" },
      characterAuthorityIds: scenario.characterAuthorityIds,
      characterIdentitySourceVersions: scenario.sourceVersions,
      requiredCapabilities: ["virtual_person_asset"],
      generationParameters: { virtualPersonAssetIds: scenario.actualIds }
    };
    const runGenerationUnit = createCinematicGenerationRunUseCase({
      budget: {
        async reserveBudget() {
          budgetCalls += 1;
          throw new Error("must not reserve");
        }
      },
      findCompilationStaleness: async () => [],
      getCompilationRecord: async () => ({
        compilationId: `compilation-identity-gate-${scenario.name}`,
        envelope: {
          sourceVersions: { characterIdentityBindings: scenario.sourceVersions },
          generationParameters: { virtualPersonAssetIds: scenario.actualIds }
        }
      }),
      getGenerationUnit: async () => ({ generationUnit }),
      linkGenerationUnitRun: async () => null,
      listProviderRuns: async () => [],
      listAssetAuthorities: async () => authorities,
      pollRun: async () => null,
      projects: {},
      runNode: async () => {
        providerCalls += 1;
        throw new Error("must not submit");
      },
      updateNode: async () => null
    });
    await assert.rejects(
      () => runGenerationUnit({
        projectId: "project-identity-gate",
        productionId: "production-identity-gate",
        generationUnitId: generationUnit.generationUnitId,
        billingMode: "legacy_budget",
        amount: 1
      }),
      (error) => error?.code === "stale_character_identity_binding",
      scenario.name
    );
    assert.equal(budgetCalls, 0, scenario.name);
    assert.equal(providerCalls, 0, scenario.name);
  }
});
