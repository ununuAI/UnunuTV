const PANORAMA_TYPES = ["scene_panorama_equirectangular", "panorama_equirectangular"];

/** 连进导演节点的全景图 / world 节点,可当环境球。 */
export function panoramaSources(canvas, directorNode) {
  if (!canvas?.edges || !directorNode) return [];
  return canvas.edges
    .filter((edge) => edge.toNodeId === directorNode.id)
    .map((edge) => canvas.nodes.find((item) => item.id === edge.fromNodeId))
    .filter((source) => {
      if (!source) return false;
      if (source.kind === "world") return Boolean(source.payload?.currentMediaId || source.payload?.worldMediaId);
      const type = source.payload?.imageType ?? source.payload?.type;
      return source.kind === "image" && (PANORAMA_TYPES.includes(type) || /^720°/.test(source.title || ""));
    })
    .map((source) => ({
      id: source.id,
      label: source.title || "环境",
      mediaId: source.payload?.currentMediaId || source.payload?.mediaId || source.payload?.worldMediaId
    }))
    .filter((item) => item.mediaId);
}
