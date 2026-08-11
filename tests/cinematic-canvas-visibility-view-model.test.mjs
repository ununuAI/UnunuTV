import assert from "node:assert/strict";
import test from "node:test";
import {
  assetDescriptionForNode,
  assetTypeForNode
} from "../apps/web/src/cinematic-asset-node-view-model.js";
import { buildCanonicalAuthorityCanvasView } from "../apps/web/src/canonical-authority-aggregation-view-model.js";
import { cinematicPromptFactsForNode } from "../apps/web/src/cinematic-prompt-facts-view-model.js";
import { cinematicDomainVisibleItems } from "../apps/web/src/cinematic-controller-node-view-model.js";
import {
  buildNodePresentationV2,
  nodeVisibleText,
  professionalContributionPresentation
} from "../apps/web/src/node-presentation-view-model.js";

test("script canvas presentation exposes persisted screenplay facts instead of generic copy", () => {
  const presentation = buildNodePresentationV2({
    id: "script-1",
    kind: "script",
    revision: 3,
    payload: {
      content: "八个陌生人因即将散架的公共木箱第一次共同协作。",
      structuredRowCount: 4,
      structuredDurationSeconds: 120,
      productionId: "production-1"
    }
  });
  assert.match(presentation.preview.summary, /4 个结构化场\/节拍/u);
  assert.match(presentation.preview.summary, /120 秒/u);
  assert.match(presentation.preview.summary, /公共木箱/u);
});

test("story canvas text projects StoryPacket facts when no generic text field exists", () => {
  const text = nodeVisibleText({
    kind: "story",
    payload: {
      storyPacket: {
        scenePurpose: "陌生人第一次形成临时协作",
        sourceFacts: ["木箱底板开裂", "门牌起初为空白"],
        causalEventChain: ["裂响迫使众人停下", "分工后安全搬运"]
      }
    }
  });
  assert.match(text, /陌生人第一次形成临时协作/u);
  assert.match(text, /木箱底板开裂/u);
  assert.match(text, /裂响迫使众人停下/u);
});

test("storyboard canvas summary exposes real shot facts and timing", () => {
  const items = cinematicDomainVisibleItems("storyboard", {
    storyboards: [{
      storyboardId: "board-1",
      shots: [{
        storyboardShotId: "board-shot-1",
        order: 1,
        title: "裂响",
        storyBeat: "无序动作被同一个风险事实按下暂停",
        durationSeconds: 8,
        status: "ready_for_image",
        imagePrompt: "单一连续画面，入口木箱底板开裂，八个人动作依次停下。",
        requiredAssetAuthorityIds: ["authority-location", "authority-crate"],
        videoReference: { selected: true, role: "storyboard_action_phase" },
        cinematicPlan: {
          openingState: "陆星野仍在承重，其他人各自搬运行李。",
          endingState: "所有人看向开裂木箱，动作完全停住。"
        }
      }]
    }],
    shots: [],
    units: [],
    evaluations: []
  }, { payload: { storyboardId: "board-1" } });
  assert.equal(items.length, 1);
  assert.deepEqual(
    { id: items[0].id, label: items[0].label, detail: items[0].detail, meta: items[0].meta },
    {
      id: "board-shot-1",
      label: "#1 裂响",
      detail: "无序动作被同一个风险事实按下暂停",
      meta: "8s · ready_for_image"
    }
  );
  assert.deepEqual(Object.fromEntries(items[0].facts.map((fact) => [fact.label, fact.value])), {
    "Prompt · imagePrompt": "单一连续画面，入口木箱底板开裂，八个人动作依次停下。",
    "时长": "8s",
    "起幅": "陆星野仍在承重，其他人各自搬运行李。",
    "落幅": "所有人看向开裂木箱，动作完全停住。",
    "Reference strategy": "已选择 · storyboard_action_phase",
    "Authority IDs": "authority-location、authority-crate",
    "状态": "ready_for_image"
  });
});

