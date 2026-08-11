const OWNER_PIXEL_CHECKS = Object.freeze([
  "identity",
  "face",
  "hair",
  "wardrobe",
  "makeup",
  "bodyProportion"
]);

function authorityIdFor(node) {
  return node?.payload?.authorityId
    || node?.payload?.authority?.authorityId
    || null;
}

function authorityRevisionFor(node) {
  return Number(
    node?.payload?.authorityRevision
    ?? node?.payload?.authority?.revision
    ?? node?.payload?.revision
    ?? node?.revision
    ?? 0
  );
}

function nodeIsAuthority(node) {
  return node?.payload?.resourceType === "asset_authority";
}

function nodeIsProjectAsset(node) {
  return node?.payload?.resourceType === "project_asset";
}

function ownerPixelEvidenceFor(value) {
  return value?.ownerPixelReviewEvidence
    || value?.reviewEvidence
    || value?.payload?.ownerPixelReviewEvidence
    || value?.payload?.reviewEvidence
    || null;
}

function ownerPixelEvidenceIsFormal(evidence, version, authority) {
  if (!evidence || evidence.evidenceType !== "owner_full_frame_pixel_v1") return false;
  if (evidence.reviewerRole !== "owner" || evidence.reviewMode !== "full_frame_pixel" || evidence.fullFrameCoverage !== true) return false;
  if (!OWNER_PIXEL_CHECKS.every((field) => evidence.checks?.[field] === "pass")) return false;
  if (version.mediaId && evidence.targetMediaId !== version.mediaId) return false;
  if (version.mediaChecksum && evidence.targetMediaChecksum !== version.mediaChecksum) return false;
  if (version.assetId && evidence.assetId !== version.assetId) return false;
  if (version.assetVersionId && evidence.mediaRevisionId !== version.assetVersionId) return false;
  if (authority.authorityId && evidence.characterAuthorityId !== authority.authorityId) return false;
  if (authority.authorityRevision && Number(evidence.authorityRevision) !== Number(authority.authorityRevision)) return false;
  return true;
}

function versionEvidence(node, raw = {}) {
  const payload = node.payload || {};
  const assetVersionId = raw.assetVersionId || raw.versionId || payload.currentVersionId || null;
  const mediaId = raw.mediaId || payload.currentMediaId || null;
  const mediaChecksum = raw.mediaChecksum || raw.checksum || payload.currentMediaChecksum || payload.mediaChecksum || null;
  const promptHash = raw.promptHash || raw.compiledPromptHash || payload.promptHash || payload.compiledPromptHash || null;
  return {
    sourceNodeId: node.id,
    assetId: raw.assetId || payload.assetId || null,
    assetVersionId,
    authorityRevision: Number(raw.authorityRevision ?? payload.authorityRevision ?? 0),
    mediaId,
    mediaChecksum,
    promptHash,
    payloadHash: raw.payloadHash || payload.payloadHash || null,
    promptText: raw.promptText || payload.compiledPrompt || payload.prompt || null,
    providerRunId: raw.providerRunId || payload.providerRunId || null,
    compilationId: raw.compilationId || raw.cinematicImageCompilationId || payload.cinematicImageCompilationId || payload.compilationId || null,
    reviewState: raw.reviewState || raw.state || payload.authorityReviewStatus || payload.reviewState || "candidate",
    formalIdentityReady: raw.formalIdentityReady === true || payload.formalIdentityReady === true,
    ownerPixelReviewEvidence: ownerPixelEvidenceFor(raw) || ownerPixelEvidenceFor(payload)
  };
}

function versionsFor(node) {
  const rawVersions = node?.payload?.authorityMediaVersions;
  if (Array.isArray(rawVersions) && rawVersions.length) {
    return rawVersions.map((raw) => versionEvidence(node, raw));
  }
  const current = versionEvidence(node);
  return current.mediaId || current.assetVersionId || current.providerRunId || current.compilationId ? [current] : [];
}

function compareAuthorityNodes(left, right) {
  const revisionDelta = authorityRevisionFor(right) - authorityRevisionFor(left);
  if (revisionDelta) return revisionDelta;
  const updatedDelta = String(right.updatedAt || right.payload?.updatedAt || "").localeCompare(String(left.updatedAt || left.payload?.updatedAt || ""));
  if (updatedDelta) return updatedDelta;
  return String(right.id).localeCompare(String(left.id));
}

