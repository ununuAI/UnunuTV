import assert from "node:assert/strict";
import test from "node:test";
import {
  CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE,
  createCinematicCanvasPromptDocument,
  normalizeCinematicInputDecision,
  persistCompiledPromptOnCanvas,
  resolveCanvasReferenceGraph,
  virtualAuthorityReferenceRequirements
} from "../packages/core/src/cinematic-canvas-prompt-graph-policy.mjs";
import { auditLiveCanvasProductionGraph } from "../packages/core/src/use-cases/cinematic-generation-run-use-case.mjs";

const CANVAS_ID = "canvas-authority";
const EXECUTION_NODE_ID = "video-shot-u01";
const AUTHORITY_ID = "character-authority-xiali";
const VIRTUAL_PERSON_ASSET_ID = "asset-20260310030618-88hlb";
const SOURCE_NODE_ID = "asset-node-xiali-authority";
const SOURCE_VERSION = {
  authorityId: AUTHORITY_ID,
  authorityRevision: 3,
  provider: "ark",
  source: "owner_locked_episode_authority",
  virtualPersonAssetId: VIRTUAL_PERSON_ASSET_ID
};

function generationUnit(overrides = {}) {
  return {
    generationUnitId: "generation-unit-u01",
    revision: 7,
    executionNodeId: EXECUTION_NODE_ID,
    characterAuthorityIds: [AUTHORITY_ID],
    characterIdentitySourceVersions: [SOURCE_VERSION],
    generationParameters: {
      mode: "image_reference",
      virtualPersonAssetIds: [VIRTUAL_PERSON_ASSET_ID]
    },
    ...overrides
  };
}

function executionNode(payload = {}) {
  return {
    id: EXECUTION_NODE_ID,
    canvasId: CANVAS_ID,
    kind: "videoShot",
    payload,
    revision: 5
  };
}

function authorityNode(overrides = {}) {
  return {
    id: SOURCE_NODE_ID,
    canvasId: CANVAS_ID,
    kind: "asset",
    payload: {
      authorityId: AUTHORITY_ID,
      authorityRevision: 3,
      externalProviderIdentity: {
        assetId: VIRTUAL_PERSON_ASSET_ID,
        provider: "ark",
        source: "owner_locked_episode_authority"
      }
    },
    revision: 2,
    ...overrides
  };
}

function identityEdge(overrides = {}) {
  return {
    id: "edge-xiali-identity",
    canvasId: CANVAS_ID,
    fromNodeId: SOURCE_NODE_ID,
    toNodeId: EXECUTION_NODE_ID,
    role: CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE,
    ...overrides
  };
}

function graphPorts({ nodes, edges }) {
  let connectCalls = 0;
  return {
    projects: {
      async getNode(_projectId, nodeId) {
        return nodes.find((node) => node.id === nodeId) ?? null;
      },
      async openCanvas() {
        return { id: CANVAS_ID, nodes, edges };
      },
      async connectEdge() {
        connectCalls += 1;
        throw new Error("virtual Authority audit must never synthesize a missing edge");
      }
    },
    connectCalls: () => connectCalls
  };
}

function compilation() {
  return {
    compilationId: "prompt-compilation-u01-r7",
    envelope: {
      compiledContentPrompt: "夏梨进入无名公寓玄关，在门边停稳。",
      payloadHash: "sha256:compiled-u01-r7",
      referenceBindings: [],
      generationParameters: {
        provider: "ark",
        model: "doubao-seedance-2-0-mini-260615",
        mode: "image_reference",
        duration: 5,
        aspectRatio: "16:9",
        resolution: "480p",
        count: 1,
        generateAudio: true,
        referenceMediaIds: [],
        virtualPersonAssetIds: [VIRTUAL_PERSON_ASSET_ID]
      },
      visualInputDecision: {
        ok: true,
        mode: "image_reference",
        rationale: "角色身份通过 Authority 虚拟人物 reference asset 输入。",
        visualAnchorPolicy: "SHOT_FRAME_SET"
      },
      segmentDecision: "one_take_segment",
      segmentSeam: {
        ok: true,
        seamAction: "tail_continue",
        createsEditPoint: false,
        editBoundaryPolicy: "no_automatic_edit_point"
      },
      directorPromptPolicy: {
        version: "cinematic_director_prompt_policy_v1",
        promptMode: { code: "C", reason: "deterministic_default" },
        fields: { special_attention: { ok: true, clauses: [{ sourcePath: "shots[0].narrativeJob", text: "建立人物入场" }] } },
        abstractIntent: {
          version: "cinematic_abstract_intent_resolution_v1",
          target: "video",
          labels: ["电影感"],
          clauses: [{ domain: "motivated_lighting", facet: "light_direction", sourcePath: "shots[0].lighting.direction", clause: "门外右后方侧逆光" }],
          errors: [],
          ok: true
        },
        errors: [],
        ok: true
      },
      sourceVersions: {
        generationUnitRevision: 7,
        characterIdentityBindings: [SOURCE_VERSION]
      }
    }
  };
}

