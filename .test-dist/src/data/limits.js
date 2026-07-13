export const FURNITURE_LIMIT_STEPS = [
    { level: 20, limit: 50 },
    { level: 35, limit: 75 },
    { level: 50, limit: 100 },
    { level: 65, limit: 125 },
    { level: 80, limit: 150 },
    { level: 95, limit: 200 },
    { level: 110, limit: 250 },
    { level: 115, limit: 300 },
];
export const ROOM_LIMIT_STEPS = [
    { level: 30, limit: 10 },
    { level: 60, limit: 15 },
    { level: 90, limit: 20 },
    { level: 120, limit: 25 },
];
function activeLimit(level, steps) {
    let current;
    for (const step of steps) {
        if (level >= step.level)
            current = step;
    }
    return current;
}
export function getFurnitureLimit(level) {
    return activeLimit(level, FURNITURE_LIMIT_STEPS)?.limit;
}
export function getRoomLimit(level) {
    return activeLimit(level, ROOM_LIMIT_STEPS)?.limit;
}
export function nextFurnitureLimit(level) {
    return FURNITURE_LIMIT_STEPS.find((step) => step.level > level);
}
export function nextRoomLimit(level) {
    return ROOM_LIMIT_STEPS.find((step) => step.level > level);
}