function compareVersions(left, right) {
  const revisionDelta = Number(right.authorityRevision || 0) - Number(left.authorityRevision || 0);
  if (revisionDelta) return revisionDelta;
  return String(right.assetVersionId || right.mediaId || right.sourceNodeId).localeCompare(String(left.assetVersionId || left.mediaId || left.sourceNodeId));
}

function compareExecutionNodes(left, right) {
  const leftRunning = left?.payload?.generationStatus === "running" ? 1 : 0;
  const rightRunning = right?.payload?.generationStatus === "running" ? 1 : 0;
  if (leftRunning !== rightRunning) return rightRunning - leftRunning;
  const updatedDelta = String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || ""));
  if (updatedDelta) return updatedDelta;
  return Number(right?.revision || 0) - Number(left?.revision || 0);
}

function generationProjectionFor(projectAssetNodes) {
  const source = [...projectAssetNodes]
    .filter((node) => node?.payload?.generationStatus)
    .sort(compareExecutionNodes)[0];
  if (!source) return null;
  const payload = source.payload || {};
  const running = payload.generationStatus === "running";
  return {
    sourceNodeId: source.id,
    status: payload.generationStatus,
    phase: payload.generationPhase || null,
    message: payload.generationMessage || null,
    requestId: payload.generationRequestId || null,
    runId: payload.generationRunId || (running ? null : payload.providerRunId) || null,
    provider: payload.generationProvider || payload.provider || null,
    model: payload.generationModel || payload.modelId || null,
    resolution: payload.generationResolution || null,
    count: Number(payload.generationCount || 0) || null,
    background: payload.generationBackground || null,
    compilationId: payload.cinematicImageCompilationId || payload.compilationId || null
  };
}

function matchingVersion(versions, value) {
  if (!value) return null;
  return versions.find((version) => (
    (value.assetVersionId && version.assetVersionId === value.assetVersionId)
    || (value.mediaId && version.mediaId === value.mediaId)
  )) || null;
}

function backendVersionEvidence(raw = {}, backendAggregate = {}, canvasVersions = []) {
  const canvasVersion = matchingVersion(canvasVersions, raw);
  const providerRun = (backendAggregate.candidateRuns || []).find((run) => run.runId === raw.providerRunId) || null;
  const evidence = raw.ownerPixelReviewEvidence || raw.reviewEvidence || raw.latestReview?.evidence || raw.review?.evidence || null;
  return {
    ...(canvasVersion || {}),
    ...raw,
    sourceNodeId: canvasVersion?.sourceNodeId || null,
    authorityRevision: Number(
      raw.authorityRevision
      ?? raw.appearanceProvenance?.authorityRevision
      ?? raw.identityProvenance?.authorityRevision
      ?? backendAggregate.authorityRevision
      ?? 0
    ),
    mediaChecksum: raw.mediaChecksum || canvasVersion?.mediaChecksum || null,
    promptHash: raw.promptHash || canvasVersion?.promptHash || null,
    payloadHash: raw.payloadHash || providerRun?.payloadHash || canvasVersion?.payloadHash || null,
    providerRunId: raw.providerRunId || providerRun?.runId || canvasVersion?.providerRunId || null,
    compilationId: raw.compilationId || providerRun?.compilationId || canvasVersion?.compilationId || null,
    reviewState: raw.reviewState || raw.latestReview?.state || raw.review?.state || canvasVersion?.reviewState || "candidate",
    formalIdentityReady: raw.formalIdentityReady === true,
    ownerPixelReviewEvidence: evidence
  };
}

