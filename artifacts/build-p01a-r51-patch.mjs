import fs from "node:fs";

const inputPath = process.argv[2] ?? "/tmp/p01a-unit-current.json";
const current = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const unit = structuredClone(current.generationUnit);

unit.narrativeTask = "三位主角为逐一消灭客栈怪物而主动由前门进入；本镜建立空间、识别目标并揭示后脑唯一脸，在P01B前不撤退、不找出口、不提前攻击。";

const control = unit.controlIntent;
control.modeRationale = "P01A以Owner exact-media ACCEPT的整镜关键帧锁定人物、场景、构图和空间关系；三位主角身份Authority与尸傀单体/群像Authority精修身份及画外前无脸/后脑唯一脸解剖。所有图片仅为语义参考，不是首帧或尾帧；三人为主动清剿而进入，0至4秒的行走、停杯、后脑睁眼、背面可读战术回应、右肩背驱动斗篷H1、运镜、表演和声音全部由24fps分秒合同与精准提示词驱动。";
control.permittedChanges = [
  "三位主角在0–2.4秒沿+Z轴保持三角编队推进到Director中点站位并停；2.4–4秒世界位置不再平移",
  "酒客杯盏动作依次停止，后脑唯一脸眼睑依次开启；其身体、头颅方向和世界位置不变",
  "3.3秒后白璃脚、髋和胸继续面向大厅+Z，仅右肩背带动斗篷；3.7秒后月白斗篷才可进入画面并形成全幅H1"
];

Object.assign(control.dynamicControl, {
  subjectTrajectories: "0–2.4秒三主角沿入口轴保持三角编队推进到白璃(10,0.9,2)、顾沉(8.8,0.9,1.4)、洛青(11.2,0.9,1.4)后停；2.4–4秒三人世界位置不平移。八名尸傀全段世界位置、身体方向和桌席接触为零变化；只有杯盏动作停止与后脑眼睑开启。3.3秒后白璃脚、髋和胸持续朝大厅+Z，仅右肩背带动斗篷；3.7秒后斗篷擦镜。",
  actionPhases: "0–1秒主动进入并建立空间；1–2.4秒停杯、后脑睁眼与主角减速停稳；2.4–3.3秒背视可见证据硬停；3.3–3.7秒以肩颈收紧、武器握持和白璃右肩背动作完成无声战术确认；3.7–4秒斗篷真实全幅H1。",
  cameraTrajectory: "摄影机从(10,1.7,-2.4)、yaw 0°、pitch -3.76°沿+Z跟入，1秒到(10,1.68,-1.8)、yaw -1°、pitch -4.5°，2.4秒到Director中点(10,1.65,-1)、yaw -5.4°、pitch -5.58°；2.4–4秒位置、yaw、pitch、roll与65° FOV严格保持，仅3.3秒后平滑回拉焦点到白璃右肩背和斗篷。不环绕、不越轴、不内部切镜、不末段冲刺。",
  physicsContinuity: "脚底—木地板、臀—座椅、手或杯—桌案接触逐帧守恒；停杯只降低局部手部速度；后脑脸只开启眼睑；2.4秒后三主角和摄影机均不平移。斗篷只由白璃右肩背驱动，脚、髋、胸持续朝大厅+Z，不触发回身、撤退或隐藏换位。",
  endState: "H1为白璃月白斗篷真实全画幅遮挡；遮挡前，背视机位可见的后脑唯一脸、单头闭合皮肤、身体朝桌与桌席接触已静止保持0.9秒。头部正前方无脸是Authority画外不变量，只有意外入画时才做像素硬审；三主角、八酒客、四桌八座和入口轴状态明确。"
});

const motion = control.temporalMotionPlan;
for (const phase of motion.phases) {
  if (phase.phaseId === "p01a-proof") {
    phase.description = "摄影机和三位主角均硬停0.9秒，以最近无遮挡尸傀证明后脑唯一完整皮肤脸、单头闭合皮肤轮廓、身体朝桌和原桌席接触；同一头颅正前方在本背视机位画外。";
  }
  if (phase.phaseId === "p01a-turn") {
    phase.description = "白璃不回头、不做不可见眼线；脚、髋与胸保持大厅+Z，仅右肩背开始带动斗篷。顾沉靠刀、洛青握枪以背面可读姿态回应；尸傀、桌席和机位严格不动。";
  }
}

