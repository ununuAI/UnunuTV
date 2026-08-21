export function storyreelSheetCellRect(width, height, index, cols, rows) {
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  return {
    sx: (index % cols) * cellWidth,
    sy: Math.floor(index / cols) * cellHeight,
    sw: cellWidth,
    sh: cellHeight
  };
}

export async function sliceStoryreelSheet(url, count, cols, rows) {
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("整板分镜图读取失败"));
    element.src = url;
  });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法裁切分镜图");
  return Array.from({ length: count }, (_, index) => {
    const rect = storyreelSheetCellRect(image.naturalWidth, image.naturalHeight, index, cols, rows);
    canvas.width = Math.max(1, Math.round(rect.sw));
    canvas.height = Math.max(1, Math.round(rect.sh));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  });
}