function mergeBackendAggregate(canvasAggregation, backendAggregate) {
  if (!backendAggregate) return canvasAggregation;
  const versions = (backendAggregate.versions || backendAggregate.mediaHistory || [])
    .map((version) => backendVersionEvidence(version, backendAggregate, canvasAggregation.versions))
    .sort(compareVersions);
  const currentApproved = matchingVersion(versions, backendAggregate.currentApproved)
    || (backendAggregate.currentApproved ? backendVersionEvidence(backendAggregate.currentApproved, backendAggregate, canvasAggregation.versions) : null);
  const currentCandidate = matchingVersion(versions, backendAggregate.currentCandidate)
    || (backendAggregate.currentCandidate ? backendVersionEvidence(backendAggregate.currentCandidate, backendAggregate, canvasAggregation.versions) : null);
  const candidates = (backendAggregate.candidates || [])
    .map((candidate) => matchingVersion(versions, candidate) || backendVersionEvidence(candidate, backendAggregate, canvasAggregation.versions));
  return {
    ...canvasAggregation,
    authorityRevision: Number(backendAggregate.authorityRevision || canvasAggregation.authorityRevision),
    authorityType: backendAggregate.authorityType || null,
    authorityStatus: backendAggregate.authorityStatus || null,
    canonicalAuthority: backendAggregate.canonicalAuthority || null,
    currentApproved,
    currentAccepted: currentApproved,
    currentCandidate,
    versions: versions.length ? versions : canvasAggregation.versions,
    candidates: candidates.length ? candidates : versions.filter((version) => version !== currentApproved),
    displayMediaFormal: Boolean(currentApproved),
    formalReady: backendAggregate.formalReady === true,
    formalSourceBinding: backendAggregate.formalSourceBinding || null,
    voiceStatus: backendAggregate.voiceStatus || null
  };
}

function aggregateGroup(authorityId, authorityNodes, projectAssetNodes) {
  const orderedAuthorities = [...authorityNodes].sort(compareAuthorityNodes);
  const canonical = orderedAuthorities[0] || [...projectAssetNodes].sort(compareAuthorityNodes)[0];
  const authorityRevision = authorityRevisionFor(canonical);
  const authority = { authorityId, authorityRevision };
  const versions = projectAssetNodes.flatMap(versionsFor).sort(compareVersions);
  const formallyAccepted = versions.filter((version) => {
    if (version.formalIdentityReady) return true;
    if (version.reviewState !== "accepted") return false;
    return ownerPixelEvidenceIsFormal(version.ownerPixelReviewEvidence, version, authority);
  });
  const currentApproved = formallyAccepted[0] || null;
  const currentCandidate = versions.find((version) => version !== currentApproved) || null;
  const sourceNodes = [...authorityNodes, ...projectAssetNodes];
  const generation = generationProjectionFor(projectAssetNodes);
  return {
    canonical,
    aggregation: {
      authorityId,
      authorityRevision,
      authorityNodeIds: authorityNodes.map((node) => node.id),
      projectAssetNodeIds: projectAssetNodes.map((node) => node.id),
      sourceNodeIds: sourceNodes.map((node) => node.id),
      currentApproved,
      currentCandidate,
      versions,
      candidates: versions.filter((version) => version !== currentApproved),
      displayMediaFormal: Boolean(currentApproved),
      generation,
      embeddedEdges: []
    }
  };
}

function mergeExternalEdges(edges, canonicalByNodeId) {
  const merged = new Map();
  const embedded = [];
  for (const edge of edges) {
    const fromNodeId = canonicalByNodeId.get(edge.fromNodeId) || edge.fromNodeId;
    const toNodeId = canonicalByNodeId.get(edge.toNodeId) || edge.toNodeId;
    const evidence = {
      sourceEdgeId: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      role: edge.role || null
    };
    if (fromNodeId === toNodeId) {
      embedded.push({ ...edge, aggregationEvidence: { sourceEdgeId: edge.id, originalEndpoints: [evidence] } });
      continue;
    }
    const key = `${fromNodeId}\u0000${toNodeId}\u0000${edge.role || ""}`;
    const existing = merged.get(key);
    if (existing) {
      existing.aggregationEvidence.edgeIds.push(edge.id);
      existing.aggregationEvidence.originalEndpoints.push(evidence);
      continue;
    }
    merged.set(key, {
      ...edge,
      fromNodeId,
      toNodeId,
      aggregationEvidence: {
        edgeIds: [edge.id],
        originalEndpoints: [evidence]
      }
    });
  }
  return { edges: [...merged.values()], embedded };
}

