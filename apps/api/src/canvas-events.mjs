// SSE 事件流,取代浏览器轮询。
//
// 事件源是项目库里已有的 events 表(31 个写入点,覆盖 node/edge/group/media/run)。
// CLI 走同一份 project-store 写同一个 SQLite 文件,所以终端里 agent 的改动
// 同样落进这张表 —— 这是「网页跑本地、agent 在终端」能实时联动的关键。
//
// 两条推送路径:
//   API 内改动   请求处理完直接 notify(),零延迟
//   CLI 改动     服务端轻量监听 MAX(sequence),只在有订阅者时运行
// 浏览器一次轮询都不发。

const WATCH_INTERVAL_MS = 200;
const HEARTBEAT_MS = 25000;

export function createCanvasEventHub(runtime) {
  /** projectId -> Set<{ response, lastSequence }> */
  const rooms = new Map();
  let watchTimer = null;

  function maxSequence(projectId) {
    try {
      const database = runtime.projects.database(projectId);
      return Number(database.prepare("SELECT MAX(sequence) AS seq FROM events").get()?.seq ?? 0);
    } catch {
      return 0;
    }
  }

  function eventsSince(projectId, sequence, limit = 200) {
    try {
      const database = runtime.projects.database(projectId);
      return database
        .prepare(
          `SELECT sequence, type, entity_id AS entityId, payload_json AS payloadJson, created_at AS createdAt
           FROM events WHERE sequence > ? ORDER BY sequence LIMIT ?`
        )
        .all(sequence, limit)
        .map((row) => ({
          sequence: Number(row.sequence),
          type: row.type,
          entityId: row.entityId,
          createdAt: row.createdAt,
          payload: safeParse(row.payloadJson)
        }));
    } catch {
      return [];
    }
  }

  function flush(projectId) {
    const room = rooms.get(projectId);
    if (!room?.size) return;
    for (const client of room) {
      const pending = eventsSince(projectId, client.lastSequence);
      if (!pending.length) continue;
      client.lastSequence = pending.at(-1).sequence;
      for (const item of pending) write(client.response, item);
    }
  }

  /** API 内改动:请求处理完直接推,不等监听周期。 */
  function notify(projectId) {
    if (projectId && rooms.has(projectId)) flush(projectId);
  }

  function ensureWatching() {
    if (watchTimer || !rooms.size) return;
    watchTimer = setInterval(() => {
      for (const projectId of rooms.keys()) {
        const room = rooms.get(projectId);
        if (!room?.size) continue;
        // 只有落后于库里最新 sequence 的房间才做实际查询
        const latest = maxSequence(projectId);
        for (const client of room) {
          if (client.lastSequence < latest) {
            flush(projectId);
            break;
          }
        }
      }
    }, WATCH_INTERVAL_MS);
    watchTimer.unref?.();
  }

  function stopWatchingIfIdle() {
    if (watchTimer && !rooms.size) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
  }

  /** GET /api/projects/:projectId/events?since=<sequence> */
  function handle(request, response, projectId, since) {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    // EventSource 自动重连时带 Last-Event-ID,据此补齐断线期间的缺口
    const resumeFrom = request.headers["last-event-id"] ?? since;
    const start = resumeFrom != null && resumeFrom !== "" && Number.isFinite(Number(resumeFrom))
      ? Number(resumeFrom)
      : maxSequence(projectId);
    const client = { response, lastSequence: start };

    if (!rooms.has(projectId)) rooms.set(projectId, new Set());
    rooms.get(projectId).add(client);
    ensureWatching();

    write(response, { type: "stream.open", sequence: start });
    flush(projectId);

    const heartbeat = setInterval(() => response.write(": ping\n\n"), HEARTBEAT_MS);
    heartbeat.unref?.();

    const cleanup = () => {
      clearInterval(heartbeat);
      const room = rooms.get(projectId);
      room?.delete(client);
      if (room && !room.size) rooms.delete(projectId);
      stopWatchingIfIdle();
    };
    request.on("close", cleanup);
    request.on("error", cleanup);
  }

  function close() {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
    for (const room of rooms.values()) {
      for (const client of room) client.response.end();
    }
    rooms.clear();
  }

  function snapshot(projectId, since) {
    const start = since != null && since !== "" && Number.isFinite(Number(since))
      ? Number(since)
      : maxSequence(projectId);
    const events = eventsSince(projectId, start);
    return {
      events,
      latestSequence: events.at(-1)?.sequence ?? start
    };
  }

  return { handle, notify, close, snapshot };
}

function write(response, payload) {
  if (response.writableEnded) return;
  if (payload.sequence != null) response.write(`id: ${payload.sequence}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function safeParse(value) {
  try {
    return JSON.parse(value ?? "{}");
  } catch {
    return {};
  }
}
