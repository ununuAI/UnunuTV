{
  viewSpecs: (
    [
      .viewSpecs[]
      | if .viewId == "side-anatomy-proof" then
          . + {
            description: "先建立普通成年人的一颗头颅：单一连续闭合外轮廓、前后长度不超过头高、一根颈部从头颅底面几何中央向下接入躯干。画面右侧正常前脸位置是轻微平整连续无脸皮肤，没有眼眉鼻孔嘴牙眼窝，也不是球体、卵形囊、第二颅腔或巨大鼓包。唯一完整人脸的朝向与身体后方相同，其面法线朝画面左侧；因此在绝对九十度侧视中不得看见一张完整正常侧脸，只能在圆滑枕骨后缘以内看见极浅的局部皮肤起伏或五官边缘，任何鼻唇起伏都不能构成头颅外轮廓。完整眼眉鼻口只允许在严格背面视图中正对摄影机出现。唯一侧耳位于单头侧面中央，后脑脸没有自己的耳、下颌、颈、发际线、接缝或基座。头顶短发束不遮挡空白前部、侧耳、枕骨后缘或中央颈部。全头连续皮肤覆盖，非骷髅、裸骨、面具或伤口。",
            controls: [
              "普通单头尺度与单一圆滑闭合外轮廓",
              "颈椎接入头颅底面几何中央",
              "画面右侧正常前脸位置为轻微平整无脸皮肤面",
              "画面左侧枕骨只显极浅局部起伏，完整脸不投影为正常侧脸",
              "一个侧耳且后脑脸无独立耳、下颌或颈部",
              "身体正前方固定为画面右侧"
            ]
          }
        elif .viewId == "control-left-profile" then
          . + {
            description: "用一个普通成年人的单一圆滑闭合头颅外包络证明：右侧正常前脸位置为轻微平整无脸皮肤；左侧枕骨后缘以内只允许出现朝后完整脸的极浅局部起伏或五官边缘，鼻唇绝不能构成外轮廓或成为一张完整正常侧脸；一根颈部从头颅底面几何中央向下接入躯干；唯一侧耳位于单头侧面中央。头颅前后长度不超过头高，不出现巨大空白卵形头囊、两瓣头或第二颅腔。"
          }
        elif .viewId == "control-right-profile" then
          . + {
            description: "镜像复核同一单头拓扑：左侧正常前脸位置为轻微平整无脸皮肤；右侧枕骨后缘以内只允许出现朝后完整脸的极浅局部起伏或五官边缘，不能形成完整正常侧脸投影；中央颈部、唯一侧耳、单一圆滑外轮廓和普通头长保持不变。不得新增第二耳、第二下颌、第二颈部、第二头块或空白鼓包。"
          }
        else . end
    ]
    | map(select(.viewId != "rear-occipital-authority"))
    + [{
      viewId: "rear-occipital-authority",
      label: "尸傀严格背面枕骨人脸 Authority",
      framing: "画面中恰好一个与 r18 控制板同身份的代表尸傀，从头顶到髋部完整入画；人物身体背面正对摄影机，后脑和上颈无遮挡且足够大，双臂自然下垂、双手空置",
      angle: "绝对严格背面正交视图；脊柱、后领、背褶、手背、腿后侧共同证明身体背面朝摄影机；头颅不转动、不低头、不仰头",
      description: "普通成年人尺度的一颗闭合头颅和一根从头颅底面几何中央接入的颈部。唯一完整人脸正对摄影机，但它不是一颗反向的人头：眼眉鼻口由后脑枕骨同一层连续皮肤形成浅浮雕，整张脸的椭圆边界从四周都完全包含在圆滑枕骨外缘以内；脸下缘在头颅底面以上结束，不形成独立下巴，不连接独立颈部；没有自己的耳朵、发际线、接缝、面具边缘或附着基座。正常前脸位于头颅另一侧，在本背视角完全不可见且仍为无脸皮肤。两侧只保留属于这一颗头的普通侧耳外缘。全头皮肤覆盖，不是骷髅、裸骨、伤口或面具。",
      background: "纯净中性浅灰棚拍背景，柔和均匀光；无其他人物、尸体、家具、客栈、武器、文字、数字、标签、箭头、标尺、水印或 UI",
      controls: [
        "身体背面朝摄影机",
        "唯一完整人脸正对摄影机并浅嵌于枕骨皮肤",
        "脸椭圆四周完全包含在枕骨外缘内",
        "无独立耳、下颌、颈、发际线、接缝或基座",
        "单一普通头颅与中央颈部",
        "连续皮肤而非骷髅"
      ],
      doesNotControl: ["身体正面像素", "侧视投影", "战斗动作", "客栈空间", "群像差异"],
      required: true
    }]
  ),
  acceptanceCriteria: [
    .acceptanceCriteria[]
    | if startswith("画面左侧唯一完整脸") then
        "严格背面视图中唯一完整脸的全部五官完全内含于枕骨外缘；严格侧视中只允许看见枕骨后缘以内的极浅局部起伏，鼻唇绝不构成完整正常侧脸外轮廓"
      else . end
  ],
  boardSpecs: (
    [
      .boardSpecs[]
      | if .boardId == "side-anatomy-proof" then
          . + {
            purpose: "引用已通过像素门禁的正背身份控制板，只生成同一代表尸傀的严格九十度侧视投影；完整后脑脸朝身体后方，只能在严格背面正对摄影机时完整可见。侧视只能证明单一圆滑头颅、中央颈部、无脸前部和枕骨后缘以内的极浅局部起伏，绝不要求或允许完整正常侧脸。",
            acceptanceCriteria: [
              "恰好一个头颅、一根位于头颅底面中央的颈部和一个连续圆滑闭合外轮廓",
              "头颅前后长度不超过头高，空白前部没有膨胀成卵形头囊、球体、第二颅腔或第二头块",
              "胸骨、衣襟和腹部朝右，脊柱与背褶朝左，身体方向无歧义",
              "右侧正常前脸位置只有轻微平整连续皮肤面，完全没有眼眉鼻孔嘴牙与眼窝",
              "左侧枕骨后缘以内只显朝后完整脸的极浅局部起伏或五官边缘；鼻唇不构成外轮廓，绝无完整正常反向侧脸",
              "唯一侧耳位于单头侧面中央；后脑脸没有独立耳朵、下颌、颈部、发际线、接缝或基座",
              "全头皮肤覆盖，无骷髅、裸骨、面具、伤口遮挡、其他人物、武器、文字或 UI"
            ]
          }
        else . end
    ]
    | map(select(.boardId != "rear-occipital-authority"))
    + [{
      boardId: "rear-occipital-authority",
      boardType: "identity_detail",
      label: "尸傀严格背面枕骨人脸 Authority",
      purpose: "从 r18 已验收正背控制板提炼一张无标注、可直接作为角色 Authority 的严格背面身份图；锁定 P01A 最重要的可见事实：身体仍背对入口，唯一完整人脸正对入口并嵌在后脑枕骨皮肤。",
      viewSpecIds: ["rear-occipital-authority"],
      referencePolicy: "accepted_identity",
      acceptanceCriteria: [
        "恰好一个代表尸傀且身体背面正对摄影机，脊柱、后领、背褶和手背证据一致",
        "一颗普通尺度闭合头颅和一根头颅底面几何中央颈部",
        "唯一完整人脸正对摄影机，所有眼眉鼻口与脸椭圆四周完全内含在枕骨外缘内",
        "脸下缘在头颅底面以上结束，没有独立下巴、耳朵、颈部、发际线、接缝、面具边缘或基座",
        "正常前脸在头颅另一侧不可见且保持无脸，不构成双面脸",
        "全头连续皮肤覆盖，无骷髅、裸骨、伤口、第二头、双面脸、文字、标注或 UI",
        "继承 r18 的同一身份、体型、肤色、发束和破旧深褐古代酒客服装，并采用日本二维手绘动画电影媒介"
      ],
      prohibitedChanges: [
        "把背面人脸画成骷髅、裸骨、伤口、面具或外露颅骨",
        "让脸拥有独立耳朵、下巴、颈部、发际线、接缝、边框或附着基座",
        "让脸椭圆或五官伸出枕骨外缘",
        "把身体转成正面或三分之四角度，或出现胸襟、手掌等正面证据",
        "生成第二颗头、双面脸、正常正脸、额外人物、武器、文字、标注、水印或 UI"
      ],
      required: true
    }]
  ),
  nextCandidatePlan: {
    planVersion: "bloodmoon-corpse-rear-authority-v6",
    state: "rear_occipital_authority_ready_for_compilation",
    authorityRevision: 22,
    boardId: "rear-occipital-authority",
    referenceMode: "accepted_semantic_image_reference",
    sourcePolicy: "only_r18_front_rear_control_is_accepted_input; r20_r21_and_all_older_failures_are_audit_only",
    inputControlMediaId: "media-13e0c786-62c0-439b-9e29-24d16761cd9d",
    inputControlReviewId: "review-6e84ce89-b737-4986-9e28-82146fd7e5ff",
    inputControlChecksum: "bb9cf8310d4597f0520bd9c24b57d917c4e7dc6fcf40b2ce7a54885754c36632",
    projectionCorrection: "complete occipital face is frontally visible only from strict rear view; strict side view may show only shallow local relief inside the rounded skull silhouette",
    videoGenerationBlocked: true,
    providerCalled: false,
    paidImageApproval: "owner_authorized_autonomous_image_iteration"
  }
}
