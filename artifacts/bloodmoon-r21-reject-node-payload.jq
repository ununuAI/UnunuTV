(.nodes[] | select(.id == "node-2d6a455a-317c-420b-96b2-01e5798fa049") | .payload) as $payload
| $payload + {
  status: "authority_blocked_by_rejected_candidate",
  currentMediaId: null,
  authorityReviewStatus: "rejected",
  authorityRejectionReason: "r20 标注控制图与 r21 干净候选均复核失败：左侧仍是构成头颅外轮廓的完整正常反向侧脸，右侧仍是空白头囊；标注圈住了错误结构。",
  candidateReviewStatus: "rejected",
  candidateRejectionReason: "r21 继承 r20 错误几何：正常反向侧脸＋巨大空白头囊；枕骨内浅浮雕与普通单头轮廓失败。",
  acceptedMediaId: null,
  acceptedReviewId: null,
  acceptedControlMediaId: "media-13e0c786-62c0-439b-9e29-24d16761cd9d",
  acceptedControlReviewId: "review-6e84ce89-b737-4986-9e28-82146fd7e5ff",
  acceptedControlChecksum: "bb9cf8310d4597f0520bd9c24b57d917c4e7dc6fcf40b2ce7a54885754c36632",
  mediaReviewId: "review-38f21419-8269-40f0-8d1c-8099cd2622c9",
  rejectedReviewId: "review-38f21419-8269-40f0-8d1c-8099cd2622c9",
  rejectedMediaIds: (($payload.rejectedMediaIds + [
    "media-92cd5735-6707-49db-a460-bcd09f98b302",
    "media-c613930c-e7ea-4757-8b85-693dbe987dfc"
  ]) | unique),
  staleMediaIds: (($payload.staleMediaIds + [
    "media-92cd5735-6707-49db-a460-bcd09f98b302",
    "media-c613930c-e7ea-4757-8b85-693dbe987dfc"
  ]) | unique),
  authorityMediaVersions: [
    $payload.authorityMediaVersions[]
    | if .mediaId == "media-92cd5735-6707-49db-a460-bcd09f98b302" then
        . + {
          reviewState: "rejected",
          reviewId: "review-ce263a48-9fc4-468d-b315-489df18fbc85",
          rejectionReason: "标注圈住了错误结构：左侧完整正常反向侧脸构成外轮廓，右侧仍是空白头囊。",
          allowedUse: "audit_only"
        }
      elif .mediaId == "media-c613930c-e7ea-4757-8b85-693dbe987dfc" then
        . + {
          reviewState: "rejected",
          reviewId: "review-38f21419-8269-40f0-8d1c-8099cd2622c9",
          rejectionReason: "继承 r20 错误几何：正常反向侧脸＋巨大空白头囊。",
          allowedUse: "audit_only",
          checksum: "23a044dc1d07fdfb8c99b6bf77f1935215433ff934397d98f569735c73eddd8a"
        }
      else . end
  ],
  controlReferenceOnly: true,
  cleanAuthorityRequired: true,
  auditOnly: true,
  providerCalled: true,
  paidApprovalRequired: false,
  nextCandidatePlan: {
    planVersion: "bloodmoon-corpse-rear-authority-v6",
    state: "r20_r21_rejected_rear_authority_contract_required",
    authorityRevision: 21,
    acceptedControlMediaId: "media-13e0c786-62c0-439b-9e29-24d16761cd9d",
    acceptedControlReviewId: "review-6e84ce89-b737-4986-9e28-82146fd7e5ff",
    rejectedAnnotatedMediaId: "media-92cd5735-6707-49db-a460-bcd09f98b302",
    rejectedAnnotatedReviewId: "review-ce263a48-9fc4-468d-b315-489df18fbc85",
    rejectedCleanMediaId: "media-c613930c-e7ea-4757-8b85-693dbe987dfc",
    rejectedCleanReviewId: "review-38f21419-8269-40f0-8d1c-8099cd2622c9",
    correction: "strict side view may show only a shallow occipital relief edge; the complete face is proved in rear orthographic view and may never become a normal reverse profile",
    nextBoardId: "rear-occipital-authority",
    videoGenerationBlocked: true,
    paidImageApproval: "owner_authorized_autonomous_image_iteration"
  }
}
