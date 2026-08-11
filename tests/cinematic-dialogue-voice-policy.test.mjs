import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCharacterVoiceProfile,
  validateLineVoiceAuthority
} from "@ununu/unutv-contracts";
import {
  CHARACTER_DIALOGUE_AUTHORITY_EDGE_ROLE,
  LINE_DIALOGUE_AUTHORITY_EDGE_ROLE,
  assessCinematicDialogueAudioRun,
  deriveCinematicDialogueContext
} from "@ununu/unutv-core";
import { createApplicationFoundationUseCases } from "../packages/core/src/use-cases/application-foundation-use-cases.mjs";
import { FORMAL_GENERATION_UNIT_RUN } from "../packages/core/src/cinematic-workflow-policy.mjs";
import { createProviderRouter } from "../packages/providers/src/index.mjs";
import { ownerFullPlaybackReview } from "./fixtures/owner-full-playback-review.mjs";

function acceptedProfile() {
  return {
    voiceProfileId: "voice-xu-v1",
    language: "zh-CN",
    description: "Owner 锁定的许岚声线",
    source: "designed_prompt",
    status: "accepted",
    bindingMode: "provider_voice",
    provider: "openspeech",
    speakerId: "speaker-xu-v1",
    model: "seed-audio-1.0",
    sampleMediaId: null,
    acceptanceCriteria: ["试听清晰", "跨镜稳定"],
    prohibitedChanges: ["不得换声"],
    performanceBaseline: {
      ageImpression: "二十七岁左右",
      timbre: "中低亮度、清晰干燥",
      pace: "偏快",
      breath: "长句自然换气",
      pitchRange: "女声中低音域",
      accent: "自然普通话",
      articulation: "清楚不吞字",
      emotionRange: ["组织", "克制"]
    },
    consistencyChecks: ["音色", "音域", "语速", "气息", "口音", "咬字"],
    acceptanceEvidence: {
      auditionMediaId: "media-xu-audition",
      auditionChecksum: "sha256-xu-audition",
      reviewId: "review-xu-audition",
      durationMs: 3000,
      fullPlaybackVerified: true,
      reviewerType: "owner",
      ownerAccepted: true
    }
  };
}

function acceptedLineAuthority() {
  return {
    lineVoiceAuthorityId: "line-voice-ep01-010",
    episodeId: "ep01",
    lineId: "ep01:dialogue:010",
    speakerId: "offscreen-work-caller-ep01",
    speakerType: "offscreen_once",
    transcript: "这个今晚能改完吧？",
    language: "zh-CN",
    description: "仅本行有效的电话远端声音",
    status: "accepted",
    revision: 2,
    source: "designed_prompt",
    provider: "openspeech",
    providerSpeakerId: "speaker-caller-v1",
    model: "seed-audio-1.0",
    sourceRevision: 2,
    sourceChecksum: "sha256-screenplay-v2",
    acceptanceCriteria: ["全文清楚"],
    prohibitedChanges: ["不得跨行复用"],
    acceptanceEvidence: {
      auditionMediaId: "media-caller-audition",
      auditionChecksum: "sha256-caller-audition",
      reviewId: "review-caller-audition",
      durationMs: 2500,
      fullPlaybackVerified: true,
      reviewerType: "owner",
      ownerAccepted: true
    }
  };
}

test("audition_pending CharacterVoiceProfile is a non-runnable candidate and accepted profiles require Owner lock", () => {
  const candidate = {
    voiceProfileId: "voice-xu-draft",
    source: "designed_prompt",
    bindingMode: "audition_pending",
    language: "zh-CN",
    description: "未试听的确定性设计草案",
    status: "candidate",
    provider: null,
    speakerId: null,
    model: null,
    sampleMediaId: null,
    acceptanceCriteria: [],
    prohibitedChanges: []
  };
  assert.equal(validateCharacterVoiceProfile(candidate).ok, true);
  const invalidAccepted = validateCharacterVoiceProfile({ ...candidate, status: "accepted" });
  assert.equal(invalidAccepted.ok, false);
  assert.ok(invalidAccepted.issues.some((entry) => entry.path === "bindingMode"));
  assert.equal(validateCharacterVoiceProfile(acceptedProfile()).ok, true);
});