test("shot canvas details keep every shot and make missing prompt compilation explicit", () => {
  const items = cinematicDomainVisibleItems("shot", {
    storyboards: [],
    units: [],
    evaluations: [],
    shots: Array.from({ length: 5 }, (_, index) => ({
      shotId: `shot-${index + 1}`,
      order: index + 1,
      narrativeJob: `镜头任务 ${index + 1}`,
      storyBeat: `节拍 ${index + 1}`,
      durationSeconds: 6,
      openingState: `起幅 ${index + 1}`,
      endingState: `落幅 ${index + 1}`,
      generationStrategy: "text_to_video",
      requiredAssetIds: [`authority-${index + 1}`],
      status: "accepted"
    }))
  }, { payload: {} });
  assert.equal(items.length, 5);
  assert.equal(items[4].label, "#5 镜头任务 5");
  assert.equal(items[0].facts[0].label, "Prompt");
  assert.equal(items[0].facts[0].value, "待确定性编译");
  assert.equal(Object.fromEntries(items[0].facts.map((fact) => [fact.label, fact.value]))["Reference strategy"], "text_to_video");
});

test("authority type overrides a stale generic asset type and projects typed descriptions", () => {
  const scene = {
    title: "场景 · 老式无名公寓",
    payload: {
      assetType: "character",
      authorityType: "scene",
      authority: {
        authorityType: "scene",
        displayName: "老式无名公寓",
        architecture: "窄入口、门槛、狭长前厅与客厅主路径保持连续。"
      }
    }
  };
  assert.equal(assetTypeForNode(scene), "scene_location");
  assert.match(assetDescriptionForNode(scene), /狭长前厅/u);
  assert.equal(assetTypeForNode({ payload: { assetType: "character", authorityType: "prop" } }), "prop");
});

test("professional contribution uses a dedicated review projection with revision evidence", () => {
  const node = {
    id: "review-1",
    kind: "review",
    revision: 2,
    title: "对白审校 · r2",
    payload: {
      resourceType: "professional_contribution",
      roleId: "dialogue_editor",
      stageStatus: "accepted",
      contribution: {
        contributionId: "contribution-1",
        roleId: "dialogue_editor",
        targetType: "StoryProductionPacket",
        targetId: "story-1",
        diagnosis: "对白驱动动作。",
        structuredFields: {
          sourceStoryPacketRevision: 2,
          sourceScreenplayDocumentId: "script-node-1",
          sourceScreenplayDocumentRevision: 3,
          sourceScreenplayDocumentChecksum: "sha256-current",
          reviewDimensions: ["character_voiceprint", "subtext"],
          evidence: ["苏禾：先问。"],
          findings: [{ priority: "protect", evidence: "先问", diagnosis: "短句改变动作" }],
          dialogueInventory: [{ speaker: "苏禾", text: "先问。" }]
        }
      }
    }
  };
  const facts = professionalContributionPresentation(node);
  const presentation = buildNodePresentationV2(node);
  assert.equal(facts.label, "对白与表演审校");
  assert.equal(facts.storyRevision, 2);
  assert.equal(facts.screenplayRevision, 3);
  assert.equal(facts.dialogueInventory.length, 1);
  assert.equal(presentation.typeLabel, "对白与表演审校");
  assert.equal(presentation.capabilities.promptCapable, false);
  assert.equal(presentation.capabilities.runSurfaceCapable, false);
});

