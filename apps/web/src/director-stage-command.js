/** 包一条 DirectorStageDocument 命令。commandId 用于服务端幂等。 */
export function command({ type, expectedRevision, payload }) {
  return {
    version: "director_stage_command_v1",
    commandId: `${type}-${crypto.randomUUID()}`,
    idempotencyKey: `web-director-v2:${type}:${crypto.randomUUID()}`,
    type,
    expectedRevision,
    actor: { actorType: "owner", actorId: "web-director-stage-v2" },
    payload
  };
}
