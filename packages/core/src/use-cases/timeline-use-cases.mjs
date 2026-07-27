import {
  UnuTvError,
  assertCommandReceipt,
  assertTimelineDocumentV2,
  createId,
  nowIso,
  optionalText,
  requireEnum,
  requireNumber,
  requireObject,
  requireText,
  TIMELINE_TRACK_KINDS
} from "@ununu/unutv-contracts";
import { planMoveClip, planRippleClip, planSlipClip, planSnapClip, planSplitClip, planTrimClip, planUpdateClip } from "../timeline-edit-policy.mjs";

function bind(ports, method) {
  if (typeof ports.projects?.[method] !== "function") throw new TypeError(`Missing timeline port: projects.${method}`);
  return ports.projects[method].bind(ports.projects);
}

function defaultTracks(timestamp) {
  return [
    { id: createId("track"), kind: "video", name: "主视频轨", order: 0, locked: false, visible: true, muted: false, solo: false, color: "#294e98", payload: {}, createdAt: timestamp, updatedAt: timestamp },
    { id: createId("track"), kind: "audio", name: "主音频轨", order: 1, locked: false, visible: true, muted: false, solo: false, color: "#9c27b0", payload: {}, createdAt: timestamp, updatedAt: timestamp },
    { id: createId("track"), kind: "subtitle", name: "字幕轨", order: 2, locked: false, visible: true, muted: false, solo: false, color: "#795548", payload: {}, createdAt: timestamp, updatedAt: timestamp }
  ];
}