test("authority canvas projection keeps one top-level card and redirects linked history", () => {
  const authority = {
    id: "authority-node",
    kind: "asset",
    projectId: "project-1",
    title: "角色 · 许岚",
    payload: {
      resourceType: "asset_authority",
      authorityId: "authority-xulan",
      authorityType: "character",
      revision: 3
    }
  };
  const projectAsset = {
    id: "project-asset-node",
    kind: "asset",
    projectId: "project-1",
    title: "许岚 · 当前项目权威图 · 当前媒体",
    payload: {
      resourceType: "project_asset",
      authorityId: "authority-xulan",
      authorityType: "character",
      authorityRevision: 2,
      assetId: "asset-look-dev",
      currentVersionId: "asset-version-1",
      currentMediaId: "media-look-dev",
      mediaIds: ["media-look-dev"],
      providerRunId: "run-1",
      cinematicImageCompilationId: "compilation-1",
      authorityReviewStatus: "candidate",
      authorityMediaVersions: [{
        assetVersionId: "asset-version-1",
        authorityRevision: 2,
        mediaId: "media-look-dev",
        reviewState: "candidate"
      }]
    }
  };
  const graph = buildCanonicalAuthorityCanvasView({
    nodes: [authority, projectAsset, { id: "shot-1", kind: "shot", payload: {} }],
    edges: [{ id: "edge-1", fromNodeId: "project-asset-node", toNodeId: "shot-1", role: "cinematic_reference:semantic_identity" }]
  });
  assert.deepEqual(graph.nodes.map((node) => node.id), ["authority-node", "shot-1"]);
  assert.equal(graph.receipt.collapsedTopLevelNodeCount, 1);
  assert.equal(graph.nodes[0].payload.currentMediaId, "media-look-dev");
  assert.equal(graph.nodes[0].payload.candidateReviewStatus, "candidate");
  assert.equal(graph.nodes[0].payload.authorityAggregation.currentApproved, null);
  assert.equal(graph.nodes[0].payload.authorityAggregation.currentCandidate.providerRunId, "run-1");
  assert.equal(graph.nodes[0].payload.authorityAggregation.currentCandidate.compilationId, "compilation-1");
  assert.deepEqual(
    { fromNodeId: graph.edges[0].fromNodeId, toNodeId: graph.edges[0].toNodeId, sourceFromNodeId: graph.edges[0].aggregationEvidence.originalEndpoints[0].fromNodeId },
    { fromNodeId: "authority-node", toNodeId: "shot-1", sourceFromNodeId: "project-asset-node" }
  );
});

test("authority canvas projection preserves live image generation on the single canonical card", () => {
  const graph = buildCanonicalAuthorityCanvasView({
    nodes: [{
      id: "authority-node",
      kind: "asset",
      revision: 4,
      payload: {
        resourceType: "asset_authority",
        authorityId: "authority-suhe",
        authorityType: "character",
        authorityRevision: 4
      }
    }, {
      id: "project-asset-node",
      kind: "asset",
      revision: 29,
      updatedAt: "2026-07-28T06:20:00.000Z",
      payload: {
        resourceType: "project_asset",
        authorityId: "authority-suhe",
        authorityRevision: 4,
        generationStatus: "running",
        generationPhase: "requesting",
        generationMessage: "正在生成虚拟人物配套造型母版…",
        generationRequestId: "wuming:suhe:r4:gpt-image-2",
        providerRunId: "run-stale-history",
        generationProvider: "ununu",
        generationModel: "openai/gpt-image-2",
        generationResolution: "1536x1024",
        generationCount: 1,
        cinematicImageCompilationId: "compilation-suhe-r4"
      }
    }],
    edges: []
  });
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0].id, "authority-node");
  assert.equal(graph.nodes[0].payload.generationStatus, "running");
  assert.equal(graph.nodes[0].payload.generationPhase, "requesting");
  assert.equal(graph.nodes[0].payload.generationModel, "openai/gpt-image-2");
  assert.equal(graph.nodes[0].payload.generationResolution, "1536x1024");
  assert.equal(graph.nodes[0].payload.generationCount, 1);
  assert.equal(graph.nodes[0].payload.generationSourceNodeId, "project-asset-node");
  assert.equal(graph.nodes[0].payload.generationRunId, null);
  assert.equal(graph.nodes[0].payload.authorityAggregation.generation.requestId, "wuming:suhe:r4:gpt-image-2");
  assert.equal(graph.nodes[0].payload.authorityAggregation.generation.runId, null);
});

