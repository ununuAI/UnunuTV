(.nodes[] | select(.id == "node-2d6a455a-317c-420b-96b2-01e5798fa049") | .payload) as $payload
| $payload + {
  status: "authority_control_reference_accepted",
  activeAuthorityBoardId: "annotated-side-geometry-control",
  currentMediaId: "media-92cd5735-6707-49db-a460-bcd09f98b302",
  authorityBoardId: "annotated-side-geometry-control",
  authorityRevision: 20,
  generatedAuthorityRevision: 20,
  assetVersionId: "asset-version-13732ed5-796b-4898-859f-7c5a16b9efc7",
  providerRunId: "run-517f5047-ae6c-446c-9982-7cbbf1f69596",
  mediaReviewId: "review-f313f32a-c4b0-437d-a284-3eb11df602d0",
  acceptedControlMediaId: "media-92cd5735-6707-49db-a460-bcd09f98b302",
  acceptedControlReviewId: "review-f313f32a-c4b0-437d-a284-3eb11df602d0",
  acceptedControlChecksum: "136bbcd1b402a95e609f7c45e9944c6940b9c041414403f11c37c66fbbf026d9",
  acceptedMediaId: null,
  acceptedReviewId: null,
  authorityReviewStatus: "candidate",
  authorityRejectionReason: null,
  candidateReviewStatus: "accepted",
  candidateRejectionReason: null,
  controlReferenceOnly: true,
  cleanAuthorityRequired: true,
  auditOnly: false,
  providerCalled: true,
  paidApprovalRequired: false,
  authorityMediaVersions: [
    $payload.authorityMediaVersions[]
    | if .mediaId == "media-92cd5735-6707-49db-a460-bcd09f98b302" then
        . + {
          reviewState: "accepted",
          reviewId: "review-f313f32a-c4b0-437d-a284-3eb11df602d0",
          allowedUse: "control_reference_only",
          checksum: "136bbcd1b402a95e609f7c45e9944c6940b9c041414403f11c37c66fbbf026d9"
        }
      else . end
  ],
  nextCandidatePlan: {
    planVersion: "bloodmoon-corpse-clean-authority-v5",
    state: "annotated_control_accepted_clean_authority_compilation_required",
    authorityRevision: 20,
    nextBoardId: "side-anatomy-proof",
    sourcePolicy: "r18_front_rear_control_plus_r20_annotated_side_geometry_are_accepted_control_inputs_only",
    acceptedIdentityControlMediaId: "media-13e0c786-62c0-439b-9e29-24d16761cd9d",
    acceptedIdentityControlReviewId: "review-6e84ce89-b737-4986-9e28-82146fd7e5ff",
    acceptedAnnotatedControlMediaId: "media-92cd5735-6707-49db-a460-bcd09f98b302",
    acceptedAnnotatedControlReviewId: "review-f313f32a-c4b0-437d-a284-3eb11df602d0",
    cleanCandidateRules: [
      "preserve r18 identity wardrobe front-faceless and rear-occipital-face facts",
      "preserve r20 single-skull contour central-neck left-occipital-relief and right-faceless-front geometry",
      "remove every A-E F/R letter line axis circle arrow and guide mark",
      "clean pixels must independently pass all defining anatomy vetoes"
    ],
    controlMediaMayNotBecomeAuthorityDirectly: true,
    videoGenerationBlocked: true,
    paidImageApproval: "owner_authorized_autonomous_image_iteration"
  }
}
