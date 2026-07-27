function strokePath(context, operation) {
  const points = operation.points || [];
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.stroke();
}

function drawArrow(context, operation) {
  const { start, end } = operation;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(18, operation.size * 2);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
  context.stroke();
}

export function renderImageEditCanvas(canvas, image, document, activeOperation = null) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = document.canvas.backgroundColor || "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (image) {
    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }
  for (const operation of [...(document.operations || []), ...(activeOperation ? [activeOperation] : [])]) {
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = operation.size || 12;
    context.strokeStyle = operation.color || "#ff5b4d";
    context.fillStyle = operation.color || "#ff5b4d";
    if (operation.type === "eraser") {
      context.globalCompositeOperation = "destination-out";
      strokePath(context, operation);
    } else if (operation.type === "brush") strokePath(context, operation);
    else if (operation.type === "mosaic") {
      context.globalAlpha = .72;
      for (const point of operation.points || []) context.fillRect(point.x - 12, point.y - 12, 24, 24);
    } else if (operation.type === "gridMask") {
      context.globalAlpha = .52;
      for (const point of operation.points || []) context.strokeRect(point.x - 20, point.y - 20, 40, 40);
    } else if (operation.type === "rectangle") {
      const { start, end } = operation;
      context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (operation.type === "arrow") drawArrow(context, operation);
    else if (operation.type === "text") {
      context.font = `${Math.max(24, operation.size * 3)}px sans-serif`;
      context.fillText(operation.text || "文字", operation.point.x, operation.point.y);
    } else if (operation.type === "number") {
      const radius = Math.max(18, operation.size * 2);
      context.beginPath();
      context.arc(operation.point.x, operation.point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = `600 ${radius}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(operation.number || 1), operation.point.x, operation.point.y + 1);
    }
    context.restore();
  }
  context.restore();
}