test("offscreen_once dialogue derives separately and never enters resident character casting", () => {
  const context = deriveCinematicDialogueContext({
    authorities: [{ authorityId: "character-authority-xu", authorityType: "character", displayName: "许岚", revision: 3 }],
    episodeId: "ep01",
    story: {
      dialogue: [
        { ordinal: 1, speakerId: "character-xu-lan", speakerType: "character", speaker: "许岚", text: "先清公共区。" },
        { ordinal: 2, speakerId: "offscreen-work-caller-ep01", speakerType: "offscreen_once", speaker: "电话远端", text: "这个今晚能改完吧？" }
      ]
    }
  });
  assert.equal(context.lineCount, 2);
  assert.equal(context.speakingRoles.length, 1);
  assert.equal(context.speakingRoles[0].characterAuthorityId, "character-authority-xu");
  assert.equal(context.offscreenLines.length, 1);
  assert.equal(context.offscreenLines[0].lineId, "ep01:dialogue:002");
});

test("character formal dialogue requires exact accepted profile plus visible audition and typed canvas edges", () => {
  const profile = acceptedProfile();
  const authority = {
    authorityId: "character-authority-xu",
    authorityType: "character",
    displayName: "许岚",
    revision: 4,
    status: "accepted",
    voiceProfile: profile
  };
  const dialogueNode = {
    id: "node-dialogue-xu-1",
    canvasId: "canvas-1",
    kind: "audio",
    payload: {
      resourceType: "cinematic_dialogue_line",
      dialogueLine: {
        episodeId: "ep01",
        lineId: "ep01:dialogue:001",
        speakerId: "character-xu-lan",
        speakerType: "character",
        transcript: "先清公共区。",
        characterAuthorityId: authority.authorityId
      },
      voiceAuthorityBinding: {
        characterAuthorityId: authority.authorityId,
        voiceProfileId: profile.voiceProfileId,
        authorityRevision: authority.revision,
        provider: profile.provider,
        providerSpeakerId: profile.speakerId,
        model: profile.model
      }
    }
  };
  const assetNode = {
    id: "node-character-xu",
    kind: "asset",
    payload: {
      authorityId: authority.authorityId,
      voiceAuthorityRevision: authority.revision,
      voiceProfile: profile
    }
  };
  const auditionNode = {
    id: "node-xu-audition",
    kind: "audio",
    payload: {
      currentMediaId: profile.acceptanceEvidence.auditionMediaId,
      voiceProfileId: profile.voiceProfileId
    }
  };
  const canvas = {
    nodes: [dialogueNode, assetNode, auditionNode],
    edges: [
      { fromNodeId: auditionNode.id, toNodeId: assetNode.id, role: "cinematic_voice:authority_reference" },
      { fromNodeId: assetNode.id, toNodeId: dialogueNode.id, role: CHARACTER_DIALOGUE_AUTHORITY_EDGE_ROLE }
    ]
  };
  const accepted = assessCinematicDialogueAudioRun({
    authorities: [authority],
    canvas,
    node: dialogueNode,
    provider: profile.provider,
    request: { text: "先清公共区。", speakerId: profile.speakerId, model: profile.model },
    reviews: [ownerFullPlaybackReview({
      checksum: profile.acceptanceEvidence.auditionChecksum,
      durationMs: profile.acceptanceEvidence.durationMs,
      id: profile.acceptanceEvidence.reviewId,
      mediaId: profile.acceptanceEvidence.auditionMediaId,
      purpose: "voice_audition"
    })]
  });
  assert.deepEqual(accepted.errors, []);
  const stale = assessCinematicDialogueAudioRun({
    authorities: [{ ...authority, revision: 5 }],
    canvas,
    node: dialogueNode,
    provider: profile.provider,
    request: { text: "先清公共区。", speakerId: profile.speakerId, model: profile.model },
    reviews: [ownerFullPlaybackReview({
      checksum: profile.acceptanceEvidence.auditionChecksum,
      durationMs: profile.acceptanceEvidence.durationMs,
      id: profile.acceptanceEvidence.reviewId,
      mediaId: profile.acceptanceEvidence.auditionMediaId,
      purpose: "voice_audition"
    })]
  });
  assert.ok(stale.errors.some((entry) => entry.code === "character_voice_binding_mismatch"));
});

