// World coordinates are independent of the camera and the communication graph.
export const TAU = Math.PI * 2;
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function project3D(point, camera = {}) {
  const { yaw = -.35, pitch = .58, zoom = 1 } = camera;
  const u = point.x * Math.cos(yaw) + point.z * Math.sin(yaw);
  const d = -point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  const v = -point.y * Math.cos(pitch) + d * Math.sin(pitch);
  const depth = point.y * Math.sin(pitch) + d * Math.cos(pitch);
  const scale = 1000 / (1000 + depth) * zoom;
  return { x: 450 + u * scale, y: 300 + v * scale, depth, scale };
}
export function moveOnFloor(anchor, dx, dy, camera) {
  const scale = project3D({ ...anchor, y: 0 }, camera).scale;
  const u = dx / scale, d = dy / (scale * Math.sin(camera.pitch));
  return { ...anchor, x: clamp(anchor.x + u * Math.cos(camera.yaw) - d * Math.sin(camera.yaw), -330, 330),
    z: clamp(anchor.z + u * Math.sin(camera.yaw) + d * Math.cos(camera.yaw), -330, 330) };
}
export function networkLayout(count, edges = []) {
  const neighbors = Array.from({ length: count }, () => new Set());
  for (const { from, to } of edges) if (neighbors[from] && neighbors[to] && from !== to) { neighbors[from].add(to); neighbors[to].add(from); }
  const hub = neighbors.findIndex(n => n.size === count - 1);
  const links = neighbors.reduce((sum, n) => sum + n.size, 0) / 2;
  if (count > 2 && hub >= 0 && links === count - 1) return Array.from({ length: count }, (_, i) => {
    if (i === hub) return { x: 0, y: 100, z: 0 };
    const index = i > hub ? i - 1 : i, angle = index * TAU / (count - 1);
    return { x: Math.cos(angle) * 230, z: Math.sin(angle) * 230 };
  });
  if (links === count - 1 && neighbors.every(n => n.size <= 2)) {
    const order = [], seen = new Set(); let current = neighbors.findIndex(n => n.size === 1);
    while (current >= 0 && !seen.has(current)) { order.push(current); seen.add(current); current = [...neighbors[current]].find(i => !seen.has(i)) ?? -1; }
    if (order.length === count) { const positions = []; order.forEach((i, step) => { positions[i] = { x: -260 + step * 520 / Math.max(1, count - 1), z: step % 2 ? 65 : -65 }; }); return positions; }
  }
  const split = Math.ceil(count / 2), crossing = edges.filter(e => (e.from < split) !== (e.to < split)).length;
  if (count >= 4 && crossing <= 2 && links > count - 1) return Array.from({ length: count }, (_, i) => {
    const first = i < split, size = first ? split : count - split, j = first ? i : i - split, angle = j * TAU / size;
    return { x: (first ? -170 : 170) + Math.cos(angle) * 85, z: Math.sin(angle) * 130 };
  });
  return Array.from({ length: count }, (_, i) => { const angle = -Math.PI / 2 + i * 2.3999632297;
    const radius = count <= 8 ? 215 : 285 * Math.sqrt((i + .6) / count);
    const a = count <= 8 ? -Math.PI / 2 + i * TAU / count : angle;
    return { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
  });
}
export function trajectoryPoint(anchor, progress, radius = 65) {
  const t = clamp(progress, 0, 1), angle = -.5 * Math.PI + t * TAU * 2.35;
  const r = radius * (1 - .64 * t);
  return { x: anchor.x + Math.cos(angle) * r, y: (anchor.y ?? 0) + 5 + 28 * t, z: anchor.z + Math.sin(angle) * r };
}
export function arcPoint(from, to, progress) {
  const t = clamp(progress, 0, 1), height = Math.min(255, 70 + Math.hypot(to.x - from.x, to.z - from.z) * .42);
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t,
    y: from.y + (to.y - from.y) * t + Math.sin(Math.PI * t) * height };
}