test("authority canvas projection displays server-approved media and its checksum and Prompt lineage", () => {
  const authority = {
    id: "authority-node",
    kind: "asset",
    projectId: "project-1",
    payload: {
      resourceType: "asset_authority",
      authorityId: "authority-xulan",
      authorityType: "character",
      authorityRevision: 3
    }
  };
  const projectAsset = {
    id: "project-asset-node",
    kind: "asset",
    projectId: "project-1",
    payload: {
      resourceType: "project_asset",
      authorityId: "authority-xulan",
      authorityType: "character",
      authorityRevision: 3,
      assetId: "asset-xulan",
      currentVersionId: "asset-version-new",
      currentMediaId: "media-new",
      authorityMediaVersions: [{
        assetId: "asset-xulan",
        assetVersionId: "asset-version-new",
        authorityRevision: 3,
        mediaId: "media-new",
        providerRunId: "run-new",
        reviewState: "candidate"
      }]
    }
  };
  const graph = buildCanonicalAuthorityCanvasView({
    nodes: [authority, projectAsset],
    edges: []
  }, [{
    authorityId: "authority-xulan",
    authorityType: "character",
    authorityRevision: 3,
    authorityStatus: "accepted",
    currentApproved: {
      assetId: "asset-xulan",
      assetVersionId: "asset-version-new",
      mediaId: "media-new",
      mediaChecksum: "sha256-new",
      providerRunId: "run-new",
      formalIdentityReady: true,
      latestReview: {
        state: "accepted",
        evidence: { evidenceType: "owner_character_appearance_pixel_v1" }
      }
    },
    currentCandidate: null,
    versions: [{
      assetId: "asset-xulan",
      assetVersionId: "asset-version-new",
      mediaId: "media-new",
      mediaChecksum: "sha256-new",
      providerRunId: "run-new",
      formalIdentityReady: true,
      latestReview: {
        state: "accepted",
        evidence: { evidenceType: "owner_character_appearance_pixel_v1" }
      }
    }],
    candidates: [],
    candidateRuns: [{
      runId: "run-new",
      compilationId: "compilation-new",
      payloadHash: "fnv1a32:new"
    }],
    formalSourceBinding: {
      authorityId: "authority-xulan",
      authorityRevision: 3,
      assetId: "asset-xulan",
      assetVersionId: "asset-version-new",
      mediaId: "media-new",
      mediaChecksum: "sha256-new"
    },
    formalReady: true
  }]);
  const canonical = graph.nodes[0];
  const aggregation = canonical.payload.authorityAggregation;
  assert.equal(graph.nodes.length, 1);
  assert.equal(canonical.payload.currentMediaId, "media-new");
  assert.equal(canonical.payload.currentMediaChecksum, "sha256-new");
  assert.deepEqual(canonical.payload.mediaIds, ["media-new"]);
  assert.equal(aggregation.currentApproved, aggregation.versions[0]);
  assert.equal(aggregation.currentApproved.payloadHash, "fnv1a32:new");
  assert.equal(aggregation.currentApproved.compilationId, "compilation-new");
  assert.equal(aggregation.currentApproved.sourceNodeId, "project-asset-node");
  assert.equal(aggregation.displayMediaFormal, true);
  assert.equal(aggregation.formalSourceBinding.mediaChecksum, "sha256-new");
});

