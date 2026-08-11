function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function rounded(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function vector(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  return {
    x: Number.isFinite(Number(source.x)) ? Number(source.x) : fallback.x,
    y: Number.isFinite(Number(source.y)) ? Number(source.y) : fallback.y,
    z: Number.isFinite(Number(source.z)) ? Number(source.z) : fallback.z,
  };
}

function clauseForName(source, name) {
  return text(source)
    .split(/[；。]/u)
    .find((clause) => clause.includes(name)) ?? "";
}

function basePosition(name, index, positions) {
  const clause = clauseForName(positions, name);
  const position = {
    x: 3.6 + (index % 4) * 1.6,
    y: 0,
    z: 2.3 + Math.floor(index / 4) * 2.3,
  };
  if (/东墙|东侧|东边|东南|东北/u.test(clause)) position.x = /墙/u.test(clause) ? 9.5 : 8.4;
  if (/西墙|西侧|西边|西南|西北/u.test(clause)) position.x = /墙/u.test(clause) ? 2.5 : 3.6;
  if (/中央|居中|木箱/u.test(clause)) position.x = 6 + ((index % 3) - 1) * 0.75;
  if (/北门|门外|门槛|入口|北侧|北边/u.test(clause)) position.z = 1.7 + (index % 2) * 0.55;
  if (/南侧|南边|客厅|东南|西南/u.test(clause)) position.z = 5.2 + (index % 2) * 0.45;
  if (/楼梯/u.test(clause)) {
    position.x = 8.8;
    position.z = 5.2;
  }
  return position;
}

function distanceIn(source, fallback = 0.6) {
  const match = text(source).match(/(\d+(?:\.\d+)?)\s*米/u);
  return match ? Number(match[1]) : fallback;
}

function moveToward(position, target, distance) {
  const dx = target.x - position.x;
  const dz = target.z - position.z;
  const length = Math.hypot(dx, dz) || 1;
  return { ...position, x: position.x + (dx / length) * distance, z: position.z + (dz / length) * distance };
}

function derivedEnd(start, action) {
  const source = text(action);
  const distance = distanceIn(source);
  let end = { ...start };
  if (/前移|靠近|围拢|跟随|随行/u.test(source)) end = moveToward(end, { x: 6, z: 3.8 }, distance);
  if (/后退|后拉|离开/u.test(source)) {
    const toward = moveToward(end, { x: 6, z: 3.8 }, -distance);
    end = { ...end, x: toward.x, z: toward.z };
  }
  if (/向东|由西向东/u.test(source)) end.x += distance;
  if (/向西|由东向西/u.test(source)) end.x -= distance;
  if (/向南|南向/u.test(source)) end.z += distance;
  if (/向北|北向/u.test(source)) end.z -= distance;
  if (/上楼/u.test(source)) {
    end.x += 0.45;
    end.y += 0.8;
    end.z += 0.45;
  }
  return {
    x: rounded(Math.max(0.8, Math.min(11.2, end.x))),
    y: rounded(Math.max(0, Math.min(2.2, end.y))),
    z: rounded(Math.max(0.8, Math.min(7.2, end.z))),
  };
}

function characterNamesFrom(input) {
  return (Array.isArray(input) ? input : [])
    .map((entry) => text(typeof entry === "string" ? entry : entry?.name ?? entry?.displayName))
    .filter(Boolean);
}

function spreadCollocatedActors(actors, minDistance = 0.48) {
  const offsets = [
    { x: -0.58, z: 0 },
    { x: 0.58, z: 0 },
    { x: 0, z: -0.52 },
    { x: 0, z: 0.52 },
    { x: -0.58, z: -0.52 },
    { x: 0.58, z: 0.52 }
  ];
  const accepted = [];
  return actors.map((actor) => {
    const base = actor.start;
    let offset = { x: 0, z: 0 };
    let candidate = base;
    let attempt = 0;
    while (accepted.some((prior) => Math.hypot(candidate.x - prior.x, candidate.z - prior.z) < minDistance)) {
      offset = offsets[attempt] || {
        x: ((attempt % 5) - 2) * 0.58,
        z: (Math.floor(attempt / 5) + 1) * 0.52
      };
      candidate = {
        ...base,
        x: rounded(Math.max(0.8, Math.min(11.2, base.x + offset.x))),
        z: rounded(Math.max(0.8, Math.min(7.2, base.z + offset.z)))
      };
      attempt += 1;
    }
    accepted.push(candidate);
    if (!offset.x && !offset.z) return actor;
    return {
      ...actor,
      start: candidate,
      end: {
        ...actor.end,
        x: rounded(Math.max(0.8, Math.min(11.2, actor.end.x + offset.x))),
        z: rounded(Math.max(0.8, Math.min(7.2, actor.end.z + offset.z)))
      }
    };
  });
}

function structuredActors(actors) {
  return actors.filter((entry) => entry && typeof entry === "object" && text(entry.name));
}

const GROUP_ACTOR_PATTERN = /八人|七人|六人|所有人|所有人物|其余人|其他人|(?:其余|其他)[一二三四五六七八九十\d]+人|群像/u;

export function deriveDeterministicPrevisBlocking({ shot = {}, characters = [] } = {}) {
  const blocking = shot.blocking && typeof shot.blocking === "object" ? shot.blocking : {};
  const declaredActors = Array.isArray(blocking.actors) ? blocking.actors : [];
  const explicit = structuredActors(declaredActors);
  if (explicit.length) {
    const actors = explicit.map((actor, index) => {
      const start = vector(actor.start, basePosition(actor.name, index, blocking.positions));
      return {
        ...actor,
        name: text(actor.name),
        start,
        end: vector(actor.end, start),
      };
    });
    const spreadActors = spreadCollocatedActors(actors);
    return { actors: spreadActors, lookAt: blockingCentroid(spreadActors) };
  }

  const names = characterNamesFrom(characters);
  const actorText = declaredActors.map(text).filter(Boolean);
  const combined = `${actorText.join("；")}；${text(blocking.positions)}；${text(blocking.paths)}`;
  const groupDeclared = GROUP_ACTOR_PATTERN.test(combined);
  const selected = groupDeclared ? names : names.filter((name) => combined.includes(name));
  const usableNames = selected.length ? selected : names.slice(0, Math.max(1, Math.min(3, actorText.length || 1)));
  const primaryNames = names.filter((name) => actorText.some((entry) => entry.includes(name)));
  const actors = usableNames.map((name, index) => {
    const action = actorText.find((entry) => entry.includes(name))
      ?? (groupDeclared ? actorText.find((entry) => GROUP_ACTOR_PATTERN.test(entry)) : "")
      ?? "";
    const start = basePosition(name, names.indexOf(name) >= 0 ? names.indexOf(name) : index, blocking.positions);
    return {
      name,
      action,
      start,
      end: derivedEnd(start, action),
    };
  });
  const spreadActors = spreadCollocatedActors(actors);
  const primaryActors = spreadActors.filter((actor) => primaryNames.includes(actor.name));
  return { actors: spreadActors, lookAt: blockingCentroid(primaryActors.length ? primaryActors : spreadActors) };
}

export function blockingCentroid(actors = []) {
  const points = actors.flatMap((actor) => [actor.start, actor.end]).filter(Boolean);
  if (!points.length) return { x: 6, y: 1.35, z: 3.8 };
  return {
    x: rounded(points.reduce((sum, entry) => sum + Number(entry.x || 0), 0) / points.length),
    y: 1.35,
    z: rounded(points.reduce((sum, entry) => sum + Number(entry.z || 0), 0) / points.length),
  };
}
