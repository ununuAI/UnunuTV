/** 弧度转角度。导演台里姿势与旋转按弧度存,界面上一律按角度显示。 */
export const DEG = 180 / Math.PI;

/** 机位画幅比选项。 */
export const ASPECTS = ["16:9", "9:16", "2.39:1", "4:3", "1:1"];

/** 可直接摆进场景的基础几何体。 */
export const GEOMETRIES = [["box", "立方体"], ["sphere", "球体"], ["cylinder", "圆柱体"], ["torus", "环状体"], ["cone", "圆锥"], ["pyramid", "棱锥"]];