test("authority aggregation collapses duplicate authority revisions and preserves every edge trace", () => {
  const authority = (id, revision) => ({
    id,
    kind: "asset",
    revision,
    payload: {
      resourceType: "asset_authority",
      authorityId: "authority-xulan",
      authorityType: "character",
      authorityRevision: revision
    }
  });
  const projectAsset = (id, mediaId) => ({
    id,
    kind: "asset",
    payload: {
      resourceType: "project_asset",
      authorityId: "authority-xulan",
      authorityType: "character",
      currentMediaId: mediaId,
      mediaIds: [mediaId],
      authorityReviewStatus: "candidate"
    }
  });
  const graph = buildCanonicalAuthorityCanvasView({
    nodes: [
      authority("authority-old", 2),
      authority("authority-new", 3),
      projectAsset("asset-old", "media-old"),
      projectAsset("asset-new", "media-new"),
      { id: "shot-1", kind: "shot", payload: {} }
    ],
    edges: [
      { id: "edge-old", fromNodeId: "authority-old", toNodeId: "shot-1", role: "cinematic_reference:semantic_identity" },
      { id: "edge-new", fromNodeId: "asset-new", toNodeId: "shot-1", role: "cinematic_reference:semantic_identity" },
      { id: "edge-internal", fromNodeId: "asset-old", toNodeId: "authority-new", role: "cinematic_stage:asset_history" }
    ]
  });
  const visibleAuthorities = graph.nodes.filter((node) => node.payload?.resourceType === "asset_authority");
  assert.deepEqual(visibleAuthorities.map((node) => node.id), ["authority-new"]);
  assert.deepEqual(visibleAuthorities[0].payload.authorityAggregation.sourceNodeIds.sort(), [
    "asset-new", "asset-old", "authority-new", "authority-old"
  ]);
  assert.deepEqual(
    graph.edges[0].aggregationEvidence.edgeIds.sort(),
    ["edge-new", "edge-old"]
  );
  assert.deepEqual(
    visibleAuthorities[0].payload.authorityAggregation.embeddedEdges.map((edge) => edge.id),
    ["edge-internal"]
  );
  assert.equal(graph.receipt.preservedEdgeEvidenceCount, 3);
  assert.equal(graph.receipt.visibleAuthorityNodeCount, 1);
});

test("prompt facts expose concrete abstract-intent clauses and Director 11-field provenance", () => {
  const facts = cinematicPromptFactsForNode({
    payload: {
      cinematicDirectorPromptPolicy: {
        ok: true,
        promptMode: { code: "B", reason: "复杂调度使用高控制模式" },
        providerAdapter: { referenceCount: 9, referenceLimit: 9, deterministicCompression: true },
        abstractIntent: {
          ok: true,
          labels: ["精美", "电影感"],
          sources: [{ label: "精美", sourcePath: "visualBible.styleTags", sourceValue: "精美、电影感" }],
          providerClauses: [
            "材质与生产设计：潮湿木门、磨损石砖、低饱和旧漆。",
            "焦段、光圈与焦点：40mm，T2.8，焦点从许岚移至木箱裂缝。"
          ]
        },
        fields: {
          cinematography: {
            ok: true,
            clauses: [{ text: "40mm固定机位，缓慢推进0.6米后停稳。", sourcePath: "shots[0].cinematography" }]
          },
          lighting: {
            ok: true,
            clauses: [{ text: "门外冷雨天光为主，室内钨丝灯作暖色反差。", sourcePath: "shots[0].lighting" }]
          }
        },
        errors: []
      }
    }
  });
  assert.equal(facts.ok, true);
  assert.deepEqual(facts.labels, ["精美", "电影感"]);
  assert.match(facts.providerClauses[0], /潮湿木门/u);
  assert.equal(facts.promptMode.code, "B");
  assert.equal(facts.directorFields[0].clauses[0].sourcePath, "shots[0].cinematography");
  assert.deepEqual(facts.providerAdapter, { referenceCount: 9, referenceLimit: 9, deterministicCompression: true });
});

test("legacy accepted character image stays look-dev without structured Owner pixel evidence", () => {
  const authority = {
    id: "authority-node",
    revision: 3,
    payload: { resourceType: "asset_authority", authorityId: "authority-1", authorityType: "character", authorityRevision: 3 }
  };
  const legacy = {
    id: "asset-node",
    payload: {
      resourceType: "project_asset",
      authorityId: "authority-1",
      authorityType: "character",
      authorityRevision: 3,
      assetId: "asset-1",
      currentVersionId: "version-1",
      currentMediaId: "media-1",
      currentMediaChecksum: "checksum-1",
      authorityReviewStatus: "accepted"
    }
  };
  const graph = buildCanonicalAuthorityCanvasView({ nodes: [authority, legacy], edges: [] });
  assert.equal(graph.nodes[0].payload.authorityAggregation.currentApproved, null);
  assert.equal(graph.nodes[0].payload.authorityAggregation.currentCandidate.mediaId, "media-1");
  assert.equal(graph.nodes[0].payload.currentMediaId, "media-1");
  assert.equal(graph.nodes[0].payload.candidateReviewStatus, "candidate");
});