test("offscreen_once formal dialogue requires accepted line-scoped authority and typed edge", () => {
  const authority = acceptedLineAuthority();
  assert.equal(validateLineVoiceAuthority(authority).ok, true);
  const dialogueNode = {
    id: "node-dialogue-caller",
    kind: "audio",
    payload: {
      resourceType: "cinematic_dialogue_line",
      dialogueLine: {
        episodeId: authority.episodeId,
        lineId: authority.lineId,
        speakerId: authority.speakerId,
        speakerType: authority.speakerType,
        transcript: authority.transcript
      },
      voiceAuthorityBinding: {
        lineVoiceAuthorityId: authority.lineVoiceAuthorityId,
        revision: authority.revision,
        provider: authority.provider,
        providerSpeakerId: authority.providerSpeakerId,
        model: authority.model
      }
    }
  };
  const authorityNode = {
    id: "node-line-authority",
    kind: "audio",
    payload: {
      resourceType: "line_voice_authority",
      currentMediaId: authority.acceptanceEvidence.auditionMediaId,
      lineVoiceAuthority: authority
    }
  };
  const result = assessCinematicDialogueAudioRun({
    canvas: {
      nodes: [dialogueNode, authorityNode],
      edges: [{ fromNodeId: authorityNode.id, toNodeId: dialogueNode.id, role: LINE_DIALOGUE_AUTHORITY_EDGE_ROLE }]
    },
    node: dialogueNode,
    provider: authority.provider,
    request: { text: authority.transcript, speakerId: authority.providerSpeakerId, model: authority.model },
    reviews: [ownerFullPlaybackReview({
      checksum: authority.acceptanceEvidence.auditionChecksum,
      durationMs: authority.acceptanceEvidence.durationMs,
      id: authority.acceptanceEvidence.reviewId,
      mediaId: authority.acceptanceEvidence.auditionMediaId,
      purpose: "voice_audition"
    })]
  });
  assert.deepEqual(result.errors, []);
});

test("POST node run blocks stale dialogue before creating a Provider Run", async () => {
  let createRunCalls = 0;
  let providerCalls = 0;
  const node = {
    id: "node-dialogue",
    canvasId: "canvas-1",
    kind: "audio",
    payload: {
      productionId: "production-1",
      resourceType: "cinematic_dialogue_line",
      dialogueLine: {
        episodeId: "ep01",
        lineId: "ep01:dialogue:001",
        speakerId: "character-xu-lan",
        speakerType: "character",
        transcript: "先清公共区。",
        characterAuthorityId: "character-authority-xu"
      },
      voiceAuthorityBinding: {
        characterAuthorityId: "character-authority-xu",
        voiceProfileId: "voice-stale",
        authorityRevision: 1,
        provider: "openspeech",
        providerSpeakerId: "speaker-stale",
        model: "seed-audio-1.0"
      }
    }
  };
  const useCases = createApplicationFoundationUseCases({
    ports: {
      credentials: {},
      media: {},
      projects: {
        createRun: async () => { createRunCalls += 1; },
        getNode: async () => node,
        getNodePrompt: async () => null,
        listCinematicAssetAuthorities: async () => [],
        listReviews: async () => [],
        openCanvas: async () => ({ id: "canvas-1", nodes: [node], edges: [] })
      },
      provider: {
        run: async () => { providerCalls += 1; }
      }
    }
  });
  await assert.rejects(
    () => useCases.runNode({
      projectId: "project-1",
      nodeId: node.id,
      provider: "openspeech",
      generationUnitId: "unit-1",
      generationUnitAuthorization: FORMAL_GENERATION_UNIT_RUN,
      request: { text: "先清公共区。", speakerId: "speaker-stale", model: "seed-audio-1.0" }
    }),
    (error) => error.code === "cinematic_dialogue_voice_gate_failed"
  );
  assert.equal(createRunCalls, 0);
  assert.equal(providerCalls, 0);
});

