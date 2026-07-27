"use client";

import { AudioLines, ChevronDown, FileText, Files, Image as ImageIcon, Layers3, Video as VideoIcon } from "lucide-react";
import type { CanvasNode, ModelReferenceKind, ModelReferencePacketViewModel } from "./prompt-types";

const REFERENCE_KINDS: Array<{
  icon: typeof FileText;
  kind: ModelReferenceKind;
  label: string;
}> = [
  { icon: FileText, kind: "text", label: "文本" },
  { icon: ImageIcon, kind: "image", label: "图片" },
  { icon: VideoIcon, kind: "video", label: "视频" },
  { icon: AudioLines, kind: "audio", label: "音频" },
  { icon: Files, kind: "document", label: "文档" },
  { icon: Layers3, kind: "other", label: "其他" }
];

function mediaKindsLabel(kinds: ModelReferenceKind[]) {
  if (kinds.length === 0) return "文本";
  return kinds.map((kind) => REFERENCE_KINDS.find((entry) => entry.kind === kind)?.label ?? kind).join(" / ");
}

export function ModelReferencePacket({
  packet,
  sourceNodes
}: {
  packet?: ModelReferencePacketViewModel;
  sourceNodes: CanvasNode[];
}) {
  if (!packet && sourceNodes.length === 0) return null;

  const prepared = Boolean(packet);
  const sources = packet?.sources ?? sourceNodes.map((source) => ({
    mediaKinds: [] as ModelReferenceKind[],
    nodeId: source.id,
    nodeKind: source.kind,
    title: source.title
  }));

  return (
    <details className="model-reference-packet" data-reference-packet-state={prepared ? "prepared" : "preview"}>
      <summary>
        <span className="reference-packet-title">
          <Layers3 size={13} />
          {prepared ? "模型参考包 v1" : `参考预览 · 输入 ${sourceNodes.length}`}
        </span>
        <span className={`reference-packet-state ${prepared ? "prepared" : "preview"}`}>{prepared ? "已固定" : "待固定"}</span>
        <ChevronDown className="reference-packet-chevron" size={13} />
      </summary>
      <div className="reference-packet-content">
        {packet ? (
          <div className="reference-packet-counts" aria-label="模型参考分类计数">
            {REFERENCE_KINDS.map(({ icon: Icon, kind, label }) => (
              <span className={packet.counts[kind] > 0 ? "active" : ""} key={kind} title={`${label}参考 ${packet.counts[kind]} 个`}>
                <Icon size={12} />
                {label} {packet.counts[kind]}
              </span>
            ))}
          </div>
        ) : null}
        <div className="reference-packet-sources" aria-label="输入参考来源">
          {sources.map((source, index) => (
            <div className="reference-packet-source" key={source.nodeId}>
              <span className="reference-packet-index">{index + 1}</span>
              <span className="reference-packet-source-name" title={source.title}>{source.title}</span>
              <span className="reference-packet-source-kind">{source.nodeKind} · {prepared ? mediaKindsLabel(source.mediaKinds) : "待准备"}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}


