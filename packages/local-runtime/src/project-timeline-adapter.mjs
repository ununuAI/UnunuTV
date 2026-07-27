import {
  commitTimelineCommand,
  commitTimelineResourceCommand,
  insertStoryboardTimelineClip,
  insertTimeline,
  insertTimelineClip,
  redoTimelineCommand,
  redoTimelineResourceCommand,
  selectTimeline,
  selectTimelines,
  undoTimelineCommand,
  undoTimelineResourceCommand
} from "./timeline-store.mjs";

export function attachProjectTimelineMethods(prototype, event) {
  prototype.createTimeline = function createTimeline(projectId, timeline) {
    const database = this.database(projectId);
    insertTimeline(database, timeline);
    event(database, "timeline.created", timeline.id);
    return timeline;
  };
  prototype.listTimelines = function listTimelines(projectId) { return selectTimelines(this.database(projectId)); };
  prototype.addTimelineClip = function addTimelineClip(projectId, clip) {
    const database = this.database(projectId);
    insertTimelineClip(database, clip);
    event(database, "timeline.clip_added", clip.id, { timelineId: clip.timelineId });
    return clip;
  };
  prototype.insertStoryboardTimelineClip = function insertStoryboardClip(projectId, clip) {
    const database = this.database(projectId);
    const saved = insertStoryboardTimelineClip(database, clip);
    event(database, "timeline.storyboard_clip_inserted", clip.timelineId, { clipId: clip.id, storyboardId: clip.payload?.storyboardId, storyboardShotId: clip.payload?.storyboardShotId });
    return saved;
  };
  prototype.commitTimelineCommand = function commitCommand(projectId, command) {
    const database = this.database(projectId);
    const saved = commitTimelineCommand(database, command);
    event(database, "timeline.command_applied", command.timelineId, { commandId: command.id, commandType: command.commandType, affectedClipIds: command.after.map((clip) => clip.id) });
    return saved;
  };
  prototype.undoTimelineCommand = function undoCommand(projectId, timelineId, timestamp) {
    const database = this.database(projectId);
    const command = undoTimelineCommand(database, timelineId, timestamp);
    if (command) event(database, "timeline.command_undone", timelineId, { commandId: command.id, commandType: command.commandType });
    return command;
  };
  prototype.redoTimelineCommand = function redoCommand(projectId, timelineId, timestamp) {
    const database = this.database(projectId);
    const command = redoTimelineCommand(database, timelineId, timestamp);
    if (command) event(database, "timeline.command_redone", timelineId, { commandId: command.id, commandType: command.commandType });
    return command;
  };
  prototype.commitTimelineResourceCommand = function commitResourceCommand(projectId, command) {
    const database = this.database(projectId);
    const saved = commitTimelineResourceCommand(database, command);
    event(database, "timeline.resource_command_applied", command.timelineId, { commandId: command.id, commandType: command.commandType, resourceType: command.resourceType, affectedResourceIds: command.after.map((entry) => entry.id) });
    return saved;
  };
  prototype.undoTimelineResourceCommand = function undoResourceCommand(projectId, timelineId, timestamp) {
    const database = this.database(projectId);
    const command = undoTimelineResourceCommand(database, timelineId, timestamp);
    if (command) event(database, "timeline.resource_command_undone", timelineId, { commandId: command.id, commandType: command.commandType, resourceType: command.resourceType });
    return command;
  };
  prototype.redoTimelineResourceCommand = function redoResourceCommand(projectId, timelineId, timestamp) {
    const database = this.database(projectId);
    const command = redoTimelineResourceCommand(database, timelineId, timestamp);
    if (command) event(database, "timeline.resource_command_redone", timelineId, { commandId: command.id, commandType: command.commandType, resourceType: command.resourceType });
    return command;
  };
  prototype.getTimeline = function getTimeline(projectId, timelineId) { return selectTimeline(this.database(projectId), timelineId); };
}
