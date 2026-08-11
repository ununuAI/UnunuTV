"use client";

// 一个项目只开一条 SSE,多个组件共享订阅。
//
// 浏览器对同一域名的 HTTP/1.1 并发连接约 6 条,画布、时间线、权威投影
// 各开一条会吃掉一半额度,所以这里做连接复用:按 projectId 维护单例,
// 订阅者归零时才真正断开。
//
// 事件源是项目库的 events 表,CLI 与网页写的是同一份库,
// 因此终端里 agent 的改动同样从这条连接推过来。

import { useEffect, useRef } from "react";

/** projectId -> { source, listeners:Set<fn>, lastSequence:number } */
const channels = new Map();

function openChannel(projectId) {
  let channel = channels.get(projectId);
  if (channel) return channel;

  channel = { source: null, listeners: new Set(), lastSequence: 0 };
  channels.set(projectId, channel);

  const source = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/events`);
  source.onmessage = (message) => {
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    if (event.type === "stream.open") return;
    if (Number.isFinite(event.sequence)) channel.lastSequence = event.sequence;
    for (const listener of [...channel.listeners]) {
      try { listener(event); } catch { /* 单个订阅者出错不影响其他订阅者 */ }
    }
  };
  // 断线由 EventSource 自动重连,服务端读 Last-Event-ID 补齐缺口
  channel.source = source;
  return channel;
}

function closeChannelIfIdle(projectId) {
  const channel = channels.get(projectId);
  if (!channel || channel.listeners.size) return;
  channel.source?.close();
  channels.delete(projectId);
}

/**
 * 命令式订阅,给已经在 useEffect 里管生命周期的调用方用。
 * @returns 退订函数
 */
export function subscribeProjectEvents(projectId, onEvent, filter) {
  if (!projectId) return () => {};
  const channel = openChannel(projectId);
  const listener = (event) => {
    if (filter && !filter(event)) return;
    onEvent(event);
  };
  channel.listeners.add(listener);
  return () => {
    channel.listeners.delete(listener);
    closeChannelIfIdle(projectId);
  };
}

/**
 * 订阅某个项目的变更事件。
 * @param projectId 项目 id;为空时不建立连接
 * @param onEvent   收到事件的回调,内部用 ref 持有,不必 memo
 * @param filter    可选,返回 false 的事件不会触发回调
 */
export function useProjectEvents(projectId, onEvent, filter) {
  const handlerRef = useRef(onEvent);
  const filterRef = useRef(filter);
  handlerRef.current = onEvent;
  filterRef.current = filter;

  useEffect(() => {
    if (!projectId) return undefined;
    const channel = openChannel(projectId);
    const listener = (event) => {
      if (filterRef.current && !filterRef.current(event)) return;
      handlerRef.current?.(event);
    };
    channel.listeners.add(listener);
    return () => {
      channel.listeners.delete(listener);
      closeChannelIfIdle(projectId);
    };
  }, [projectId]);
}

/** 把一串事件合流成一次拉取,避免批量改动触发连续请求。 */
export function useDebouncedRefresh(refresh, delayMs = 80) {
  const timerRef = useRef(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  return useRef((...args) => {
    if (timerRef.current) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void refreshRef.current?.(...args);
    }, delayMs);
  }).current;
}

/** 事件类型前缀匹配,给订阅者写过滤条件用。 */
export const eventPrefix = (...prefixes) => (event) =>
  prefixes.some((prefix) => typeof event.type === "string" && event.type.startsWith(prefix));
