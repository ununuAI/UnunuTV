import assert from "node:assert/strict";
import test from "node:test";
import { CINEMATIC_PROJECT_TYPES } from "../packages/contracts/src/index.mjs";
import { CINEMATIC_PROJECT_PROFILES, productionResourceSummary } from "../apps/web/src/cinematic-project-profiles.js";
import { buildCinematicControllerViewModel } from "../apps/web/src/cinematic-controller-node-view-model.js";

test("every cinematic project type declares hierarchy, quantities, and a unique resource catalog", () => {
  assert.deepEqual(Object.keys(CINEMATIC_PROJECT_PROFILES).sort(), [...CINEMATIC_PROJECT_TYPES].sort());
  for (const projectType of CINEMATIC_PROJECT_TYPES) {
    const profile = CINEMATIC_PROJECT_PROFILES[projectType];
    assert.ok(profile.hierarchy.length >= 5, `${projectType} hierarchy is incomplete`);
    assert.ok(profile.quantityDimensions.length >= 5, `${projectType} quantity dimensions are incomplete`);
    assert.ok(profile.resources.length >= 14, `${projectType} resources are incomplete`);
    assert.equal(new Set(profile.resources.map((entry) => entry.id)).size, profile.resources.length, `${projectType} duplicates a resource`);
    for (const required of ["story", "character", "scene", "camera_lighting_color", "rights_releases", "edit_master", "deliverables"]) {
      assert.ok(profile.resources.some((entry) => entry.id === required), `${projectType} misses ${required}`);
    }
  }
});

test("the five primary formats keep their distinct production dimensions", () => {
  assert.ok(CINEMATIC_PROJECT_PROFILES.commercial.resources.some((entry) => entry.id === "campaign_claims"));
  assert.ok(CINEMATIC_PROJECT_PROFILES.music_video.resources.some((entry) => entry.id === "song_timeline"));
  assert.ok(CINEMATIC_PROJECT_PROFILES.social_video.resources.some((entry) => entry.id === "account_series"));
  assert.ok(CINEMATIC_PROJECT_PROFILES.episodic_series.resources.some((entry) => entry.id === "episode_tracker"));
  assert.ok(CINEMATIC_PROJECT_PROFILES.feature_film.hierarchy.includes("幕"));
});

test("resource summary separates recorded facts from formally accepted authorities", () => {
  const result = productionResourceSummary({
    production: { projectType: "social_video", legacyExtensions: { resourcePlan: { character: 3 } } },
    storyPacket: { characters: [{ name: "A" }, { name: "B" }], dialogue: [] },
    visualBible: { propSemantics: {}, costumeNarrative: {}, performance: {}, sound: {}, vfx: {}, continuityLocks: [] },
    assetAuthorities: [{ authorityType: "character", status: "candidate" }]
  });
  const characters = result.find((entry) => entry.id === "character");
  assert.deepEqual({ planned: characters.planned, recorded: characters.recorded, confirmed: characters.confirmed, missing: characters.missing }, { planned: 3, recorded: 2, confirmed: 0, missing: 3 });
});

test("off-camera characters do not create a fake visual-authority requirement", () => {
  const input = {
    production: { projectType: "social_video", title: "测试项目", revision: 1 },
    storyPacket: { characters: [{ name: "A", role: "镜头前主角" }, { name: "B", role: "持镜者、镜头外角色、不露脸" }], dialogue: [] },
    visualBible: { propSemantics: {}, costumeNarrative: {}, performance: {}, sound: {}, vfx: {}, continuityLocks: [] },
    assetAuthorities: [], shots: [], units: [], evaluations: []
  };
  const characters = productionResourceSummary(input).find((entry) => entry.id === "character");
  assert.deepEqual({ planned: characters.planned, recorded: characters.recorded, confirmed: characters.confirmed, missing: characters.missing }, { planned: 2, recorded: 2, confirmed: 1, missing: 1 });
  const controller = buildCinematicControllerViewModel(input);
  assert.equal(controller.cards.find((entry) => entry.id === "authority").value, "待路由");
  assert.equal(controller.nextStep, "运行资产权威风险路由");
});
