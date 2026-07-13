export interface LimitStep {
  level: number;
  limit: number;
}

export const FURNITURE_LIMIT_STEPS: LimitStep[] = [
  { level: 20, limit: 50 },
  { level: 35, limit: 75 },
  { level: 50, limit: 100 },
  { level: 65, limit: 125 },
  { level: 80, limit: 150 },
  { level: 95, limit: 200 },
  { level: 110, limit: 250 },
  { level: 115, limit: 300 },
];

export const ROOM_LIMIT_STEPS: LimitStep[] = [
  { level: 30, limit: 10 },
  { level: 60, limit: 15 },
  { level: 90, limit: 20 },
  { level: 120, limit: 25 },
];

function activeLimit(level: number, steps: LimitStep[]) {
  let current: LimitStep | undefined;
  for (const step of steps) {
    if (level >= step.level) current = step;
  }
  return current;
}

export function getFurnitureLimit(level: number) {
  return activeLimit(level, FURNITURE_LIMIT_STEPS)?.limit;
}

export function getRoomLimit(level: number) {
  return activeLimit(level, ROOM_LIMIT_STEPS)?.limit;
}

export function nextFurnitureLimit(level: number) {
  return FURNITURE_LIMIT_STEPS.find((step) => step.level > level);
}

export function nextRoomLimit(level: number) {
  return ROOM_LIMIT_STEPS.find((step) => step.level > level);
}