test("virtual Authority requirements preserve appearance order and reject non-bijective mappings", () => {
  const valid = virtualAuthorityReferenceRequirements(generationUnit());
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.requirements, [{
    appearanceIndex: 0,
    authorityId: AUTHORITY_ID,
    authorityRevision: 3,
    provider: "ark",
    source: "owner_locked_episode_authority",
    virtualPersonAssetId: VIRTUAL_PERSON_ASSET_ID
  }]);

  const invalid = virtualAuthorityReferenceRequirements(generationUnit({
    characterAuthorityIds: [AUTHORITY_ID, "character-authority-guest"],
    characterIdentitySourceVersions: [
      { ...SOURCE_VERSION, authorityId: "character-authority-guest" },
      { ...SOURCE_VERSION, authorityId: AUTHORITY_ID }
    ],
    generationParameters: {
      mode: "image_reference",
      virtualPersonAssetIds: [VIRTUAL_PERSON_ASSET_ID, VIRTUAL_PERSON_ASSET_ID]
    }
  }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some((error) => error.code === "canvas_virtual_authority_mapping_not_one_to_one"), true);
  assert.equal(invalid.errors.some((error) => error.code === "canvas_virtual_authority_source_version_mismatch"), true);
});

test("virtual Authority canvas audit fails closed for missing node, stale source version, or missing typed edge", async () => {
  const execution = executionNode();
  const missingNodePorts = graphPorts({ nodes: [execution], edges: [] });
  const missingNode = await resolveCanvasReferenceGraph({
    ports: missingNodePorts,
    projectId: "project-authority",
    generationUnit: generationUnit(),
    referenceBindings: []
  });
  assert.equal(missingNode.audit.ok, false);
  assert.equal(missingNode.audit.errors.some((error) => error.code === "canvas_virtual_authority_node_required"), true);

  const staleNodePorts = graphPorts({
    nodes: [execution, authorityNode({
      payload: {
        ...authorityNode().payload,
        authorityRevision: 2
      }
    })],
    edges: [identityEdge()]
  });
  const staleNode = await resolveCanvasReferenceGraph({
    ports: staleNodePorts,
    projectId: "project-authority",
    generationUnit: generationUnit(),
    referenceBindings: []
  });
  assert.equal(staleNode.audit.ok, false);
  assert.equal(staleNode.audit.errors.some((error) => error.code === "canvas_virtual_authority_node_version_mismatch"), true);

  const missingEdgePorts = graphPorts({ nodes: [execution, authorityNode()], edges: [] });
  const missingEdge = await resolveCanvasReferenceGraph({
    ports: missingEdgePorts,
    projectId: "project-authority",
    generationUnit: generationUnit(),
    referenceBindings: []
  });
  assert.equal(missingEdge.audit.ok, false);
  assert.equal(missingEdge.audit.errors.some((error) => error.code === "canvas_virtual_authority_edge_required"), true);
  assert.equal(missingEdgePorts.connectCalls(), 0);
});