export function createTimelineUseCases(ports) {
  const createRecord = bind(ports, "createTimeline");
  const listRecords = bind(ports, "listTimelines");
  const getRecord = bind(ports, "getTimeline");
  const addClipRecord = bind(ports, "addTimelineClip");
  const commitCommand = bind(ports, "commitTimelineCommand");
  const undoCommand = bind(ports, "undoTimelineCommand");
  const redoCommand = bind(ports, "redoTimelineCommand");
  const commitResourceCommand = bind(ports, "commitTimelineResourceCommand");
  const undoResourceCommand = bind(ports, "undoTimelineResourceCommand");
  const redoResourceCommand = bind(ports, "redoTimelineResourceCommand");

  async function createTimeline(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timestamp = nowIso();
    return createRecord(projectId, {
      id: createId("timeline"), title: optionalText(input.title, "主时间线"), frameRate: requireNumber(input.frameRate, "frameRate", 30),
      width: requireNumber(input.width, "width", 1920), height: requireNumber(input.height, "height", 1080), colorSpace: optionalText(input.colorSpace, "Rec.709"),
      tracks: defaultTracks(timestamp), createdAt: timestamp, updatedAt: timestamp
    });
  }

  async function listTimelines(input = {}) { return listRecords(requireText(input.projectId, "projectId")); }

  async function getTimeline(input = {}) {
    const timeline = await getRecord(requireText(input.projectId, "projectId"), requireText(input.timelineId, "timelineId"));
    assertTimelineDocumentV2(timeline);
    return timeline;
  }

  async function addTimelineClip(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const track = Math.max(0, Math.round(requireNumber(input.track, "track", 0)));
    assertTrackUnlocked(timeline, track);
    return addClipRecord(projectId, {
      id: createId("clip"), timelineId, nodeId: input.nodeId ? requireText(input.nodeId, "nodeId") : null,
      mediaId: input.mediaId ? requireText(input.mediaId, "mediaId") : null, track, startMs: Math.max(0, Math.round(requireNumber(input.startMs, "startMs", 0))),
      durationMs: requireNumber(input.durationMs, "durationMs", 1000), trimInMs: requireNumber(input.trimInMs, "trimInMs", 0), payload: requireObject(input.payload, "payload", {}), createdAt: nowIso()
    });
  }

  async function requireClip(projectId, timelineId, clipId, timeline = null) {
    timeline ??= await getRecord(projectId, timelineId);
    const clip = timeline.clips.find((item) => item.id === clipId);
    if (!clip) throw new UnuTvError("timeline_clip_not_found", `Timeline clip not found: ${clipId}`, 404);
    return clip;
  }

  function assertTrackUnlocked(timeline, order) {
    const track = timeline.tracks.find((entry) => entry.order === order);
    if (!track) throw new UnuTvError("timeline_track_not_found", `Timeline track not found at order ${order}`, 404);
    if (track.locked) throw new UnuTvError("timeline_track_locked", `Track is locked: ${track.name}`, 423, { trackId: track.id, order: track.order });
    return track;
  }

  async function execute(input, commandType, planner) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const clip = await requireClip(projectId, timelineId, requireText(input.clipId, "clipId"), timeline);
    assertTrackUnlocked(timeline, clip.track);
    if (input.track !== undefined) assertTrackUnlocked(timeline, Math.max(0, Math.round(Number(input.track))));
    const timestamp = nowIso();
    const snapshots = planner(clip, timestamp, timeline);
    const command = {
      id: createId("command"), timelineId, commandType, ...snapshots,
      actorType: input.operationContext?.actorType ?? "owner", actorId: input.operationContext?.actorId ?? null,
      automationRunId: input.operationContext?.automationRunId ?? null, idempotencyKey: input.operationContext?.idempotencyKey ?? null,
      createdAt: timestamp, updatedAt: timestamp
    };
    const saved = await commitCommand(projectId, command);
    return { ...assertCommandReceipt({ commandId: saved.id, timelineId, commandType, affectedClipIds: saved.after.map((item) => item.id), status: "applied", createdAt: timestamp }), ...(snapshots.snap ? { snap: snapshots.snap } : {}) };
  }

  const moveTimelineClip = (input = {}) => execute(input, "move_clip", (clip) => planMoveClip(clip, input));
  const trimTimelineClip = (input = {}) => execute(input, "trim_clip", (clip) => planTrimClip(clip, input));
  const splitTimelineClip = (input = {}) => execute(input, "split_clip", (clip, timestamp) => planSplitClip(clip, input.splitAtMs, createId("clip"), timestamp));
  const updateTimelineClip = (input = {}) => execute(input, "update_clip", (clip) => planUpdateClip(clip, input));
  const rippleTimelineClip = (input = {}) => execute(input, "ripple_clip", (clip, _timestamp, timeline) => planRippleClip(timeline.clips, clip, input));
  const slipTimelineClip = (input = {}) => execute(input, "slip_clip", (clip) => planSlipClip(clip, input));
  const snapTimelineClip = (input = {}) => execute(input, "snap_clip", (clip, _timestamp, timeline) => planSnapClip(timeline, clip, input));

  async function resourceCommand(input, commandType, resourceType, before, after) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timestamp = nowIso();
    const command = {
      id: createId("command"),
      timelineId,
      commandType,
      resourceType,
      before,
      after,
      actorType: input.operationContext?.actorType ?? "owner",
      actorId: input.operationContext?.actorId ?? null,
      automationRunId: input.operationContext?.automationRunId ?? null,
      idempotencyKey: input.operationContext?.idempotencyKey ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const saved = await commitResourceCommand(projectId, command);
    return assertCommandReceipt({
      commandId: saved.id,
      timelineId,
      commandType,
      affectedResourceIds: [...new Set([...saved.before, ...saved.after].map((item) => item.id))],
      status: "applied",
      createdAt: timestamp
    });
  }

  function trackBundle(timeline, tracks) {
    return [{
      id: `track-order:${timeline.id}`,
      tracks,
      clipTracks: timeline.clips.map((clip) => ({ id: clip.id, track: clip.track }))
    }];
  }

  function remapClipTracks(timeline, orderByOldOrder) {
    return timeline.clips.map((clip) => ({ id: clip.id, track: orderByOldOrder.get(clip.track) ?? clip.track }));
  }

  async function addTimelineTrack(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const timestamp = nowIso();
    const order = input.order === undefined ? timeline.tracks.length : Math.max(0, Math.min(timeline.tracks.length, Math.round(requireNumber(input.order, "order"))));
    const shifted = timeline.tracks.filter((track) => track.order >= order);
    const track = {
      id: createId("track"), timelineId, kind: requireEnum(input.kind, TIMELINE_TRACK_KINDS, "kind"), name: optionalText(input.name, `轨道 ${order + 1}`), order,
      locked: false, visible: true, muted: false, solo: false, color: optionalText(input.color, "#6d4037"), payload: requireObject(input.payload, "payload", {}), createdAt: timestamp, updatedAt: timestamp
    };
    const tracks = [...timeline.tracks.filter((item) => item.order < order), track, ...shifted.map((item) => ({ ...item, order: item.order + 1, updatedAt: timestamp }))];
    const after = trackBundle(timeline, tracks);
    after[0].clipTracks = timeline.clips.map((clip) => ({ id: clip.id, track: clip.track >= order ? clip.track + 1 : clip.track }));
    return resourceCommand(input, "add_track", "track_order", trackBundle(timeline, timeline.tracks), after);
  }

  async function updateTimelineTrack(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const trackId = requireText(input.trackId, "trackId");
    const current = timeline.tracks.find((track) => track.id === trackId);
    if (!current) throw new UnuTvError("timeline_track_not_found", `Timeline track not found: ${trackId}`, 404);
    const patch = requireObject(input.patch, "patch", {});
    const next = {
      ...current,
      ...(patch.name !== undefined ? { name: requireText(patch.name, "patch.name") } : {}),
      ...(patch.kind !== undefined ? { kind: requireEnum(patch.kind, TIMELINE_TRACK_KINDS, "patch.kind") } : {}),
      ...(patch.locked !== undefined ? { locked: patch.locked === true } : {}),
      ...(patch.visible !== undefined ? { visible: patch.visible === true } : {}),
      ...(patch.muted !== undefined ? { muted: patch.muted === true } : {}),
      ...(patch.solo !== undefined ? { solo: patch.solo === true } : {}),
      ...(patch.color !== undefined ? { color: optionalText(patch.color, current.color) } : {}),
      ...(patch.payload !== undefined ? { payload: { ...current.payload, ...requireObject(patch.payload, "patch.payload") } } : {}),
      updatedAt: nowIso()
    };
    return resourceCommand(input, "update_track", "track", [current], [next]);
  }

  async function removeTimelineTrack(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const trackId = requireText(input.trackId, "trackId");
    const current = timeline.tracks.find((track) => track.id === trackId);
    if (!current) throw new UnuTvError("timeline_track_not_found", `Timeline track not found: ${trackId}`, 404);
    if (timeline.clips.some((clip) => clip.track === current.order)) throw new UnuTvError("timeline_track_not_empty", "Move or remove clips before deleting this track", 409);
    const tracks = timeline.tracks.filter((track) => track.id !== current.id).map((track) => track.order > current.order ? { ...track, order: track.order - 1, updatedAt: nowIso() } : track);
    const after = trackBundle(timeline, tracks);
    after[0].clipTracks = timeline.clips.map((clip) => ({ id: clip.id, track: clip.track > current.order ? clip.track - 1 : clip.track }));
    return resourceCommand(input, "remove_track", "track_order", trackBundle(timeline, timeline.tracks), after);
  }

  async function reorderTimelineTracks(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const ids = Array.isArray(input.trackIds) ? input.trackIds : [];
    if (ids.length !== timeline.tracks.length || new Set(ids).size !== ids.length || ids.some((id) => !timeline.tracks.some((track) => track.id === id))) throw new UnuTvError("timeline_track_reorder_invalid", "Track reorder must contain every track exactly once", 400);
    const before = timeline.tracks;
    const timestamp = nowIso();
    const byId = new Map(before.map((track) => [track.id, track]));
    const after = ids.map((id, order) => ({ ...byId.get(id), order, updatedAt: timestamp }));
    const orderByOldOrder = new Map(after.map((track) => [byId.get(track.id).order, track.order]));
    const afterBundle = trackBundle(timeline, after);
    afterBundle[0].clipTracks = remapClipTracks(timeline, orderByOldOrder);
    return resourceCommand(input, "reorder_tracks", "track_order", trackBundle(timeline, before), afterBundle);
  }

  async function timelineAndResource(input, collection, idField, label) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const id = requireText(input[idField], idField);
    const current = timeline[collection].find((entry) => entry.id === id);
    if (!current) throw new UnuTvError(`timeline_${label}_not_found`, `${label} not found: ${id}`, 404);
    return { projectId, timelineId, timeline, current };
  }

  async function addTimelineTransition(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const fromClip = await requireClip(projectId, timelineId, requireText(input.fromClipId, "fromClipId"), timeline);
    const toClip = await requireClip(projectId, timelineId, requireText(input.toClipId, "toClipId"), timeline);
    if (fromClip.id === toClip.id || fromClip.track !== toClip.track) throw new UnuTvError("timeline_transition_invalid", "A transition requires two different clips on the same track", 409);
    const track = assertTrackUnlocked(timeline, fromClip.track);
    const durationMs = Math.max(1, Math.round(requireNumber(input.durationMs, "durationMs", 250)));
    if (durationMs > Math.min(fromClip.durationMs, toClip.durationMs)) throw new UnuTvError("timeline_transition_too_long", "Transition duration exceeds a source clip", 409);
    const timestamp = nowIso();
    const transition = { id: createId("transition"), timelineId, trackId: track.id, fromClipId: fromClip.id, toClipId: toClip.id, kind: optionalText(input.kind, "crossfade"), durationMs, payload: requireObject(input.payload, "payload", {}), createdAt: timestamp, updatedAt: timestamp };
    return resourceCommand(input, "add_transition", "transition", [], [transition]);
  }

  async function updateTimelineTransition(input = {}) {
    const { timeline, current } = await timelineAndResource(input, "transitions", "transitionId", "transition");
    const track = timeline.tracks.find((entry) => entry.id === current.trackId);
    if (track) assertTrackUnlocked(timeline, track.order);
    const patch = requireObject(input.patch, "patch", {});
    const next = { ...current, ...(patch.kind !== undefined ? { kind: requireText(patch.kind, "patch.kind") } : {}), ...(patch.durationMs !== undefined ? { durationMs: Math.max(1, Math.round(requireNumber(patch.durationMs, "patch.durationMs"))) } : {}), ...(patch.payload !== undefined ? { payload: { ...current.payload, ...requireObject(patch.payload, "patch.payload") } } : {}), updatedAt: nowIso() };
    return resourceCommand(input, "update_transition", "transition", [current], [next]);
  }

  async function removeTimelineTransition(input = {}) {
    const { timeline, current } = await timelineAndResource(input, "transitions", "transitionId", "transition");
    const track = timeline.tracks.find((entry) => entry.id === current.trackId);
    if (track) assertTrackUnlocked(timeline, track.order);
    return resourceCommand(input, "remove_transition", "transition", [current], []);
  }

  async function addTimelineEffect(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const clip = await requireClip(projectId, timelineId, requireText(input.clipId, "clipId"), timeline);
    assertTrackUnlocked(timeline, clip.track);
    const timestamp = nowIso();
    const effect = { id: createId("effect"), timelineId, clipId: clip.id, kind: optionalText(input.kind, "transform"), enabled: input.enabled !== false, order: timeline.effects.filter((entry) => entry.clipId === clip.id).length, parameters: requireObject(input.parameters, "parameters", {}), createdAt: timestamp, updatedAt: timestamp };
    return resourceCommand(input, "add_effect", "effect", [], [effect]);
  }

  async function updateTimelineEffect(input = {}) {
    const { timeline, current } = await timelineAndResource(input, "effects", "effectId", "effect");
    const clip = await requireClip(input.projectId, input.timelineId, current.clipId, timeline);
    assertTrackUnlocked(timeline, clip.track);
    const patch = requireObject(input.patch, "patch", {});
    const next = { ...current, ...(patch.kind !== undefined ? { kind: requireText(patch.kind, "patch.kind") } : {}), ...(patch.enabled !== undefined ? { enabled: patch.enabled === true } : {}), ...(patch.order !== undefined ? { order: Math.max(0, Math.round(requireNumber(patch.order, "patch.order"))) } : {}), ...(patch.parameters !== undefined ? { parameters: { ...current.parameters, ...requireObject(patch.parameters, "patch.parameters") } } : {}), updatedAt: nowIso() };
    return resourceCommand(input, "update_effect", "effect", [current], [next]);
  }

  async function removeTimelineEffect(input = {}) {
    const { timeline, current } = await timelineAndResource(input, "effects", "effectId", "effect");
    const clip = await requireClip(input.projectId, input.timelineId, current.clipId, timeline);
    assertTrackUnlocked(timeline, clip.track);
    return resourceCommand(input, "remove_effect", "effect", [current], []);
  }

  async function addTimelineMarker(input = {}) {
    const timelineId = requireText(input.timelineId, "timelineId");
    await getRecord(requireText(input.projectId, "projectId"), timelineId);
    const timestamp = nowIso();
    const marker = { id: createId("marker"), timelineId, timeMs: Math.max(0, Math.round(requireNumber(input.timeMs, "timeMs", 0))), title: optionalText(input.title, "标记"), color: optionalText(input.color, "#ff715b"), payload: requireObject(input.payload, "payload", {}), createdAt: timestamp, updatedAt: timestamp };
    return resourceCommand(input, "add_marker", "marker", [], [marker]);
  }

  async function updateTimelineMarker(input = {}) {
    const { current } = await timelineAndResource(input, "markers", "markerId", "marker");
    const patch = requireObject(input.patch, "patch", {});
    const next = { ...current, ...(patch.timeMs !== undefined ? { timeMs: Math.max(0, Math.round(requireNumber(patch.timeMs, "patch.timeMs"))) } : {}), ...(patch.title !== undefined ? { title: requireText(patch.title, "patch.title") } : {}), ...(patch.color !== undefined ? { color: optionalText(patch.color, current.color) } : {}), ...(patch.payload !== undefined ? { payload: { ...current.payload, ...requireObject(patch.payload, "patch.payload") } } : {}), updatedAt: nowIso() };
    return resourceCommand(input, "update_marker", "marker", [current], [next]);
  }

  async function removeTimelineMarker(input = {}) {
    const { current } = await timelineAndResource(input, "markers", "markerId", "marker");
    return resourceCommand(input, "remove_marker", "marker", [current], []);
  }

  async function addTimelineKeyframe(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const timeline = await getRecord(projectId, timelineId);
    const clip = await requireClip(projectId, timelineId, requireText(input.clipId, "clipId"), timeline);
    assertTrackUnlocked(timeline, clip.track);
    const timeMs = Math.max(0, Math.round(requireNumber(input.timeMs, "timeMs", 0)));
    if (timeMs > clip.durationMs) throw new UnuTvError("timeline_keyframe_out_of_clip", "Keyframe time exceeds clip duration", 409);
    const timestamp = nowIso();
    const keyframe = { id: createId("keyframe"), timelineId, clipId: clip.id, propertyPath: requireText(input.propertyPath, "propertyPath"), timeMs, value: input.value ?? null, easing: optionalText(input.easing, "linear"), createdAt: timestamp, updatedAt: timestamp };
    return resourceCommand(input, "add_keyframe", "keyframe", [], [keyframe]);
  }

  async function updateTimelineKeyframe(input = {}) {
    const { timeline, current } = await timelineAndResource(input, "keyframes", "keyframeId", "keyframe");
    const clip = await requireClip(input.projectId, input.timelineId, current.clipId, timeline);
    assertTrackUnlocked(timeline, clip.track);
    const patch = requireObject(input.patch, "patch", {});
    const timeMs = patch.timeMs === undefined ? current.timeMs : Math.max(0, Math.round(requireNumber(patch.timeMs, "patch.timeMs")));
    if (timeMs > clip.durationMs) throw new UnuTvError("timeline_keyframe_out_of_clip", "Keyframe time exceeds clip duration", 409);
    const next = { ...current, timeMs, ...(patch.propertyPath !== undefined ? { propertyPath: requireText(patch.propertyPath, "patch.propertyPath") } : {}), ...(Object.hasOwn(patch, "value") ? { value: patch.value } : {}), ...(patch.easing !== undefined ? { easing: optionalText(patch.easing, "linear") } : {}), updatedAt: nowIso() };
    return resourceCommand(input, "update_keyframe", "keyframe", [current], [next]);
  }

  async function removeTimelineKeyframe(input = {}) {
    const { timeline, current } = await timelineAndResource(input, "keyframes", "keyframeId", "keyframe");
    const clip = await requireClip(input.projectId, input.timelineId, current.clipId, timeline);
    assertTrackUnlocked(timeline, clip.track);
    return resourceCommand(input, "remove_keyframe", "keyframe", [current], []);
  }

  async function undoTimelineResourceEdit(input = {}) {
    const timelineId = requireText(input.timelineId, "timelineId");
    const command = await undoResourceCommand(requireText(input.projectId, "projectId"), timelineId, nowIso());
    if (!command) throw new UnuTvError("timeline_resource_undo_empty", "There is no timeline resource command to undo", 409);
    return assertCommandReceipt({ commandId: command.id, timelineId, commandType: "undo", affectedResourceIds: [...new Set([...command.before, ...command.after].map((item) => item.id))], status: "undone", createdAt: nowIso() });
  }

  async function redoTimelineResourceEdit(input = {}) {
    const timelineId = requireText(input.timelineId, "timelineId");
    const command = await redoResourceCommand(requireText(input.projectId, "projectId"), timelineId, nowIso());
    if (!command) throw new UnuTvError("timeline_resource_redo_empty", "There is no timeline resource command to redo", 409);
    return assertCommandReceipt({ commandId: command.id, timelineId, commandType: "redo", affectedResourceIds: [...new Set([...command.before, ...command.after].map((item) => item.id))], status: "redone", createdAt: nowIso() });
  }

  async function undoTimelineEdit(input = {}) {
    const timelineId = requireText(input.timelineId, "timelineId");
    const command = await undoCommand(requireText(input.projectId, "projectId"), timelineId, nowIso());
    if (!command) throw new UnuTvError("timeline_undo_empty", "There is no timeline command to undo", 409);
    return assertCommandReceipt({ commandId: command.id, timelineId, commandType: "undo", affectedClipIds: command.before.map((item) => item.id), status: "undone", createdAt: nowIso() });
  }

  async function redoTimelineEdit(input = {}) {
    const timelineId = requireText(input.timelineId, "timelineId");
    const command = await redoCommand(requireText(input.projectId, "projectId"), timelineId, nowIso());
    if (!command) throw new UnuTvError("timeline_redo_empty", "There is no timeline command to redo", 409);
    return assertCommandReceipt({ commandId: command.id, timelineId, commandType: "redo", affectedClipIds: command.after.map((item) => item.id), status: "redone", createdAt: nowIso() });
  }

  return {
    addTimelineClip, addTimelineEffect, addTimelineKeyframe, addTimelineMarker, addTimelineTrack, addTimelineTransition,
    createTimeline, getTimeline, listTimelines, moveTimelineClip, redoTimelineEdit, redoTimelineResourceEdit, removeTimelineEffect,
    removeTimelineKeyframe, removeTimelineMarker, removeTimelineTrack, removeTimelineTransition, reorderTimelineTracks, rippleTimelineClip,
    slipTimelineClip, snapTimelineClip, splitTimelineClip, trimTimelineClip, undoTimelineEdit, undoTimelineResourceEdit, updateTimelineClip,
    updateTimelineEffect, updateTimelineKeyframe, updateTimelineMarker, updateTimelineTrack, updateTimelineTransition
  };
}