test("note-only accepted audition cannot authorize a formal dialogue Provider run", async () => {
  const profile = acceptedProfile();
  const authority = {
    authorityId: "character-authority-xu",
    authorityType: "character",
    revision: 4,
    status: "accepted",
    voiceProfile: profile
  };
  const node = {
    id: "node-dialogue-xu",
    kind: "audio",
    payload: {
      resourceType: "cinematic_dialogue_line",
      dialogueLine: {
        characterAuthorityId: authority.authorityId,
        episodeId: "ep01",
        lineId: "ep01:dialogue:001",
        speakerId: "character-xu-lan",
        speakerType: "character",
        transcript: "先清公共区。"
      },
      voiceAuthorityBinding: {
        authorityRevision: authority.revision,
        characterAuthorityId: authority.authorityId,
        model: profile.model,
        provider: profile.provider,
        providerSpeakerId: profile.speakerId,
        voiceProfileId: profile.voiceProfileId
      }
    }
  };
  const assetNode = {
    id: "asset-xu",
    kind: "asset",
    payload: { authorityId: authority.authorityId, voiceAuthorityRevision: authority.revision, voiceProfile: profile }
  };
  const auditionNode = {
    id: "audition-xu",
    kind: "audio",
    payload: { currentMediaId: profile.acceptanceEvidence.auditionMediaId, voiceProfileId: profile.voiceProfileId }
  };
  const result = assessCinematicDialogueAudioRun({
    authorities: [authority],
    canvas: {
      nodes: [node, assetNode, auditionNode],
      edges: [
        { fromNodeId: auditionNode.id, toNodeId: assetNode.id, role: "cinematic_voice:authority_reference" },
        { fromNodeId: assetNode.id, toNodeId: node.id, role: CHARACTER_DIALOGUE_AUTHORITY_EDGE_ROLE }
      ]
    },
    node,
    provider: profile.provider,
    request: { text: "先清公共区。", speakerId: profile.speakerId, model: profile.model },
    reviews: [{
      id: profile.acceptanceEvidence.reviewId,
      targetType: "media",
      targetId: profile.acceptanceEvidence.auditionMediaId,
      state: "accepted",
      note: "已完整试听，可以"
    }]
  });
  assert.ok(result.errors.some((entry) => entry.code === "character_voice_audition_review_required"));
});

test("OpenSpeech references=[] is rejected for formal dialogue before network submission", async () => {
  let fetchCalls = 0;
  const router = createProviderRouter({
    env: { OPENSPEECH_API_KEY: "test-key" },
    fetchImpl: async () => {
      fetchCalls += 1;
      return Response.json({ code: 0, audio: "YXVkaW8=" });
    }
  });
  await assert.rejects(
    () => router.run({
      projectId: "project-1",
      node: {
        id: "node-dialogue",
        kind: "audio",
        title: "对白",
        payload: { resourceType: "cinematic_dialogue_line" }
      },
      run: { id: "run-1", provider: "openspeech" },
      request: { text: "先清公共区。", model: "seed-audio-1.0" }
    }),
    (error) => error.code === "dialogue_provider_voice_binding_required"
  );
  assert.equal(fetchCalls, 0);
});
