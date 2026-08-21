function samePosition(left, right) {
  return Number(left?.x) === Number(right?.x) && Number(left?.y) === Number(right?.y);
}

export function projectedNodePosition({ currentPosition, dragging = false, pendingPosition, projectedPosition }) {
  if (dragging && currentPosition) return currentPosition;
  if (pendingPosition && !samePosition(projectedPosition, pendingPosition)) return pendingPosition;
  return projectedPosition;
}

export function projectedPositionHasPersisted(projectedPosition, pendingPosition) {
  return Boolean(pendingPosition && samePosition(projectedPosition, pendingPosition));
}