const frozenHeroStates = {
  baili: { position: { x: 10, y: 0.9, z: 2 }, prefix: "baili-" },
  guchen: { position: { x: 8.8, y: 0.9, z: 1.4 }, prefix: "guchen-" },
  luoqing: { position: { x: 11.2, y: 0.9, z: 1.4 }, prefix: "luoqing-" }
};

for (const track of motion.tracks) {
  if (track.trackId === "track-camera-p01a") {
    for (const state of track.states) {
      if (state.atSeconds === 0) {
        state.position = { x: 10, y: 1.7, z: -2.4 };
        state.orientation = { yawDegrees: 0, pitchDegrees: -3.76, rollDegrees: 0 };
        state.pose = "入口外沿清剿进攻轴跟拍";
      } else if (state.atSeconds === 1) {
        state.position = { x: 10, y: 1.68, z: -1.8 };
        state.orientation = { yawDegrees: -1, pitchDegrees: -4.5, rollDegrees: 0 };
        state.pose = "沿中轴低速跟入并继续减速";
      } else if (state.atSeconds >= 2.4) {
        state.position = { x: 10, y: 1.65, z: -1 };
        state.orientation = { yawDegrees: -5.4, pitchDegrees: -5.58, rollDegrees: 0 };
        state.pose = state.atSeconds === 2.4
          ? "Director中点锁定最近无遮挡后脑脸"
          : state.atSeconds === 3.3
            ? "机位硬停0.9秒后只准备拉焦"
            : state.atSeconds === 3.7
              ? "机位与朝向保持，仅焦点回拉到白璃右肩背"
              : "机位与朝向保持，由斗篷完成全遮挡";
      }
    }
    for (const transition of track.transitions) {
      if (transition.fromStateId === "camera-p01a-s0") {
        transition.path = "沿+Z轴直线跟入0.6米并从pitch -3.76°平滑到-4.5°";
      } else if (transition.fromStateId === "camera-p01a-s1") {
        transition.path = "沿+Z轴直线缓推0.8米并平滑到yaw -5.4°、pitch -5.58°";
      } else if (transition.fromStateId === "camera-p01a-s2") {
        transition.path = "世界位置、yaw、pitch、roll与FOV严格保持";
        transition.requiredIntermediateStates = [{ atSeconds: 2.85, description: "后脑唯一脸、单头闭合皮肤、身体朝桌与桌席接触持续可读；头部正前方在画外不伪称已证明" }];
      } else if (transition.fromStateId === "camera-p01a-s3") {
        Object.assign(transition, {
          path: "世界位置与朝向严格保持；仅焦点平滑回拉到白璃右肩背",
          interpolation: "hold",
          velocityCurve: "摄影机平移与旋转速度、加速度均为零；仅焦点变化",
          actionPhase: "背面可读战术确认与右肩背起势",
          contactEvolution: "无物理接触，不穿透主角或家具",
          requiredIntermediateStates: [{ atSeconds: 3.5, description: "机位不动；白璃不回头，仅右肩背开始驱动斗篷" }]
        });
      } else if (transition.fromStateId === "camera-p01a-s4") {
        Object.assign(transition, {
          path: "世界位置和朝向保持，斗篷在镜头前运动",
          interpolation: "hold",
          velocityCurve: "摄影机速度为零"
        });
      }
    }
    continue;
  }

  const hero = Object.entries(frozenHeroStates).find(([entityId]) => track.entityId === entityId);
  if (hero) {
    const [entityId, freeze] = hero;
    for (const state of track.states) {
      if (state.atSeconds < 2.4) continue;
      state.position = structuredClone(freeze.position);
      state.orientation = { yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0 };
      if (entityId === "baili") {
        state.pose = state.atSeconds === 2.4
          ? "停步，肩颈与呼吸收紧"
          : state.atSeconds === 3.3
            ? "保持面向大厅+Z，不回头；右肩背准备驱动斗篷"
            : state.atSeconds === 3.7
              ? "脚、髋、胸朝+Z保持；仅右肩背带动斗篷"
              : "脚、髋、胸朝+Z保持；斗篷完成擦镜";
      } else if (entityId === "guchen") {
        state.pose = state.atSeconds === 2.4
          ? "停步，右手靠刀柄，重心下沉"
          : "停在原位，右手靠刀柄，以背面可读身体张力回应";
      } else {
        state.pose = state.atSeconds === 2.4
          ? "停步，双手收紧枪杆，重心下沉"
          : "停在原位，双手握枪，以背面可读身体张力回应";
      }
    }
    for (const transition of track.transitions) {
      if (transition.fromStateId.endsWith("-s2")) {
        Object.assign(transition, {
          path: "世界位置和全身朝向严格保持",
          interpolation: "hold",
          velocityCurve: "位置速度和加速度为零；只保留呼吸、肩颈或握持微反应",
          actionPhase: "背视可见证据静止保持",
          contactEvolution: "双脚稳定接触木地板，无滑移",
          requiredIntermediateStates: [{ atSeconds: 2.85, description: "站位不变，以背面可读的呼吸、肩颈和武器握持表现确认目标" }]
        });
      } else if (transition.fromStateId.endsWith("-s3")) {
        Object.assign(transition, {
          path: entityId === "baili"
            ? "世界位置与脚、髋、胸朝向保持；仅右肩背开始驱动斗篷"
            : "世界位置与朝向保持；以武器握持和重心张力回应，不依赖不可见眼线",
          interpolation: "hold",
          velocityCurve: "世界位置与整体朝向速度为零；仅局部表演变化",
          actionPhase: "无声战术确认与斗篷起势",
          contactEvolution: "双脚不离地、不滑移",
          requiredIntermediateStates: [{ atSeconds: 3.5, description: "三人不回头、不撤退；白璃仅右肩背动作，顾沉靠刀、洛青握枪" }]
        });
      } else if (transition.fromStateId.endsWith("-s4")) {
        Object.assign(transition, {
          path: "世界位置与脚、髋、胸朝+Z保持；遮挡内不改变站位",
          interpolation: "hold",
          velocityCurve: "世界位置与整体朝向速度为零",
          actionPhase: "斗篷真实全画幅擦镜",
          contactEvolution: "双脚不离地、不滑移"
        });
      }
    }
    continue;
  }

  if (track.trackId.startsWith("track-guest-")) {
    for (const state of track.states) {
      if (state.atSeconds === 2.4) {
        state.pose = "唯一后脑枕骨皮肤脸睁眼凝视入口；本背视机位可见后脑脸、单头闭合皮肤、身体朝桌与桌席接触，头部正前方在画外";
      } else if (state.atSeconds === 3.3) {
        state.pose = "坐姿与全部接触保持；后脑唯一脸、单头闭合皮肤、身体朝桌与桌席接触持续无遮挡，头部正前方仍在画外";
      } else if (state.atSeconds === 3.7) {
        state.pose = "白璃右肩背起势期间完全静止，不转身、不离座";
      }
    }
    for (const transition of track.transitions) {
      if (transition.fromStateId.endsWith("-s2")) {
        transition.requiredIntermediateStates = [{ atSeconds: 2.85, description: "后脑唯一脸、单头闭合皮肤、身体朝桌与桌席接触持续可读；正前方在画外不伪称已证明" }];
      } else if (transition.fromStateId.endsWith("-s3")) {
        transition.actionPhase = "白璃右肩背起势";
        transition.requiredIntermediateStates = [{ atSeconds: 3.5, description: "不因主角局部肩背动作而转头或站起" }];
      }
    }
    continue;
  }

  if (track.trackId === "track-baili-cloak") {
    const transition = track.transitions.find((item) => item.fromStateId === "baili-cloak-s3");
    transition.path = "白璃脚、髋、胸持续朝大厅+Z，由右肩背局部动作带动斗篷从画面左下进入";
    transition.actionPhase = "白璃右肩背起势";
    transition.requiredIntermediateStates = [{ atSeconds: 3.5, description: "斗篷边缘首次出现在左下；白璃不回头，后脑证据仍可读" }];
  }
}

