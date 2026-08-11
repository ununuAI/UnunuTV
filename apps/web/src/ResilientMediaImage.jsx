"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, LoaderCircle } from "lucide-react";
import { MEDIA_IMAGE_RETRY_LIMIT, mediaImageRetryDelay, mediaImageRetryUrl } from "./resilient-media-image.js";

export function ResilientMediaImage({ alt, className, onLoad, src }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState("loading");
  const retryTimer = useRef(null);

  useEffect(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    setAttempt(0);
    setState("loading");
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [src]);

  const retry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (attempt >= MEDIA_IMAGE_RETRY_LIMIT) {
      setState("failed");
      return;
    }
    setState("retrying");
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      setAttempt((value) => value + 1);
      setState("loading");
    }, mediaImageRetryDelay(attempt));
  };

  return (
    <div className={`resilient-media-image${className ? ` ${className}` : ""}`} data-media-state={state}>
      <img
        alt={state === "loaded" ? alt : ""}
        onError={retry}
        onLoad={(event) => {
          setState("loaded");
          onLoad?.(event);
        }}
        src={mediaImageRetryUrl(src, attempt)}
      />
      {state === "loading" || state === "retrying" ? <span aria-label="图片加载中" className="resilient-media-state"><LoaderCircle size={22} /><b>加载图片</b></span> : null}
      {state === "failed" ? <span aria-label="图片加载失败" className="resilient-media-state is-failed"><ImageIcon size={24} /><b>图片暂时无法读取</b><small>媒体已保留，可刷新或稍后重试</small></span> : null}
    </div>
  );
}
