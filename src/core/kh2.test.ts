import { describe, expect, it } from "vitest";
import {
  applyKh2SlotEdits,
  calculateKh2Checksum,
  inferKh2DreamWeapon,
  inspectKh2Slot,
  kh2PartyLevelsAtSoraLevel,
} from "./kh2";

const CHARACTER_OFFSET = 0x24f0;
const CHARACTER_STRIDE = 0x114;
const ABILITIES_OFFSET = 0x54;
const INVENTORY_OFFSET = 0x3580;

const SWORD_REWARDS_THROUGH_24 = [390, 401, 403, 392, 411, 402, 408];
const ALL_SWORD_REWARDS = [
  390, 401, 403, 392, 411, 402, 408, 397, 405, 400, 396, 391, 409, 540, 394,
  416, 393, 410, 414, 395, 406, 415, 542,
];

function abilityOffset(slot: number): number {
  return CHARACTER_OFFSET + ABILITIES_OFFSET + slot * 2;
}

function createKh2Slot(): Uint8Array {
  const bytes = new Uint8Array(0x10fc0);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x4a32484b, true);
  bytes[0x04] = 0x3a;
  view.setUint32(0x2440, 698, true);
  bytes[CHARACTER_OFFSET + 0x0f] = 24;
  bytes[CHARACTER_OFFSET + CHARACTER_STRIDE + 0x0f] = 25;
  bytes[CHARACTER_OFFSET + CHARACTER_STRIDE * 2 + 0x0f] = 25;
  view.setUint32(0x36e0, 26_556, true);
  SWORD_REWARDS_THROUGH_24.forEach((ability, slot) => {
    view.setUint16(abilityOffset(slot), ability, true);
  });
  view.setUint16(abilityOffset(10), 0x8000 | 500, true);
  bytes[INVENTORY_OFFSET] = 4;
  bytes[INVENTORY_OFFSET + 143] = 8;
  bytes[INVENTORY_OFFSET + 187] = 1;
  view.setUint32(0x08, calculateKh2Checksum(bytes), true);
  return bytes;
}

function abilityValues(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: 0x50 }, (_, slot) => view.getUint16(abilityOffset(slot), true)).filter(
    (ability) => ability !== 0,
  );
}

describe("KH2 Final Mix inspection", () => {
  it("reads levels, route, shared EXP, munny, and whitelisted inventory", () => {
    const summary = inspectKh2Slot(createKh2Slot(), 1);
    expect(summary).toMatchObject({
      archiveIndex: 1,
      soraLevel: 24,
      donaldLevel: 25,
      goofyLevel: 25,
      experience: 26_556,
      dreamWeapon: "Sword",
      needsLevelSync: false,
      munny: 698,
    });
    expect(summary?.farmableItems).toEqual([
      { id: 0, name: "Potion", category: "Consumable", count: 4 },
      { id: 143, name: "Blazing Shard", category: "Synthesis material", count: 8 },
    ]);
    expect(inferKh2DreamWeapon(createKh2Slot(), 24)).toBe("Sword");
    expect(inspectKh2Slot(new Uint8Array(0x10fc0))).toBeUndefined();
  });

  it("derives Donald and Goofy from KH2's shared EXP progression", () => {
    expect(kh2PartyLevelsAtSoraLevel(24)).toEqual({ sora: 24, donald: 24, goofy: 24 });
    expect(kh2PartyLevelsAtSoraLevel(99)).toEqual({ sora: 99, donald: 99, goofy: 99 });
  });
});

describe("KH2 Final Mix editing", () => {
  it("synchronizes shared EXP, party levels, abilities, inventory, munny, and checksum", () => {
    const original = createKh2Slot();
    const edited = applyKh2SlotEdits(original, {
      archiveIndex: 0,
      soraLevel: 99,
      munny: 99_999,
      itemCounts: { 0: 12, 143: 44 },
    });
    const editedView = new DataView(edited.buffer);
    const ids = new Set(abilityValues(edited).map((ability) => ability & 0x7fff));

    expect(edited[CHARACTER_OFFSET + 0x0f]).toBe(99);
    expect(edited[CHARACTER_OFFSET + CHARACTER_STRIDE + 0x0f]).toBe(99);
    expect(edited[CHARACTER_OFFSET + CHARACTER_STRIDE * 2 + 0x0f]).toBe(99);
    expect(editedView.getUint32(0x36e0, true)).toBe(2_875_578);
    expect(editedView.getUint32(0x2440, true)).toBe(99_999);
    expect(edited[INVENTORY_OFFSET]).toBe(12);
    expect(edited[INVENTORY_OFFSET + 143]).toBe(44);
    expect(edited[INVENTORY_OFFSET + 187]).toBe(1);
    expect(ALL_SWORD_REWARDS.every((ability) => ids.has(ability))).toBe(true);
    expect(abilityValues(edited)).toContain(0x8000 | 500);
    expect(editedView.getUint32(0x08, true)).toBe(calculateKh2Checksum(edited));
    expect(new DataView(original.buffer).getUint32(0x36e0, true)).toBe(26_556);
  });

  it("removes only higher-level route rewards when lowering a level", () => {
    const edited = applyKh2SlotEdits(createKh2Slot(), {
      archiveIndex: 0,
      soraLevel: 14,
      munny: 698,
      itemCounts: {},
    });
    const values = abilityValues(edited);
    const ids = values.map((ability) => ability & 0x7fff);

    expect(ids).toEqual(expect.arrayContaining([390, 401, 403, 500]));
    expect(ids).not.toEqual(expect.arrayContaining([392, 411, 402, 408]));
    expect(values).toContain(0x8000 | 500);
    expect(new DataView(edited.buffer).getUint32(0x36e0, true)).toBe(3_902);
  });

  it("rejects unsafe limits and a level change when the route is ambiguous", () => {
    expect(() =>
      applyKh2SlotEdits(createKh2Slot(), {
        archiveIndex: 0,
        soraLevel: 100,
        munny: 698,
        itemCounts: {},
      }),
    ).toThrow("between 1 and 99");

    const ambiguous = createKh2Slot();
    const view = new DataView(ambiguous.buffer);
    for (let slot = 0; slot < 0x50; slot += 1) view.setUint16(abilityOffset(slot), 0, true);
    expect(() =>
      applyKh2SlotEdits(ambiguous, {
        archiveIndex: 0,
        soraLevel: 30,
        munny: 698,
        itemCounts: {},
      }),
    ).toThrow("Dream Weapon route could not be identified");
  });
});
