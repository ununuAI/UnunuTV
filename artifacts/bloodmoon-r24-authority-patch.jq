{
  viewSpecs: (
    [.viewSpecs[] | select(.viewId != "rear-occipital-clean-authority")]
    + [{
      viewId: "rear-occipital-clean-authority",
      label: "尸傀后脑唯一脸干净 Authority",
      framing: "画面恰好一个代表尸傀，从头顶到髋部完整入画；后脑、颅底、中央颈部、后领、肩背和脊柱背褶无遮挡且足够大，双臂自然下垂、双手空置",
      angle: "绝对严格背面正交视图；后领、肩胛、脊柱、背褶、手背与后腰证明身体背面正对摄影机；头颅不转动、不低头、不仰头；无三分之四角度",
      description: "把 r23 标注控制板的人物几何完整转写为无标注干净像素。只有一颗普通成人尺度的无发、无耳外突、圆滑闭合颅体；外轮廓不沿脸颊、下颌或下巴收窄。一根明显较窄的唯一颈部只从颅体底面几何中央向下接入后领。唯一完整人脸不是反向人头：只保留两眼、两眉、鼻部与嘴部的低矮皮肤浅浮雕，五官宽度约为颅体最大宽度百分之五十五；不得出现脸椭圆边界、脸颊外轮廓、下颌线、下巴、耳朵、发际线、接缝、面具边缘或脸部拥有的颈。五官四周全部保留连续可见枕骨皮肤外环；嘴部与五官下缘在颅体底面以上结束，嘴下方到颅底之间保留明显连续皮肤带。正常前脸位于头颅另一侧，在本背视图不可见且仍为光滑无脸皮肤。皮肤连续覆盖全头，不是骷髅、裸骨、伤口或面具。删除 r23 的 A-E 字母、所有彩色轮廓线、虚线、半透明区域、中心轴和箭头，不得留下任何标注痕迹。",
      background: "纯净中性浅灰棚拍背景，柔和均匀光；无其他人物、尸体、家具、客栈、武器、文字、数字、标签、箭头、彩线、标尺、水印、徽标或 UI",
      controls: [
        "身体严格背面证据",
        "单一无耳闭合颅体",
        "后脑中央缩进五官浅浮雕",
        "五官四周连续枕骨皮肤外环",
        "嘴下方至颅底连续皮肤带",
        "颅底几何中央唯一颈部",
        "无任何控制标注"
      ],
      doesNotControl: ["身体正面像素", "侧视投影", "战斗动作", "客栈空间", "群像差异"],
      required: true
    }]
  ),
  boardSpecs: (
    [.boardSpecs[] | select(.boardId != "rear-occipital-clean-authority")]
    + [{
      boardId: "rear-occipital-clean-authority",
      boardType: "identity_detail",
      label: "尸傀后脑唯一脸干净 Authority",
      purpose: "以 r23 已通过像素门禁的几何标注控制板为主几何源、r18 正背控制板为身份与服装源，生成可直接作为尸傀角色 Authority 的无标注严格背面身份图。",
      viewSpecIds: ["rear-occipital-clean-authority"],
      referencePolicy: "accepted_identity",
      pixelMode: "clean_authority",
      acceptanceCriteria: [
        "画面恰好一个尸傀且身体背面正对摄影机，后领、脊柱、背褶、手背和后腰证据一致",
        "只有一颗普通尺度圆滑闭合颅体和一根从颅底几何中央接入的较窄唯一颈部",
        "后脑中央只有眼眉鼻口浅浮雕，五官宽度约为颅宽百分之五十五，四周及嘴下方都有连续可见枕骨皮肤",
        "没有脸椭圆、脸颊外轮廓、独立下颌、下巴、耳朵、发际线、接缝、面具边缘、附着基座或脸部颈",
        "皮肤连续覆盖全头，无骷髅、裸骨、伤口、双面脸、第二头或正常正脸",
        "完全删除 r23 的 A-E 字母、彩线、虚线、半透明色块、中心轴和箭头，且无任何文字、水印或 UI",
        "继承 r18 的古代酒客服装、肤色、成年体态与日本二维手绘动画媒介"
      ],
      prohibitedChanges: [
        "恢复成带双耳、脸椭圆、脸颊轮廓、独立下颌、下巴或脸部颈的普通正脸",
        "让眼眉鼻口接触或伸出圆滑颅体外缘，或让嘴部直接连接颈部",
        "让颈部从脸、嘴、下巴或偏离颅底几何中央的位置向下延伸",
        "保留或重绘 A-E 字母、彩线、区域圈、虚线、中心轴、箭头、图例或任何标注",
        "用头发、耳朵、头饰、阴影、血污、裁切、面具或伤口遮住枕骨皮肤外环与颅底皮肤带",
        "生成骷髅、裸骨、第二头、双面脸、正常正脸、其他人物、武器、场景、文字、水印或 UI"
      ],
      required: true
    }]
  ),
  nextCandidatePlan: {
    planVersion: "bloodmoon-corpse-clean-authority-v9",
    state: "r23_control_accepted_clean_authority_ready",
    authorityRevision: 24,
    boardId: "rear-occipital-clean-authority",
    referenceMode: "accepted_semantic_image_reference",
    sourcePolicy: "r23_geometry_control_primary; r18_identity_clothing_secondary; all_rejected_media_audit_only",
    inputGeometryMediaId: "media-f9f082ba-7c5e-479b-bd0b-5ae5369eade1",
    inputGeometryReviewId: "review-33683f97-bf00-4924-aa68-b54a48a8720f",
    inputGeometryChecksum: "95be85114373ee69e815bce56ae86b340239a40eb1ce2a426395ce4e8f1de030",
    inputIdentityMediaId: "media-13e0c786-62c0-439b-9e29-24d16761cd9d",
    inputIdentityReviewId: "review-6e84ce89-b737-4986-9e28-82146fd7e5ff",
    annotationsMustBeRemoved: true,
    videoGenerationBlocked: true,
    providerCalled: false,
    paidImageApproval: "owner_authorized_autonomous_image_iteration"
  }
}
