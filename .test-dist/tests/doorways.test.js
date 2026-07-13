import { findDoorwayConnections, roomMeetsGlobalConnectionOrSpacingRule, roomsMeetConnectionOrSpacingRule, transformDoorway, } from '../src/geometry.js';
import { getFurnitureLimit, getRoomLimit } from '../src/data/limits.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
function assertDoorway(actual, expected, label) {
    assert(actual.side === expected.side, `${label}: expected side ${expected.side}, got ${actual.side}`);
    assert(actual.offset === expected.offset, `${label}: expected offset ${expected.offset}, got ${actual.offset}`);
    assert(actual.structureWidth === expected.structureWidth, `${label}: incorrect rotated width`);
    assert(actual.structureHeight === expected.structureHeight, `${label}: incorrect rotated height`);
}
const northCenter = { side: 'north', offset: 4, width: 2 };
assertDoorway(transformDoorway(northCenter, 8, 8, 0), { side: 'north', offset: 4, structureWidth: 8, structureHeight: 8 }, 'square 0°');
assertDoorway(transformDoorway(northCenter, 8, 8, 90), { side: 'east', offset: 4, structureWidth: 8, structureHeight: 8 }, 'square 90°');
assertDoorway(transformDoorway(northCenter, 8, 8, 180), { side: 'south', offset: 4, structureWidth: 8, structureHeight: 8 }, 'square 180°');
assertDoorway(transformDoorway(northCenter, 8, 8, 270), { side: 'west', offset: 4, structureWidth: 8, structureHeight: 8 }, 'square 270°');
const crossDoorways = [
    { side: 'north', offset: 4, width: 2 },
    { side: 'east', offset: 4, width: 2 },
    { side: 'south', offset: 4, width: 2 },
    { side: 'west', offset: 4, width: 2 },
];
const crossRotated = crossDoorways.map((doorway) => transformDoorway(doorway, 8, 8, 90));
assert(crossRotated.map((doorway) => doorway.side).join(',') === 'east,south,west,north', 'all Cross doorways should rotate clockwise');
const endDoorway = { side: 'north', offset: 4, width: 2 };
assertDoorway(transformDoorway(endDoorway, 8, 8, 180), { side: 'south', offset: 4, structureWidth: 8, structureHeight: 8 }, 'end rounded 180°');
const roundedCornerDoorways = [
    { side: 'north', offset: 4, width: 2 },
    { side: 'east', offset: 4, width: 2 },
];
assertDoorway(transformDoorway(roundedCornerDoorways[0], 8, 8, 90), { side: 'east', offset: 4, structureWidth: 8, structureHeight: 8 }, 'rounded corner north 90°');
assertDoorway(transformDoorway(roundedCornerDoorways[1], 8, 8, 90), { side: 'south', offset: 4, structureWidth: 8, structureHeight: 8 }, 'rounded corner east 90°');
const rectangularDoor = { side: 'north', offset: 4, width: 2 };
assertDoorway(transformDoorway(rectangularDoor, 8, 4, 90), { side: 'east', offset: 4, structureWidth: 4, structureHeight: 8 }, 'hallway north 90°');
const squareDefinition = {
    id: 'square',
    name: 'Square',
    category: 'room',
    width: 8,
    height: 8,
    cost: 0,
    level: 1,
    shape: 'rectangle',
    doorways: [
        { side: 'north', offset: 4, width: 2 },
        { side: 'east', offset: 4, width: 2 },
        { side: 'south', offset: 4, width: 2 },
        { side: 'west', offset: 4, width: 2 },
    ],
};
const pathDefinition = {
    id: 'cobblestone-path',
    name: 'Cobblestone Path',
    category: 'path',
    width: 2,
    height: 2,
    shape: 'rectangle',
    doorways: [],
};
const portalDefinition = {
    id: 'house-portal',
    name: 'Portal',
    category: 'portal',
    width: 2,
    height: 2,
    shape: 'rectangle',
    doorways: [],
};
const definitions = new Map([
    [squareDefinition.id, squareDefinition],
    [pathDefinition.id, pathDefinition],
    [portalDefinition.id, portalDefinition],
]);
const connected = [
    { instanceId: 'a', structureId: 'square', x: 0, y: 0, rotation: 0 },
    { instanceId: 'b', structureId: 'square', x: 8, y: 0, rotation: 0 },
];
assert(findDoorwayConnections(connected, definitions).length === 1, 'touching aligned squares should have one connection');
const misaligned = [
    connected[0],
    { ...connected[1], y: 2 },
];
assert(findDoorwayConnections(misaligned, definitions).length === 0, 'misaligned doorway spans must not connect');
const baseRoom = { instanceId: 'base', structureId: 'square', x: 4, y: 4, rotation: 0 };
const touchingConnected = { instanceId: 'touch-connected', structureId: 'square', x: 12, y: 4, rotation: 0 };
assert(roomsMeetConnectionOrSpacingRule(baseRoom, touchingConnected, definitions), 'rooms touching at aligned doorways should satisfy the connection rule');
const touchingMisaligned = { instanceId: 'touch-misaligned', structureId: 'square', x: 12, y: 5, rotation: 0 };
assert(!roomsMeetConnectionOrSpacingRule(baseRoom, touchingMisaligned, definitions), 'touching rooms without aligned doorways should be invalid');
const oneTileGap = { instanceId: 'one-gap', structureId: 'square', x: 13, y: 4, rotation: 0 };
assert(!roomsMeetConnectionOrSpacingRule(baseRoom, oneTileGap, definitions), 'unconnected rooms with only one empty tile between them should be invalid');
const twoTileGap = { instanceId: 'two-gap', structureId: 'square', x: 14, y: 4, rotation: 0 };
assert(roomsMeetConnectionOrSpacingRule(baseRoom, twoTileGap, definitions), 'unconnected rooms with two empty tiles between them should be valid');
const diagonalOneTileGap = { instanceId: 'diagonal-one-gap', structureId: 'square', x: 13, y: 13, rotation: 0 };
assert(!roomsMeetConnectionOrSpacingRule(baseRoom, diagonalOneTileGap, definitions), 'rooms separated diagonally by only one tile on each axis should be invalid');
const tJunctionExistingRooms = [
    { instanceId: 'junction-top', structureId: 'square', x: 4, y: 4, rotation: 0 },
    { instanceId: 'junction-bottom', structureId: 'square', x: 4, y: 12, rotation: 0 },
];
const tJunctionCandidate = {
    instanceId: 'junction-right',
    structureId: 'square',
    x: 12,
    y: 4,
    rotation: 0,
};
assert(!roomsMeetConnectionOrSpacingRule(tJunctionCandidate, tJunctionExistingRooms[1], definitions), 'the old pairwise rule rejects the candidate touching the lower room at a corner');
assert(roomMeetsGlobalConnectionOrSpacingRule(tJunctionCandidate, tJunctionExistingRooms, definitions), 'a room with one valid doorway connection may also touch another room at a wall or corner');
const globallyUnconnectedCandidate = {
    instanceId: 'global-unconnected',
    structureId: 'square',
    x: 13,
    y: 4,
    rotation: 0,
};
assert(!roomMeetsGlobalConnectionOrSpacingRule(globallyUnconnectedCandidate, [baseRoom], definitions), 'a room with no connection must remain at least two empty tiles from every room');
const touchingPath = {
    instanceId: 'path',
    structureId: 'cobblestone-path',
    x: 12,
    y: 5,
    rotation: 0,
};
assert(roomsMeetConnectionOrSpacingRule(baseRoom, touchingPath, definitions), 'paths may touch rooms without a doorway connection or two-tile gap');
const touchingPortal = {
    instanceId: 'portal',
    structureId: 'house-portal',
    x: 6,
    y: 6,
    rotation: 0,
};
assert(roomsMeetConnectionOrSpacingRule(baseRoom, touchingPortal, definitions), 'portals may coexist with rooms without a doorway connection or two-tile gap');
assert(getFurnitureLimit(20) === 50, 'furniture limit at 20 should be 50');
assert(getFurnitureLimit(94) === 150, 'furniture limit before 95 should remain 150');
assert(getFurnitureLimit(115) === 300, 'furniture limit at 115 should be 300');
assert(getRoomLimit(20) === undefined, 'room limit below 30 is currently unknown');
assert(getRoomLimit(30) === 10, 'room limit at 30 should be 10');
assert(getRoomLimit(99) === 20, 'room limit at 99 should be 20');
assert(getRoomLimit(120) === 25, 'room limit at 120 should be 25');
console.log('Doorway geometry, global room-spacing, portal/path exemptions, and limit tests passed.');