test("compile persistence stores the ordered Authority resolver receipt in inputDecision, PromptDocument, and canvas payload", async () => {
  const execution = executionNode();
  const source = authorityNode();
  const edge = identityEdge();
  const ports = graphPorts({ nodes: [execution, source], edges: [edge] });
  const unit = generationUnit();
  const canvasGraph = await resolveCanvasReferenceGraph({
    ports,
    projectId: "project-authority",
    generationUnit: unit,
    referenceBindings: []
  });
  assert.equal(canvasGraph.audit.ok, true);
  assert.deepEqual(canvasGraph.audit.referenceNodeIds, [SOURCE_NODE_ID]);
  assert.deepEqual(canvasGraph.audit.virtualAuthorityReferences, [{
    appearanceIndex: 0,
    authorityId: AUTHORITY_ID,
    authorityRevision: 3,
    provider: "ark",
    source: "owner_locked_episode_authority",
    virtualPersonAssetId: VIRTUAL_PERSON_ASSET_ID,
    edgeId: edge.id,
    edgeRole: CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE,
    sourceNodeId: SOURCE_NODE_ID
  }]);

  let savedPrompt = null;
  let updatedNode = null;
  const compiled = compilation();
  compiled.envelope.sourceVersions.canvasProductionGraph = canvasGraph.audit;
  assert.deepEqual(
    normalizeCinematicInputDecision(compiled, { audit: { referenceNodeIds: [] } }).virtualAuthorityReferences,
    canvasGraph.audit.virtualAuthorityReferences
  );
  assert.equal(
    createCinematicCanvasPromptDocument(compiled).content.some((token) => token.type === "reference"
      && token.role === "character_identity"
      && token.sourceNodeId === SOURCE_NODE_ID),
    true
  );
  await persistCompiledPromptOnCanvas({
    dependencies: {
      async saveNodePrompt(input) {
        savedPrompt = input;
        return input;
      },
      async updateNode(input) {
        updatedNode = input;
        return input;
      }
    },
    ports,
    projectId: "project-authority",
    compilation: compiled,
    generationUnit: unit,
    canvasGraph
  });

  assert.deepEqual(
    savedPrompt.parameters.inputDecision.virtualAuthorityReferences,
    canvasGraph.audit.virtualAuthorityReferences
  );
  assert.deepEqual(savedPrompt.parameters.inputDecision.referenceNodeIds, [SOURCE_NODE_ID]);
  assert.equal(savedPrompt.parameters.segmentDecision, "one_take_segment");
  assert.equal(savedPrompt.parameters.segmentSeam.createsEditPoint, false);
  assert.deepEqual(savedPrompt.parameters.abstractIntentResolution.labels, ["电影感"]);
  assert.equal(savedPrompt.parameters.abstractIntentResolution.clauses[0].sourcePath, "shots[0].lighting.direction");
  assert.equal(savedPrompt.parameters.directorPromptPolicy.promptMode.code, "C");
  const identityToken = savedPrompt.document.content.find((token) => token.type === "reference"
    && token.role === "character_identity");
  assert.deepEqual({
    assetId: identityToken.assetId,
    assetVersionId: identityToken.assetVersionId,
    authorityRevision: identityToken.authorityRevision,
    sourceNodeId: identityToken.sourceNodeId
  }, {
    assetId: VIRTUAL_PERSON_ASSET_ID,
    assetVersionId: `authority:${AUTHORITY_ID}:r3`,
    authorityRevision: "r3",
    sourceNodeId: SOURCE_NODE_ID
  });
  assert.deepEqual(
    updatedNode.payload.canvasReferenceGraph.virtualAuthorityReferences,
    canvasGraph.audit.virtualAuthorityReferences
  );
  assert.deepEqual(
    updatedNode.payload.cinematicInputDecision.virtualAuthorityReferences,
    canvasGraph.audit.virtualAuthorityReferences
  );
  assert.equal(updatedNode.payload.cinematicSegmentDecision, "one_take_segment");
  assert.equal(updatedNode.payload.cinematicSegmentSeam.editBoundaryPolicy, "no_automatic_edit_point");
  assert.deepEqual(updatedNode.payload.cinematicAbstractIntentResolution.labels, ["电影感"]);
  assert.equal(updatedNode.payload.cinematicDirectorPromptPolicy.fields.special_attention.ok, true);
  assert.equal(ports.connectCalls(), 0);

  const liveExecution = { ...execution, payload: updatedNode.payload };
  const liveProjects = (nodes, edges) => ({
    async getNodePrompt() {
      return savedPrompt;
    },
    async openCanvas() {
      return { id: CANVAS_ID, nodes, edges };
    }
  });
  const acceptedRunAudit = await auditLiveCanvasProductionGraph({
    compilation: compiled,
    node: liveExecution,
    projectId: "project-authority",
    projects: liveProjects([liveExecution, source], [edge])
  });
  assert.deepEqual(acceptedRunAudit.errors, []);

  const missingEdgeRunAudit = await auditLiveCanvasProductionGraph({
    compilation: compiled,
    node: liveExecution,
    projectId: "project-authority",
    projects: liveProjects([liveExecution, source], [])
  });
  assert.equal(
    missingEdgeRunAudit.errors.some((error) => error.code === "canvas_virtual_authority_edge_required"),
    true
  );

  const staleSourceRunAudit = await auditLiveCanvasProductionGraph({
    compilation: compiled,
    node: liveExecution,
    projectId: "project-authority",
    projects: liveProjects([
      liveExecution,
      authorityNode({ payload: { ...source.payload, authorityRevision: source.payload.authorityRevision + 1 } })
    ], [edge])
  });
  assert.equal(
    staleSourceRunAudit.errors.some((error) => error.code === "canvas_virtual_authority_node_version_mismatch"),
    true
  );
});
