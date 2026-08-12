import * as THREE from "three";

/** 场景层共用的小工具:向量、画幅比、落盘前的精度收敛。 */

export const v3 = (value, fallback = 0) => new THREE.Vector3(
  Number.isFinite(value?.x) ? value.x : fallback,
  Number.isFinite(value?.y) ? value.y : fallback,
  Number.isFinite(value?.z) ? value.z : fallback
);

export function aspectOf(ratio) {
  const [w, h] = String(ratio || "16:9").split(":").map(Number);
  return Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : 16 / 9;
}

export const round = (value) => Number(Number(value).toFixed(3));
