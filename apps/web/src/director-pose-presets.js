// 姿势预设与素体档。
//
// 模型是 3ds Max Biped 命名的 67 关节骨架(Bip001 Pelvis / Spine / L UpperArm …),
// 所以一个"姿势"就是一组关节欧拉角(弧度),一个"素体"是一组骨骼缩放。
// 数值只求读得出体态,不追求解剖精确——previs 锁的是站位、朝向和体积感,
// 不是最终表演。

const D = Math.PI / 180;
const deg = (x, y, z) => [x * D, y * D, z * D];

/** 关节短名 → GLB 里的实际骨骼名前缀。GLB 名字带 _NN 后缀,匹配时用前缀。 */
export const JOINT = {
  pelvis: "Bip001 Pelvis",
  spine: "Bip001 Spine",
  spine1: "Bip001 Spine1",
  neck: "Bip001 Neck",
  head: "Bip001 Head",
  lClavicle: "Bip001 L Clavicle",
  lUpperArm: "Bip001 L UpperArm",
  lForearm: "Bip001 L Forearm",
  lHand: "Bip001 L Hand",
  rClavicle: "Bip001 R Clavicle",
  rUpperArm: "Bip001 R UpperArm",
  rForearm: "Bip001 R Forearm",
  rHand: "Bip001 R Hand",
  lThigh: "Bip001 L Thigh",
  lCalf: "Bip001 L Calf",
  lFoot: "Bip001 L Foot",
  rThigh: "Bip001 R Thigh",
  rCalf: "Bip001 R Calf",
  rFoot: "Bip001 R Foot"
};

/** 逐关节面板按这个分组和排序显示。 */
export const JOINT_GROUPS = [
  { label: "躯干", joints: [["spine", "前倾"], ["spine1", "扭转"], ["pelvis", "骨盆"]] },
  { label: "头颈", joints: [["neck", "颈"], ["head", "头"]] },
  { label: "左臂", joints: [["lClavicle", "肩"], ["lUpperArm", "大臂"], ["lForearm", "小臂"]] },
  { label: "右臂", joints: [["rClavicle", "肩"], ["rUpperArm", "大臂"], ["rForearm", "小臂"]] },
  { label: "左腿", joints: [["lThigh", "髋"], ["lCalf", "膝"], ["lFoot", "踝"]] },
  { label: "右腿", joints: [["rThigh", "髋"], ["rCalf", "膝"], ["rFoot", "踝"]] }
];

/** 手臂自然下垂:Biped 的 T-pose 需要把大臂压下来才像站着。 */
const ARMS_DOWN = {
  lUpperArm: deg(0, 0, -72),
  rUpperArm: deg(0, 0, 72),
  lForearm: deg(0, -12, 0),
  rForearm: deg(0, 12, 0)
};

export const POSE_PRESETS = {
  站立: { ...ARMS_DOWN },
  行走: {
    ...ARMS_DOWN,
    lThigh: deg(24, 0, 0), lCalf: deg(-14, 0, 0),
    rThigh: deg(-20, 0, 0), rCalf: deg(-6, 0, 0),
    lUpperArm: deg(-18, 0, -70), rUpperArm: deg(20, 0, 70),
    spine: deg(3, 0, 0)
  },
  跑步: {
    ...ARMS_DOWN,
    lThigh: deg(48, 0, 0), lCalf: deg(-62, 0, 0),
    rThigh: deg(-32, 0, 0), rCalf: deg(-20, 0, 0),
    lUpperArm: deg(-58, 0, -64), lForearm: deg(0, -78, 0),
    rUpperArm: deg(52, 0, 64), rForearm: deg(0, 78, 0),
    spine: deg(14, 0, 0)
  },
  坐姿: {
    ...ARMS_DOWN,
    lThigh: deg(86, 0, -4), lCalf: deg(-88, 0, 0),
    rThigh: deg(86, 0, 4), rCalf: deg(-88, 0, 0),
    spine: deg(4, 0, 0)
  },
  蹲下: {
    ...ARMS_DOWN,
    lThigh: deg(100, 0, -10), lCalf: deg(-124, 0, 0),
    rThigh: deg(100, 0, 10), rCalf: deg(-124, 0, 0),
    spine: deg(24, 0, 0)
  },
  单膝跪: {
    ...ARMS_DOWN,
    lThigh: deg(92, 0, -6), lCalf: deg(-96, 0, 0),
    rThigh: deg(6, 0, 8), rCalf: deg(-128, 0, 0),
    spine: deg(10, 0, 0)
  },
  叉腰: {
    lUpperArm: deg(0, 0, -54), lForearm: deg(0, -96, 0),
    rUpperArm: deg(0, 0, 54), rForearm: deg(0, 96, 0)
  },
  抱臂: {
    lUpperArm: deg(-26, 0, -46), lForearm: deg(0, -104, 0),
    rUpperArm: deg(-26, 0, 46), rForearm: deg(0, 104, 0),
    spine: deg(-4, 0, 0)
  },
  看手机: {
    lUpperArm: deg(-40, 0, -58), lForearm: deg(0, -84, 0),
    rUpperArm: deg(0, 0, 70),
    neck: deg(22, 0, 0), head: deg(10, 0, 0), spine: deg(6, 0, 0)
  },
  思考: {
    ...ARMS_DOWN,
    rUpperArm: deg(-32, 0, 52), rForearm: deg(0, 118, 0),
    neck: deg(10, 0, 0), head: deg(6, -14, 0)
  },
  伸手: {
    ...ARMS_DOWN,
    rUpperArm: deg(-76, 0, 62), rForearm: deg(0, 16, 0),
    spine: deg(6, 0, 0)
  },
  招手: {
    ...ARMS_DOWN,
    rUpperArm: deg(-116, 0, 44), rForearm: deg(0, 54, 0)
  },
  倚靠: {
    ...ARMS_DOWN,
    spine: deg(-8, 0, 8), pelvis: deg(0, 0, -6),
    lThigh: deg(-4, 0, -8), rThigh: deg(4, 0, 6)
  },
  鞠躬: {
    ...ARMS_DOWN,
    spine: deg(52, 0, 0), spine1: deg(14, 0, 0), neck: deg(-16, 0, 0)
  }
};

export const POSE_NAMES = Object.keys(POSE_PRESETS);

/** 素体档:整体缩放 + 躯干/四肢粗细,够区分体型即可。 */
export const BODY_TYPES = {
  男性素体: { scale: 1, girth: 1 },
  女性素体: { scale: 0.94, girth: 0.9 },
  宽厚素体: { scale: 1.02, girth: 1.28 },
  健壮素体: { scale: 1.04, girth: 1.16 },
  纤细素体: { scale: 0.97, girth: 0.82 },
  少年素体: { scale: 0.86, girth: 0.9 },
  儿童素体: { scale: 0.68, girth: 0.94 },
  二头身: { scale: 0.72, girth: 1.35 }
};

export const BODY_TYPE_NAMES = Object.keys(BODY_TYPES);

/** 姿势与素体存进 DirectorStageObject 的自由字段,不破坏既有 schema 校验。 */
export const readPose = (object) => object?.pose ?? {};
export const readBodyType = (object) => object?.bodyType ?? "男性素体";