Object.assign(unit.promptCoverage, {
  coordinateFrame: "世界纵深轴从前入口指向中后景后出口；三位主角为主动清剿怪物而位于入口侧前景并始终面向大厅+Z，绝非撤退或找出口。酒客位于中央至中后景；每名酒客的胸腔、骨盆、膝与头部正前方朝自己的桌案，后脑枕骨方向朝入口侧主角。",
  poseGazeHandsProps: "尸傀身体和头颅不转身，双手停杯或留在桌面；只有后脑脸睁眼凝视三主角。顾沉以右手靠刀柄和背部张力回应，洛青以握枪指节和重心下沉回应；白璃不回头、不使用不可见眼线，脚、髋、胸保持大厅+Z，仅右肩背带动斗篷，不提前出符。",
  visibilityOcclusionCompletion: "入口三主角、最近中景尸傀的后脑唯一脸、单头闭合皮肤轮廓、身体朝桌、原桌席接触、至少两层桌席与后出口同时可读；本背视机位不声称同时看见同一头颅正前方。头部正前方无脸是Authority画外不变量，只有意外入画时才必须以平滑无眼鼻口皮肤通过像素审查。0–3.7秒不得用头发、阴影、血污、裁切或斗篷遮挡后脑证据。",
  cameraFramingLensFocus: "65度视场角不变；摄影机从入口门槛外沿入口—中央轴低速推进，2.4秒到Director中点(10,1.65,-1)、yaw -5.4°、pitch -5.58°并硬停，2.4–4秒机位和朝向不再变化；3.3秒后只平滑拉焦到白璃右肩背与斗篷。不环绕、不越轴、不突然变焦、不末段冲刺。",
  lightingColorExposure: "血月红光从入口扫入，客栈内部暗褐暖灯保留桌席层次；后脑唯一脸五官、单头闭合皮肤、身体朝桌与主角轮廓不过暗不过曝；不要求画外的头部正前方同时可见，最终斗篷遮挡前曝光和色温连续。",
  initialState: "t0 三位主角为逐一消灭客栈怪物而主动跨过前门，尚未确认眼前酒客就是目标；八名尸傀仍以身体正前方朝桌案坐定，杯盏和家具全在原位，后脑脸尚未完成睁眼揭示。",
  subjectTrajectories: "0–1秒三主角保持白璃中、顾沉左后、洛青右后主动跨门；1–2.4秒继续低速推进到白璃(10,0.9,2)、顾沉(8.8,0.9,1.4)、洛青(11.2,0.9,1.4)并停稳；2.4–4秒三人和摄影机世界位置不平移。八名尸傀全段世界位置、身体方向、头部正前方和桌席接触保持不变，只允许杯盏速度降为零与后脑眼睑开启。3.3–3.7秒白璃脚髋胸继续朝+Z，仅右肩背驱动斗篷；3.7–4秒斗篷擦镜。",
  actionPhases: "0–1秒主动进入并建立空间—1–2.4秒停杯、后脑唯一脸睁眼且主角停稳—2.4–3.3秒硬停0.9秒证明后脑唯一脸、单头闭合皮肤、身体朝桌与桌席接触—3.3–3.7秒三人以背面可读姿态完成战术确认且白璃仅右肩背起势—3.7–4秒斗篷自左下向右上形成真实全画幅H1。头部正前方在本背视机位画外，不伪称同时证明。",
  timingSpeed: "严格使用0/1/2.4/3.3/3.7/4秒边界：0–1秒ease-out；1–2.4秒低速缓推并减至零；2.4–4秒摄影机及三位主角世界位置和整体朝向速度为零；3.3–3.7秒只允许背面可读表演、拉焦与白璃右肩背局部动作；3.7–4秒机位零速度、只有斗篷持续遮幅。",
  cameraTrajectory: "摄影机从(10,1.7,-2.4)、yaw 0°、pitch -3.76°沿+Z跟入，1秒到(10,1.68,-1.8)、yaw -1°、pitch -4.5°，2.4秒到(10,1.65,-1)、yaw -5.4°、pitch -5.58°；2.4–4秒位置与朝向严格保持，仅3.3秒后拉焦到白璃右肩背与斗篷。Director控制图为editor_only度量辅助，绝不进入Provider图片集合。",
  contactForcesPhysics: "三主角脚底—木地板连续；八名尸傀臀—座、脚—地、手或杯—桌逐帧保持；停杯只降低手部速度，后脑脸只开启眼睑。2.4秒后三主角不平移；白璃脚、髋、胸持续朝大厅+Z，只由右肩背带动斗篷，斗篷只掠镜头前景，不穿透人物或家具。",
  performanceDialogueAudio: "本镜无对白。0–1秒三人以执行清剿任务的克制战术步伐进入；1–2.4秒白璃下颌与肩颈收紧、顾沉右手靠刀柄、洛青握枪指节收紧；2.4–3.3秒以背面可读的呼吸变浅、重心下沉和握持变化表现确认；3.3秒后不回头、不做不可见眼线，白璃只以右肩背驱动斗篷，顾沉与洛青保持武器握持回应；3.7秒后斗篷布料声连续进入H1。",
  endStateHandoff: "3.7秒前，本背视机位可见的后脑唯一完整皮肤脸、单头闭合皮肤、身体朝桌和四桌八座已稳定证明0.9秒；头部正前方无脸仍为Authority画外不变量，若意外入画必须通过像素硬审。4秒H1由白璃月白斗篷真实全画幅覆盖，方向、速度、纹理、曝光、环境底噪和布料声均可供P01B无缝续接。"
});