export function buildCanonicalAuthorityCanvasView(canvas = {}, backendAggregates = []) {
  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
  const edges = Array.isArray(canvas.edges) ? canvas.edges : [];
  const grouped = new Map();
  for (const node of nodes) {
    if (!nodeIsAuthority(node) && !nodeIsProjectAsset(node)) continue;
    const authorityId = authorityIdFor(node);
    if (!authorityId) continue;
    const group = grouped.get(authorityId) || { authorities: [], projectAssets: [] };
    (nodeIsAuthority(node) ? group.authorities : group.projectAssets).push(node);
    grouped.set(authorityId, group);
  }

  const canonicalByNodeId = new Map();
  const aggregateByCanonicalId = new Map();
  const backendByAuthorityId = new Map((backendAggregates || []).map((aggregate) => [aggregate.authorityId, aggregate]));
  for (const [authorityId, group] of grouped) {
    const result = aggregateGroup(authorityId, group.authorities, group.projectAssets);
    for (const node of [...group.authorities, ...group.projectAssets]) canonicalByNodeId.set(node.id, result.canonical.id);
    aggregateByCanonicalId.set(
      result.canonical.id,
      mergeBackendAggregate(result.aggregation, backendByAuthorityId.get(authorityId))
    );
  }

  const { edges: visibleEdges, embedded } = mergeExternalEdges(edges, canonicalByNodeId);
  for (const edge of embedded) {
    const canonicalId = canonicalByNodeId.get(edge.fromNodeId) || edge.fromNodeId;
    const aggregation = aggregateByCanonicalId.get(canonicalId);
    if (aggregation) aggregation.embeddedEdges.push(edge);
  }

  const visibleNodes = [];
  for (const node of nodes) {
    const canonicalId = canonicalByNodeId.get(node.id);
    if (canonicalId && canonicalId !== node.id) continue;
    const aggregation = aggregateByCanonicalId.get(node.id);
    const mediaIds = aggregation?.versions?.map((version) => version.mediaId).filter(Boolean) || [];
    const displayVersion = aggregation?.currentApproved || aggregation?.currentCandidate || aggregation?.versions?.[0] || null;
    visibleNodes.push(aggregation
      ? {
          ...node,
          payload: {
            ...(node.payload || {}),
            authorityId: aggregation.authorityId,
            authorityRevision: aggregation.authorityRevision,
            authorityAggregation: aggregation,
            authorityMediaVersions: aggregation.versions,
            mediaIds,
            historyMediaIds: mediaIds,
            ...(aggregation.generation ? {
              generationStatus: aggregation.generation.status,
              generationPhase: aggregation.generation.phase,
              generationMessage: aggregation.generation.message,
              generationRequestId: aggregation.generation.requestId,
              generationRunId: aggregation.generation.runId,
              generationProvider: aggregation.generation.provider,
              generationModel: aggregation.generation.model,
              generationResolution: aggregation.generation.resolution,
              generationCount: aggregation.generation.count,
              generationBackground: aggregation.generation.background,
              generationSourceNodeId: aggregation.generation.sourceNodeId
            } : {}),
            ...(displayVersion?.mediaId ? {
              currentMediaId: displayVersion.mediaId,
              currentMediaChecksum: displayVersion.mediaChecksum || null,
              currentVersionId: displayVersion.assetVersionId || null,
              candidateReviewStatus: aggregation.currentApproved ? "accepted" : "candidate",
              authorityReviewStatus: aggregation.currentApproved ? "accepted" : "candidate"
            } : {})
          }
        }
      : node);
  }

  return {
    ...canvas,
    nodes: visibleNodes,
    edges: visibleEdges,
    receipt: {
      sourceNodeCount: nodes.length,
      visibleNodeCount: visibleNodes.length,
      visibleAuthorityNodeCount: aggregateByCanonicalId.size,
      collapsedTopLevelNodeCount: nodes.length - visibleNodes.length,
      sourceEdgeCount: edges.length,
      visibleEdgeCount: visibleEdges.length,
      preservedEdgeEvidenceCount: visibleEdges.reduce((total, edge) => total + (edge.aggregationEvidence?.edgeIds?.length || 1), 0) + embedded.length
    }
  };
}
