# Director Stage, panorama, and continuity

## Separate spatial and appearance truth

Director Stage answers where entities are, their orientation, scale, contact,
occlusion, routes, timing, and camera positions. Accepted actor, scene, prop,
costume, hair/makeup, and style assets answer what they look like.

Do not pass hidden Director Stage JSON to a provider as if it were a visual
reference. Export approved cameras as ordinary image media/nodes with compact
provenance: source director node, stage revision, camera snapshot, capture time,
visible object ids, and control boundaries.

## Scene construction

- Ordinary rooms use one complete spatial authority.
- Complex interiors use portal-linked zones with shared entry/exit coordinates
  and continuity state.
- Exteriors lock terrain, roads, building masses, landmarks, activity zones,
  hard collision boundaries, actor routes, and camera paths.
- Dense scenes lock architectural shell and routes first, composition/occlusion
  anchors second, interactive props individually, and noncritical dressing as
  versioned clusters.

Map labels stay outside geometry. Typed ids and coordinates are semantic truth;
colors alone are never identity.

## Panorama authority

Use a standard 2:1 equirectangular panorama for reusable enclosed appearance
at one optical center. Save its anchor point, orientation, room/zone, portals,
and required visible objects. Export 4-view or 12-view images deterministically
from the accepted panorama rather than asking an image model to redraw angles.

Use multiple panorama anchors when walls or portals prevent one point from
seeing another zone. A panorama does not prove translating-camera parallax,
near-field occlusion, or actor travel; those require geometry or another
accepted spatial authority.

## Storyboard spatial continuity

Derive one accepted maquette authority for multi-page storyboards. It locks:

- character silhouette and height relationships;
- world topology and entity zones;
- footprint/scale classes and functional orientation;
- action-critical contact, grip, and support geometry.

White-clay style removes final materials but cannot move doors, beds, desks,
props, or characters between zones. A cutaway may hide a wall for inspection
only if the missing enclosure remains proven by ghosted boundaries and a
reverse view.

World coordinates remain fixed while screen left/right may reverse with camera
direction. Calculate screen direction from each camera; never force an object
to remain on the same screen side after a 180-degree reverse.

## State and invalidation

Track, per shot and accepted clip boundary:

```text
character identity/look version
scene and Director Stage revision
character position/facing/hands
prop owner/zone/support/contact
effect phase
camera/axis/screen direction
audio/dialogue state
actual accepted exit state
```

An upstream change invalidates only dependents. Preserve prior accepted
branches and their reviews. Never let a planned exit overwrite the actual exit
observed at the accepted cut point.