for (const closure of unit.promptCoverage.counterexampleClosures) {
  closure.omittedDetail = "旧提示未把每个可见酒客的单头拓扑、身体朝桌、后脑皮肤浅嵌唯一脸列为逐实体硬条件，并错误地要求背视机位同时证明画外正前方。";
  closure.positiveConstraint = "八名尸傀逐个保持身体和头部正前方朝桌；本背视机位只把后脑唯一皮肤脸、单头闭合皮肤、身体朝桌与桌席接触作为可见证据；正前方无眼鼻口是Authority不变量，只有入画时才做像素硬审。";
  closure.vetoCriterion = "任一可见尸傀出现骷髅、裸骨、普通前脸回头、身体或头颅转向入口、第二头块，或用遮挡逃避后脑/单头/桌席证据，整段立即REJECT；若头部正前方入画且出现五官，同样立即REJECT。";
}

for (const requirement of unit.reviewRequirements) {
  if (requirement.checkId === "corpse-front-face-anatomy") {
    requirement.requirement = "头部正前方无脸是Authority硬不变量；本入口背视镜头不要求同一头颅正前方与后脑同时可见，但任一头部正前方只要进入像素，就必须是平滑连续的无眼、无鼻、无口皮肤；出现普通正脸、第二张脸、五官、骷髅或裸骨立即REJECT";
  } else if (requirement.checkId === "corpse-rear-face-identity") {
    requirement.requirement = "至少一名最近无遮挡酒客的唯一完整人脸必须清楚嵌在后脑枕骨连续皮肤中并保持0.9秒；同时可见单一闭合皮肤头颅轮廓，禁止外露骷髅、裸骨、空洞眼眶、独立第二颗头或双面脸";
  } else if (requirement.checkId === "p01a-seam-full-frame-wipe") {
    requirement.requirement = "后脑唯一完整皮肤脸、单头闭合皮肤、身体朝桌与桌席接触必须先清楚保持至少0.8秒；其后白璃在脚髋胸保持大厅+Z时仅由右肩背带动月白斗篷从左下向右上掠过，并在最终H1形成真实全画幅遮挡；禁止提前遮挡、回身撤退、内部偷切、烟雾/闪光替代或未全幅覆盖";
  }
}

