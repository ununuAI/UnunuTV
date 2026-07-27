{
  acceptanceCriteria: [
    "画面中的每个尸傀都只有一个普通尺度的闭合头颅和一根从头颅底面几何中央接入的颈部",
    "身体前后方向必须由当前板件声明的胸襟、后领、脊柱、背褶、手掌或手背证据证明，不得把身体背面误当正面",
    "身体正前方的正常前脸位置始终为轻微平整、连续、无眼无鼻无口的皮肤面；只有当当前视图包含该侧时才显示",
    "唯一完整人脸的眼眉鼻口由后脑枕骨同层连续皮肤形成，全部内含于圆滑枕骨外缘；没有独立耳、下颌、颈、发际线、接缝、面具边缘或基座",
    "严格背面视图可完整看见枕骨人脸；严格侧面视图只能看见枕骨后缘以内的极浅局部起伏，鼻唇不得构成正常侧脸外轮廓",
    "继承 r18 正背控制板的同一身份、古代酒客服装、肤色与二维手绘动画媒介",
    "无正常正脸、双面脸、第二头块、空白鼓包、偏置颈部、骷髅、裸骨、伤口遮挡、无关文字或UI"
  ],
  viewSpecs: (
    [.viewSpecs[] | select(.viewId != "occipital-inset-geometry-control")]
    + [{
      viewId: "occipital-inset-geometry-control",
      label: "枕骨内嵌人脸几何标注控制板",
      framing: "画面恰好一个代表尸傀的后脑、中央颈部与肩背，后脑占画幅高度约一半；身体背面正对摄影机，头颅不转动、不低头、不仰头；所有结构无遮挡",
      angle: "绝对严格背面正交视图；后领、脊柱、肩背中线与手背证明摄影机看的是身体背面；不出现身体正面、三分之四角度或透视夸张",
      description: "先画一颗无发、无耳外突、无脸形外轮廓的普通成年人闭合颅体，外轮廓是一条连续圆滑的卵圆形枕骨轮廓；一根明显更窄的颈部只从颅体底面几何中央向下接入肩背。唯一完整人脸不是一张反向人头：只把两眼、两眉、鼻部与嘴部作为低矮浅浮雕压在后脑中央，五官占头宽约百分之五十五；不得画脸椭圆、下颌线、下巴轮廓、耳朵、发际线或第二颈。五官区域四周都必须留出连续可见的枕骨皮肤外环，左右及顶部外环各不少于头宽百分之十五；嘴下方到颅体底面之间也必须留出明显连续皮肤带，颈部从这条皮肤带下方的颅体底面中央开始。覆盖 A-E 几何标记，所有标记必须紧贴并验证人物像素，绝不能用线条掩盖普通正脸、独立下巴或独立颈部。",
      background: "纯净中性浅灰技术控制板背景；只允许 A-E 字母、彩色轮廓线、区域圈、中心轴和短箭头；无标题、长说明、字幕、水印、徽标或 UI",
      controls: [
        "A 单一圆滑闭合颅体外轮廓",
        "B 无边框的中央枕骨五官浅浮雕区域",
        "C 五官四周连续枕骨皮肤外环",
        "D 嘴下方至颅底的连续皮肤带与颅底线",
        "E 颅底几何中央的唯一颈部轴线",
        "身体严格背面证据"
      ],
      doesNotControl: ["最终干净 Authority 像素", "身体正面像素", "侧视投影", "战斗动作", "客栈空间", "群像差异"],
      required: true
    }]
  ),
  boardSpecs: (
    [.boardSpecs[] | select(.boardId != "occipital-inset-geometry-control")]
    + [{
      boardId: "occipital-inset-geometry-control",
      boardType: "anatomy_control",
      label: "枕骨内嵌人脸几何标注控制板",
      purpose: "修正 r22 的普通正脸、双耳、独立下颌和独立颈误读；先生成一张只用于拓扑验证的严格背面标注控制板，证明五官只是枕骨中央浅浮雕，四周和下方都有连续颅体皮肤，颈部只属于唯一头颅。",
      viewSpecIds: ["occipital-inset-geometry-control"],
      referencePolicy: "accepted_identity",
      pixelMode: "annotated_control",
      annotationInstructions: [
        "A：用青色连续闭合线只沿唯一一颗圆滑颅体外缘；A 必须越过耳朵通常所在的位置而不中断，不得沿脸颊、下颌或下巴走线",
        "B：用橙色虚线圈住后脑中央五官浅浮雕区域；B 宽度约为 A 最大宽度的百分之五十五，B 内只有眼眉鼻口，不得有脸椭圆边界、耳朵、下颌线、下巴或颈部",
        "C：用绿色半透明带标出 A 与 B 之间四周连续的枕骨皮肤外环；左、右、上方都必须明显可见且连通，不得被头发、耳朵、接缝或阴影切断",
        "D：用黄色水平短线标记唯一颅体底面；嘴部与 B 下缘必须位于 D 上方，B 与 D 之间保留明显连续枕骨皮肤带，不得形成下巴或脸部颈",
        "E：用白色竖直中心轴从 D 的几何中央穿过唯一窄颈并向下对齐脊柱；E 不得从 B、嘴部或所谓下巴直接延伸",
        "在肩背中央用两枚很短的红色箭头指向后领与脊柱背褶，只证明身体背面，不标出身体正面"
      ],
      acceptanceCriteria: [
        "人物像素本身是一颗单一圆滑闭合颅体加中央唯一颈部；标注不得替错误像素圆场",
        "五官只占后脑中央较小区域，A 外轮廓与 B 五官区之间的 C 枕骨皮肤外环四周连续可见",
        "嘴下方到 D 颅底之间存在连续皮肤带；没有脸椭圆、下颌线、下巴、耳朵、发际线或第二颈",
        "后领、脊柱和背褶一致证明身体背面正对摄影机",
        "A-E 与人物像素逐项一致，且除声明的字母、线、圈、轴和短箭头外没有其他文字或 UI",
        "本板只能标记为 control_reference_only，不能直接成为角色 Authority、关键帧或视频参考"
      ],
      prohibitedChanges: [
        "生成带双耳、脸颊外轮廓、独立下颌、下巴或独立颈部的普通正脸",
        "让五官或 B 区接触、覆盖或伸出 A 颅体外缘",
        "用发型、头饰、阴影、血污、裁切或标注遮住颅体外环和颅底皮肤带",
        "让 E 颈部从五官区、嘴部、下巴或偏离颅底中央的位置向下延伸",
        "生成骷髅、裸骨、面具、伤口、第二头、双面脸、其他人物、武器、场景或未声明文字",
        "把本标注控制板当作干净 Authority、关键帧或视频参考"
      ],
      required: true
    }]
  ),
  nextCandidatePlan: {
    planVersion: "bloodmoon-corpse-occipital-inset-control-v8",
    state: "r22_rejected_annotated_occipital_inset_control_ready",
    authorityRevision: 23,
    boardId: "occipital-inset-geometry-control",
    referenceMode: "accepted_semantic_image_reference",
    sourcePolicy: "only_r18_front_rear_control_is_accepted_input; r20_r21_r22_and_all_other_failures_are_audit_only",
    inputControlMediaId: "media-13e0c786-62c0-439b-9e29-24d16761cd9d",
    inputControlReviewId: "review-6e84ce89-b737-4986-9e28-82146fd7e5ff",
    inputControlChecksum: "bb9cf8310d4597f0520bd9c24b57d917c4e7dc6fcf40b2ce7a54885754c36632",
    correction: "remove the visual grammar of a normal reverse face: no ears, no face oval, no jaw, no chin and no face-owned neck; shrink facial features inside an uninterrupted occipital skin ring",
    annotationsAreControlOnly: true,
    cleanAuthorityRequiresSeparateGenerationAndPixelAcceptance: true,
    videoGenerationBlocked: true,
    providerCalled: false,
    paidImageApproval: "owner_authorized_autonomous_image_iteration"
  }
}
