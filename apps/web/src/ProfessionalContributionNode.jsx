"use client";

import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { professionalContributionPresentation } from "./node-presentation-view-model.js";

export function ProfessionalContributionNode({ node }) {
  const review = professionalContributionPresentation(node);
  if (!review) return null;
  const accepted = review.status === "accepted" && !review.stale;
  return <div className="professional-contribution-node">
    <header><span><ClipboardCheck size={16} />{review.label}</span><em className={accepted ? "is-accepted" : "is-attention"}>{accepted ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{review.stale ? "已失效" : review.status}</em></header>
    <p>{review.description}</p>
    <dl className="professional-contribution-binding">
      <div><dt>Story</dt><dd>{review.targetId || "未绑定"}{review.storyRevision ? ` · r${review.storyRevision}` : ""}</dd></div>
      <div><dt>Screenplay</dt><dd>{review.screenplayDocumentId || "旧审核未绑定完整剧本"}{review.screenplayRevision ? ` · r${review.screenplayRevision}` : ""}</dd></div>
      <div><dt>Checksum</dt><dd>{review.screenplayChecksum || "缺失"}</dd></div>
    </dl>
    {review.diagnosis ? <section><strong>诊断</strong><p>{review.diagnosis}</p></section> : null}
    {review.selectedTradeoff ? <section><strong>取舍</strong><p>{review.selectedTradeoff}</p></section> : null}
    <section><strong>审核维度 · {review.dimensions.length}</strong><div className="professional-review-tags">{review.dimensions.map((item) => <span key={item}>{item}</span>)}</div></section>
    {review.evidence.length ? <section><strong>证据 · {review.evidence.length}</strong><ul>{review.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section> : null}
    {review.findings.length ? <section><strong>发现 · {review.findings.length}</strong><ul>{review.findings.map((item, index) => <li key={`${index}-${item?.evidence || ""}`}><b>{item?.priority || "finding"}</b>{item?.evidence ? ` · ${item.evidence}` : ""}{item?.diagnosis ? `：${item.diagnosis}` : ""}</li>)}</ul></section> : null}
    {review.dialogueInventory.length ? <section><strong>逐句对白 · {review.dialogueInventory.length}</strong><ol>{review.dialogueInventory.map((item, index) => <li key={`${index}-${item?.speaker || ""}`}><b>{item?.speaker || "未知"}</b>：{item?.text || ""}</li>)}</ol></section> : null}
    {review.vetoFindings.length ? <section className="is-veto"><strong>阻断项 · {review.vetoFindings.length}</strong><ul>{review.vetoFindings.map((item, index) => <li key={`${index}-${String(item)}`}>{typeof item === "string" ? item : item?.diagnosis || JSON.stringify(item)}</li>)}</ul></section> : null}
  </div>;
}
