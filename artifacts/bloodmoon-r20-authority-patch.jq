{
  viewSpecs: (
    [.viewSpecs[] | select(.viewId != "annotated-side-geometry-control")]
    + [{
      viewId: "annotated-side-geometry-control",
      label: "严格侧面单头几何标注控制图",
      framing: "画面中恰好一个与 r18 正背控制板同身份的代表尸傀，从头顶到髋部完整入画；头部和上颈占主要画幅，所有结构无遮挡",
      angle: "绝对九十度左侧正交视图；画面右侧为身体正前方，画面左侧为身体后方；无三分之四角度、透视夸张、转头、俯仰",
      description: "先画同一个普通成人尺度、前后长度不超过头高的单一闭合头颅。右侧正常前脸位置为轻微平整连续无脸皮肤；左侧后脑唯一完整脸必须压成同层枕骨皮肤极浅浮雕，全部眼眉鼻口都在枕骨外缘内，鼻唇不得形成正常侧脸投影；后脑脸没有自己的耳、下颌、颈、发际线、接缝或基座。一根颈部从头颅底面几何中央接入躯干，唯一侧耳位于单头侧面中央。胸骨衣襟腹部朝右，脊柱背褶朝左。人物像素上覆盖 A-E 结构标记和 F/R 方向箭头，所有标注必须与可见结构逐项一致。",
      background: "纯净中性浅灰技术控制板背景；只允许本板声明的 A-E、F/R 字母、轮廓线、中心轴、区域圈和方向箭头；无标题、长说明、字幕、水印、徽标或 UI",
      controls: [
        "单一普通尺度闭合头颅外包络",
        "头颅底面几何中央颈部轴线",
        "右侧无脸前部与左侧枕骨浅浮雕脸",
        "唯一侧耳归属",
        "身体正前方朝右、后方朝左"
      ],
      doesNotControl: ["最终成片构图", "战斗动作", "客栈空间", "群像个体差异"],
      required: true
    }]
  ),
  boardSpecs: (
    [.boardSpecs[] | select(.boardId != "annotated-side-geometry-control")]
    + [{
      boardId: "annotated-side-geometry-control",
      boardType: "anatomy_control",
      label: "严格侧面单头几何标注控制图",
      purpose: "把 r18 已通过的正面无脸、背面枕骨脸、身份与服装，转换成模型可读的严格侧面拓扑控制图；标注只用于锁定单头外轮廓、中央颈部、前后方向、无脸前部与枕骨浅浮雕脸的空间关系，不是正式 Authority。",
      viewSpecIds: ["annotated-side-geometry-control"],
      referencePolicy: "accepted_identity",
      pixelMode: "annotated_control",
      annotationInstructions: [
        "A：用青色连续闭合线紧贴唯一一颗普通尺度头颅的外包络，前后长度不得超过头高，不得包住第二头块或空白卵形头囊",
        "B：用黄色竖直中心轴从头颅底面几何中央穿过唯一颈部中心并向下对齐胸骨，不得偏接在前部或后脑脸下方",
        "C：用绿色半透明区域圈住画面右侧正常前脸位置的轻微平整无脸皮肤，区域内不得有眼眉鼻孔嘴牙或眼窝",
        "D：用橙色浅椭圆完全圈在画面左侧枕骨外缘以内；唯一完整脸的全部五官必须留在 D 内并贴于同层皮肤，鼻唇不得伸出 A 形成正常侧脸",
        "E：用白色小圆点标记唯一侧耳，E 位于 A 内、B 上方的头颅侧面中央；D 不得拥有自己的耳朵、下颌、颈部、发际线、接缝或基座",
        "从 B 向画面右侧画红色短箭头并只标 F，表示身体正前方；从 B 向画面左侧画红色短箭头并只标 R，表示身体后方；胸骨衣襟腹部朝 F，脊柱背褶朝 R"
      ],
      acceptanceCriteria: [
        "人物像素本身已经满足单一普通尺度头颅、中央颈部、右侧无脸前部、左侧枕骨内浅浮雕唯一脸；标注不能掩盖错误像素",
        "A-E 与 F/R 每个标记都和 Prompt 声明的结构、左右方向及身体衣褶证据一致",
        "D 内人脸没有独立耳、下颌、颈、发际线、接缝或基座，鼻唇不形成正常侧脸投影",
        "无骷髅、裸骨、面具、伤口、第二头、双面脸、空白卵形鼓包或偏置颈部",
        "除 A-E、F/R、线、轴、圈和箭头外，没有标题、说明文字、字幕、水印、徽标或 UI",
        "本板只能标记为 control_reference_only，不得直接成为角色 Authority、关键帧或视频参考"
      ],
      prohibitedChanges: [
        "把后脑脸画成拥有独立鼻唇投影、耳、下颌、颈或发际线的正常反向侧脸",
        "把右侧无脸前部膨胀成卵形头囊、球体、第二颅腔、空白鼓包或两瓣头",
        "让颈部偏离头颅底面几何中央",
        "让 A-E、F/R 或箭头与可见人物结构和左右方向冲突",
        "用标注遮挡错误解剖或让标注代替正确人物像素",
        "把本标注板当作干净 Authority、关键帧或视频参考"
      ],
      required: true
    }]
  ),
  nextCandidatePlan: {
    planVersion: "bloodmoon-corpse-annotated-side-geometry-v4",
    state: "annotated_control_contract_ready_for_paid_image_generation",
    authorityRevision: 20,
    boardId: "annotated-side-geometry-control",
    referenceMode: "accepted_semantic_image_reference",
    sourcePolicy: "only_r18_front_rear_control_is_accepted_input; r17_r19_and_all_older_candidates_are_audit_only",
    inputControlMediaId: "media-13e0c786-62c0-439b-9e29-24d16761cd9d",
    inputControlAssetVersionId: "asset-version-8b1e53da-98f2-4ce0-8dfb-de15f820e7c9",
    inputControlReviewId: "review-6e84ce89-b737-4986-9e28-82146fd7e5ff",
    inputControlChecksum: "bb9cf8310d4597f0520bd9c24b57d917c4e7dc6fcf40b2ce7a54885754c36632",
    annotationsAreControlOnly: true,
    cleanAuthorityRequiresSeparateGenerationAndPixelAcceptance: true,
    videoGenerationBlocked: true,
    providerCalled: false,
    paidImageApproval: "owner_authorized_autonomous_image_iteration"
  }
}