for (const risk of [
  "入口背视机位声称同一颗不透明头颅的正前方与后脑同时可见",
  "依赖背影视角不可见的眼线、正面表情或口型表达战术确认",
  "2.4秒后三位主角或摄影机继续平移、冲刺、越过站位或改变整体朝向",
  "白璃脚、髋、胸回身朝入口而产生撤退、突围或离开客栈读法",
  "editor_only导演台粗代理图、中文标注图或无校验验收证明的控制图进入Provider参考集合"
]) {
  if (!unit.highRiskNegatives.includes(risk)) unit.highRiskNegatives.push(risk);
}

const patch = {
  narrativeTask: unit.narrativeTask,
  controlIntent: unit.controlIntent,
  promptCoverage: unit.promptCoverage,
  reviewRequirements: unit.reviewRequirements,
  highRiskNegatives: unit.highRiskNegatives
};

if (process.argv.includes("--summary")) {
  const cameraTrack = patch.controlIntent.temporalMotionPlan.tracks.find((track) => track.trackId === "track-camera-p01a");
  const heroTracks = patch.controlIntent.temporalMotionPlan.tracks.filter((track) => ["baili", "guchen", "luoqing"].includes(track.entityId));
  console.log(JSON.stringify({
    narrativeTask: patch.narrativeTask,
    cameraStates: cameraTrack.states,
    frozenHeroStates: heroTracks.flatMap((track) => track.states.filter((state) => state.atSeconds >= 2.4)),
    frontReview: patch.reviewRequirements.find((item) => item.checkId === "corpse-front-face-anatomy"),
    providerReferenceRule: patch.promptCoverage.cameraTrajectory,
    risks: patch.highRiskNegatives.slice(-5)
  }, null, 2));
} else {
  process.stdout.write(JSON.stringify(patch));
}
