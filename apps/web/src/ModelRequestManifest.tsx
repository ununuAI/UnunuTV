"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, FlaskConical, Route, Send } from "lucide-react";
import type { ModelExecutionReceiptViewModel, ModelReferenceKind, ModelRequestManifestViewModel } from "./prompt-types";

const REFERENCE_LABELS: Record<ModelReferenceKind, string> = {
  audio: "音频",
  document: "文档",
  image: "图片",
  other: "其他",
  text: "文本",
  video: "视频"
};

function referenceSummary(manifest: ModelRequestManifestViewModel) {
  const active = Object.entries(manifest.referenceCounts).filter(([, count]) => count > 0) as Array<[ModelReferenceKind, number]>;
  return active.length > 0 ? active.map(([kind, count]) => `${REFERENCE_LABELS[kind]} ${count}`).join(" · ") : "无输入参考";
}

function parameterSummary(manifest: ModelRequestManifestViewModel) {
  if (manifest.parameters.size || manifest.parameters.quality || manifest.parameters.n) {
    return [manifest.parameters.size, manifest.parameters.quality, manifest.parameters.n ? `${manifest.parameters.n}张` : undefined].filter(Boolean).join(" · ");
  }
  return [manifest.parameters.ratio, manifest.parameters.resolution].filter(Boolean).join(" · ") || "默认参数";
}

export function ModelRequestManifest({
  manifest,
  receipt
}: {
  manifest?: ModelRequestManifestViewModel;
  receipt?: ModelExecutionReceiptViewModel;
}) {
  if (!manifest) return null;

  const blocked = manifest.preflight.status === "blocked" || receipt?.status === "blocked";
  const stateLabel = blocked ? "已阻止" : receipt?.status === "simulated" ? "模拟完成" : "预检通过";

  return (
    <details className="model-request-manifest" data-model-manifest-state={blocked ? "blocked" : receipt?.status ?? "ready"}>
      <summary>
        <span className="manifest-title">
          <Send size={13} />
          模型请求清单 v1
        </span>
        <span className={`manifest-state ${blocked ? "blocked" : "ready"}`}>{stateLabel}</span>
        <ChevronDown className="manifest-chevron" size={13} />
      </summary>
      <div className="manifest-content">
        <div className="manifest-facts">
          <span><FlaskConical size={12} />{manifest.model.alias}</span>
          <span><Route size={12} />{manifest.model.providerRoute}</span>
          <span>{parameterSummary(manifest)}</span>
          <span>{referenceSummary(manifest)}</span>
        </div>
        <div className="manifest-prompt">
          <span>Prompt</span>
          <p>{manifest.prompt || "未提供"}</p>
        </div>
        {manifest.preflight.issues.length > 0 ? (
          <div className="manifest-issues" aria-label="模型请求阻断原因">
            {manifest.preflight.issues.map((entry) => (
              <p key={`${entry.code}-${entry.referenceKind ?? "general"}`}>
                <AlertTriangle size={12} />
                {entry.message}
              </p>
            ))}
          </div>
        ) : (
          <p className="manifest-pass"><CheckCircle2 size={12} />预检通过，可进入本地模拟适配器。</p>
        )}
        {receipt ? (
          <p className={`manifest-receipt ${receipt.status}`}>
            {receipt.status === "blocked" ? "执行回执：请求未进入模型适配器。" : receipt.message}
          </p>
        ) : null}
      </div>
    </details>
  );
}


