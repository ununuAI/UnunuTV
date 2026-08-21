"use client";

// 一个项目只开一条有限时增量轮询,多个组件共享订阅。
//
// 不使用永久 SSE：部分 Chrome 版本会把本地 EventSource 长连接持续显示为
// 标签页 loading。每次增量请求都会正常结束，同时仍保留跨页面实时同步。
//
// 事件源是项目库的 events 表,CLI 与网页写的是同一份库,
// 因此终端里 agent 的改动同样从这条连接推过来。

import { useEffect, useRef } from "react";

const EVENT_POLL_INTERVAL_MS = 1000;

/** projectId -> { listeners:Set<fn>, lastSequence:number|null, timer, controller } */
const channels = new Map();

function openChannel(projectId) {
  let channel = channels.get(projectId);
  if (channel) return channel;

  channel = { controller: null, listeners: new Set(), lastSequence: null, loadListener: null, timer: null };
  channels.set(projectId, channel);

  const poll = async () => {
    channel.timer = null;
    if (channels.get(projectId) !== channel) return;
    const controller = new AbortController();
    channel.controller = controller;
    try {
      const suffix = channel.lastSequence == null ? "" : `?since=${encodeURIComponent(channel.lastSequence)}`;
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/events/snapshot${suffix}`, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Event snapshot failed: ${response.status}`);
      const result = await response.json();
      if (Number.isFinite(result.latestSequence)) channel.lastSequence = result.latestSequence;
      for (const event of result.events || []) {
        for (const listener of [...channel.listeners]) {
          try { listener(event); } catch { /* 单个订阅者出错不影响其他订阅者 */ }
        }
      }
    } catch {
      // 本地服务重启或短暂不可达时下一轮自动恢复。
    } finally {
      if (channel.controller === controller) channel.controller = null;
      if (channel.listeners.size && channels.get(projectId) === channel) {
        channel.timer = window.setTimeout(() => { void poll(); }, EVENT_POLL_INTERVAL_MS);
      }
    }
  };
  const connect = () => {
    channel.loadListener = null;
    if (channel.timer || channel.controller || channels.get(projectId) !== channel) return;
    void poll();
  };
  if (document.readyState === "complete") connect();
  else {
    channel.loadListener = connect;
    window.addEventListener("load", connect, { once: true });
  }
  return channel;
}

function closeChannelIfIdle(projectId) {
  const channel = channels.get(projectId);
  if (!channel || channel.listeners.size) return;
  if (channel.loadListener) window.removeEventListener("load", channel.loadListener);
  if (channel.timer) window.clearTimeout(channel.timer);
  channel.controller?.abort();
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
