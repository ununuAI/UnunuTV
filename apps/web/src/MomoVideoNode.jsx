"use client";

import { Video } from "lucide-react";
import { NodePromptCard } from "./NodePromptCard.jsx";
import { keepVideoPausedOutsideControls, primeVideoPreviewFrame } from "./canvas-node-policies.js";
import { mediaReviewStateForNode } from "./media-candidate-policy.js";
import { mediaEmptyState } from "./media-empty-state-policy.js";

export function MomoVideoNode({ actions, connectedNodes, displayedMediaId, mediaUrl, node, readOnly, selected }) {
  const reviewState = mediaReviewStateForNode(node, displayedMediaId);
  const emptyState = mediaEmptyState(node, "video");
  return <div className={`momo-video-node${selected ? " is-selected" : ""}`}>
    <div className="momo-video-stage">
      {mediaUrl ? <video controls key={displayedMediaId} onClick={keepVideoPausedOutsideControls} onDoubleClick={keepVideoPausedOutsideControls} onLoadedMetadata={(event) => {
        primeVideoPreviewFrame(event);
        const video = event.currentTarget;
        void actions.fitMediaNode(node, video.videoWidth, video.videoHeight);
      }} preload="metadata" src={mediaUrl} /> : <div className="momo-video-empty"><Video size={38} strokeWidth={1.2} /><strong>{emptyState.label}</strong><small>{emptyState.detail}</small></div>}
      {reviewState ? <div className={`momo-video-review-state ${reviewState.state}`} title={reviewState.detail}><strong>{reviewState.label}</strong><small>{reviewState.detail}</small></div> : null}
    </div>
    {selected ? <div className="momo-video-prompt nodrag nopan"><NodePromptCard actions={actions} connectedNodes={connectedNodes} node={node} readOnly={readOnly} /></div> : null}
  </div>;
}
