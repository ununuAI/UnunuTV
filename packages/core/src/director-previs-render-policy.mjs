export const DIRECTOR_PREVIS_ROUTE_BOUND_RENDER_VERSION = "director_previs_route_bound_v1";
export const DIRECTOR_PREVIS_ACTOR_TOPOLOGY_VERSION = "director_previs_actor_topology_v1";

function routePoint(value = {}) {
  return {
    x: Number(value.x) || 0,
    y: Number(value.y) || 0,
    z: Number(value.z) || 0
  };
}

function actorName(route, index) {
  const label = String(route?.label || "").split(" · ")[0].trim();
  return label || `人物${index + 1}`;
}

export function bindDirectorRoutesToPrevisShot({ shot = {}, routes = [] } = {}) {
  const shotId = String(shot.shotId || "");
  const actorRoutes = routes
    .filter((route) => (
      route?.type === "character"
      && String(route.id || "").startsWith(`actor-route-${shotId}-`)
      && Array.isArray(route.points)
      && route.points.length > 0
    ));
  const cameraRoute = routes.find((route) => (
    route?.type === "camera"
    && route.id === `camera-route-${shotId}`
    && Array.isArray(route.points)
    && route.points.length > 0
  ));
  return {
    ...shot,
    blocking: {
      ...(shot.blocking || {}),
      ...(actorRoutes.length ? {
        actors: actorRoutes.map((route, index) => ({
          name: actorName(route, index),
          start: routePoint(route.points[0]),
          end: routePoint(route.points.at(-1)),
          color: route.color || "#60a5fa"
        }))
      } : {})
    },
    cinematography: {
      ...(shot.cinematography || {}),
      ...(cameraRoute ? { routePoints: cameraRoute.points.map(routePoint) } : {})
    }
  };
}

function actorRoutesForShot(routes, shotId) {
  return routes.filter((route) => (
    route?.type === "character"
    && String(route.id || "").startsWith(`actor-route-${shotId}-`)
    && Array.isArray(route.points)
    && route.points.length > 0
  ));
}

function horizontalDistance(left, right) {
  return Math.hypot(Number(left?.x) - Number(right?.x), Number(left?.z) - Number(right?.z));
}

export function directorActorRoutesHaveTopologyCollision({ routes = [], shotId, minDistance = 0.48 } = {}) {
  const actorRoutes = actorRoutesForShot(routes, shotId);
  return actorRoutes.some((route, index) => (
    actorRoutes.slice(0, index).some((prior) => (
      horizontalDistance(route.points[0], prior.points[0]) < minDistance
    ))
  ));
}

export function spreadCollocatedDirectorActorRoutes({ routes = [], shotId, minDistance = 0.48 } = {}) {
  const offsets = [
    { x: -0.58, z: 0 },
    { x: 0.58, z: 0 },
    { x: 0, z: -0.52 },
    { x: 0, z: 0.52 },
    { x: -0.58, z: -0.52 },
    { x: 0.58, z: 0.52 },
    { x: -0.58, z: 0.52 },
    { x: 0.58, z: -0.52 }
  ];
  const acceptedStarts = [];
  return routes.map((route) => {
    if (!actorRoutesForShot([route], shotId).length) return route;
    const base = routePoint(route.points[0]);
    let offset = { x: 0, z: 0 };
    let candidate = base;
    let attempt = 0;
    while (acceptedStarts.some((prior) => horizontalDistance(candidate, prior) < minDistance)) {
      offset = offsets[attempt] || {
        x: ((attempt % 5) - 2) * 0.58,
        z: (Math.floor(attempt / 5) + 1) * 0.52
      };
      candidate = {
        ...base,
        x: Math.max(0.8, Math.min(11.2, base.x + offset.x)),
        z: Math.max(0.8, Math.min(7.2, base.z + offset.z))
      };
      attempt += 1;
    }
    acceptedStarts.push(candidate);
    if (!offset.x && !offset.z) return route;
    return {
      ...route,
      points: route.points.map((point) => ({
        ...point,
        x: Math.max(0.8, Math.min(11.2, Number(point.x) + offset.x)),
        z: Math.max(0.8, Math.min(7.2, Number(point.z) + offset.z))
      })),
      topologyVersion: DIRECTOR_PREVIS_ACTOR_TOPOLOGY_VERSION
    };
  });
}
