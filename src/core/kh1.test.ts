import { describe, expect, it } from "vitest";
import { applyKh1SlotEdits, inspectKh1Slot } from "./kh1";

const SORA_OFFSET = 0x04;
const DONALD_OFFSET = 0x78;
const GOOFY_OFFSET = 0xec;

function characterAbilities(bytes: Uint8Array, characterOffset: number): number[] {
  return [...bytes.subarray(characterOffset + 0x40, characterOffset + 0x70)].filter(
    (ability) => ability !== 0,
  );
}

function abilityIdCounts(bytes: Uint8Array, characterOffset: number): Map<number, number> {
  const counts = new Map<number, number>();
  characterAbilities(bytes, characterOffset).forEach((ability) => {
    const id = ability & 0x7f;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return counts;
}

function createKh1Slot(experience = 162_215): Uint8Array {
  const bytes = new Uint8Array(0x16c00);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x05, true);
  bytes[0x04] = 54;
  bytes[0x05] = 66;
  bytes[0x06] = 63;
  bytes[0x07] = 8;
  bytes[0x08] = 6;
  bytes[0x09] = 24;
  bytes[0x0a] = 25;
  bytes[0x0b] = 26;
  bytes[0x1c] = 3;
  bytes[0x25] = 8;
  view.setUint32(0x40, experience, true);
  bytes.set(
    [
      0x35, 0x16, 0x1a, 0xbc, 0x95, 0x8b, 0x39, 0x0a, 0x1c, 0xbe, 0x85, 0x99,
      0x0c, 0x36, 0x0d, 0x1b, 0x13, 0x8e, 0x08, 0x37,
    ],
    0x44,
  );

  const donald = 0x78;
  bytes[donald] = 53;
  bytes[donald + 1] = 51;
  bytes[donald + 2] = 48;
  bytes[donald + 3] = 6;
  bytes[donald + 4] = 7;
  bytes[donald + 5] = 19;
  bytes[donald + 6] = 25;
  bytes[donald + 7] = 23;
  bytes[donald + 0x18] = 2;
  bytes[donald + 0x21] = 6;
  view.setUint32(donald + 0x3c, 162_215, true);
  bytes.set([0x1a, 0x17, 0x18, 0x05, 0x09, 0xbe, 0x85, 0x10, 0x1c, 0x98], donald + 0x40);

  const goofy = 0xec;
  bytes[goofy] = 54;
  bytes[goofy + 1] = 66;
  bytes[goofy + 2] = 66;
  bytes[goofy + 3] = 4;
  bytes[goofy + 4] = 4;
  bytes[goofy + 5] = 19;
  bytes[goofy + 6] = 24;
  bytes[goofy + 7] = 25;
  bytes[goofy + 0x18] = 4;
  bytes[goofy + 0x21] = 8;
  view.setUint32(goofy + 0x3c, 162_215, true);
  bytes.set(
    [0x1e, 0x1b, 0x1d, 0x85, 0x9f, 0x1c, 0x90, 0x3f, 0x09, 0x99, 0x18, 0x20, 0x9a, 0x97, 0x85],
    goofy + 0x40,
  );

  view.setUint32(0x1641c, 6_401, true);
  bytes[0x499 + 0x01] = 6;
  bytes[0x499 + 0xe9] = 8;
  bytes[0x499 + 0xa0] = 99;
  return bytes;
}

describe("KH1 Final Mix inspection", () => {
  it("reads safe player and economy fields", () => {
    const summary = inspectKh1Slot(createKh1Slot(), 3);

    expect(summary).toMatchObject({
      archiveIndex: 3,
      level: 54,
      donaldLevel: 53,
      goofyLevel: 54,
      needsProgressionSync: false,
      munny: 6_401,
    });
  });

  it("only exposes whitelisted farmable inventory", () => {
    const summary = inspectKh1Slot(createKh1Slot());

    expect(summary?.farmableItems).toEqual([
      { id: 0x01, name: "Potion", category: "Consumable", count: 6 },
      { id: 0xe9, name: "Lucid Shard", category: "Synthesis material", count: 8 },
    ]);
  });

  it("ignores system entries and unsupported payloads", () => {
    const systemEntry = new Uint8Array(0x16c00);
    new DataView(systemEntry.buffer).setUint32(0, 0x5153534b, true);

    expect(inspectKh1Slot(systemEntry)).toBeUndefined();
    expect(inspectKh1Slot(new Uint8Array(16))).toBeUndefined();
  });

  it("synchronizes Sora's level, EXP, and natural stat growth", () => {
    const original = createKh1Slot();
    const edited = applyKh1SlotEdits(original, {
      archiveIndex: 0,
      level: 72,
      donaldLevel: 53,
      goofyLevel: 54,
      munny: 99_999,
      itemCounts: { 0x01: 12, 0xe9: 44 },
    });

    expect(inspectKh1Slot(edited)).toMatchObject({
      level: 72,
      munny: 99_999,
      farmableItems: expect.arrayContaining([
        { id: 0x01, name: "Potion", category: "Consumable", count: 12 },
        { id: 0xe9, name: "Lucid Shard", category: "Synthesis material", count: 44 },
      ]),
    });
    expect(original[0x04]).toBe(54);
    expect(new DataView(original.buffer).getUint32(0x1641c, true)).toBe(6_401);

    expect(edited[0x05]).toBe(84);
    expect(edited[0x06]).toBe(81);
    expect(edited[0x07]).toBe(10);
    expect(edited[0x08]).toBe(8);
    expect(edited[0x09]).toBe(34);
    expect(edited[0x0a]).toBe(31);
    expect(edited[0x0b]).toBe(32);
    expect(new DataView(edited.buffer).getUint32(0x40, true)).toBe(471_766);

    expect(original[0x05]).toBe(66);
    expect(original[0x06]).toBe(63);
    expect(new DataView(original.buffer).getUint32(0x40, true)).toBe(162_215);
  });

  it("uses level 100 as the cap and writes the correct Midday EXP threshold", () => {
    const edited = applyKh1SlotEdits(createKh1Slot(), {
      archiveIndex: 0,
      level: 100,
      donaldLevel: 53,
      goofyLevel: 54,
      munny: 6_401,
      itemCounts: {},
    });

    expect(edited[0x04]).toBe(100);
    expect(edited[0x05]).toBe(90);
    expect(edited[0x06]).toBe(87);
    expect(edited[0x07]).toBe(10);
    expect(edited[0x08]).toBe(8);
    expect(edited[0x09]).toBe(50);
    expect(edited[0x0a]).toBe(49);
    expect(edited[0x0b]).toBe(50);
    expect(new DataView(edited.buffer).getUint32(0x40, true)).toBe(975_766);
  });

  it("adds Sora's Shield-route level abilities while preserving story abilities and equipped flags", () => {
    const edited = applyKh1SlotEdits(createKh1Slot(), {
      archiveIndex: 0,
      level: 100,
      donaldLevel: 53,
      goofyLevel: 54,
      munny: 6_401,
      itemCounts: {},
    });
    const abilities = characterAbilities(edited, SORA_OFFSET);
    const counts = abilityIdCounts(edited, SORA_OFFSET);

    expect(abilities).toEqual(expect.arrayContaining([0x16, 0x8b, 0x0c, 0x0d, 0x8e]));
    expect(abilities).toContain(0xbc);
    expect(counts.get(0x06)).toBe(3);
    expect(counts.get(0x07)).toBe(2);
    expect(counts.get(0x08)).toBe(2);
    expect(counts.get(0x18)).toBe(2);
    expect(counts.get(0x3c)).toBe(2);
    expect(counts.get(0x41)).toBe(1);
  });

  it("synchronizes Donald's level, EXP, stats, slots, and abilities", () => {
    const edited = applyKh1SlotEdits(createKh1Slot(), {
      archiveIndex: 0,
      level: 54,
      donaldLevel: 100,
      goofyLevel: 54,
      munny: 6_401,
      itemCounts: {},
    });
    const view = new DataView(edited.buffer);
    const counts = abilityIdCounts(edited, DONALD_OFFSET);

    expect(edited[DONALD_OFFSET]).toBe(100);
    expect(edited[DONALD_OFFSET + 1]).toBe(57);
    expect(edited[DONALD_OFFSET + 2]).toBe(54);
    expect(edited[DONALD_OFFSET + 3]).toBe(9);
    expect(edited[DONALD_OFFSET + 4]).toBe(10);
    expect(edited[DONALD_OFFSET + 5]).toBe(25);
    expect(edited[DONALD_OFFSET + 6]).toBe(63);
    expect(edited[DONALD_OFFSET + 7]).toBe(63);
    expect(edited[DONALD_OFFSET + 0x18]).toBe(2);
    expect(edited[DONALD_OFFSET + 0x21]).toBe(6);
    expect(view.getUint32(DONALD_OFFSET + 0x3c, true)).toBe(999_666);
    expect(characterAbilities(edited, DONALD_OFFSET)).toContain(0x10);
    expect(counts.get(0x05)).toBe(2);
    expect(counts.get(0x18)).toBe(2);
    expect(counts.get(0x19)).toBe(1);
    expect(counts.get(0x1b)).toBe(1);
  });

  it("synchronizes Goofy's level, EXP, stats, slots, and duplicate abilities", () => {
    const edited = applyKh1SlotEdits(createKh1Slot(), {
      archiveIndex: 0,
      level: 54,
      donaldLevel: 53,
      goofyLevel: 100,
      munny: 6_401,
      itemCounts: {},
    });
    const view = new DataView(edited.buffer);
    const counts = abilityIdCounts(edited, GOOFY_OFFSET);

    expect(edited[GOOFY_OFFSET]).toBe(100);
    expect(edited[GOOFY_OFFSET + 1]).toBe(78);
    expect(edited[GOOFY_OFFSET + 2]).toBe(78);
    expect(edited[GOOFY_OFFSET + 3]).toBe(5);
    expect(edited[GOOFY_OFFSET + 4]).toBe(5);
    expect(edited[GOOFY_OFFSET + 5]).toBe(29);
    expect(edited[GOOFY_OFFSET + 6]).toBe(60);
    expect(edited[GOOFY_OFFSET + 7]).toBe(61);
    expect(edited[GOOFY_OFFSET + 0x18]).toBe(4);
    expect(edited[GOOFY_OFFSET + 0x21]).toBe(8);
    expect(view.getUint32(GOOFY_OFFSET + 0x3c, true)).toBe(950_718);
    expect(characterAbilities(edited, GOOFY_OFFSET)).toContain(0x90);
    expect(counts.get(0x05)).toBe(2);
    expect(counts.get(0x18)).toBe(2);
  });

  it("removes only Donald's higher-level abilities when lowering him", () => {
    const level100 = applyKh1SlotEdits(createKh1Slot(), {
      archiveIndex: 0,
      level: 54,
      donaldLevel: 100,
      goofyLevel: 54,
      munny: 6_401,
      itemCounts: {},
    });
    const lowered = applyKh1SlotEdits(level100, {
      archiveIndex: 0,
      level: 54,
      donaldLevel: 20,
      goofyLevel: 54,
      munny: 6_401,
      itemCounts: {},
    });
    const abilities = characterAbilities(lowered, DONALD_OFFSET);
    const counts = abilityIdCounts(lowered, DONALD_OFFSET);

    expect(abilities).toContain(0x10);
    expect(counts.get(0x1a)).toBe(1);
    expect(counts.get(0x17)).toBe(1);
    expect(counts.get(0x18)).toBe(1);
    expect(counts.get(0x05)).toBeUndefined();
    expect(counts.get(0x3e)).toBeUndefined();
  });

  it.each([
    ["Dawn", 180_000, 999_856],
    ["Night", 140_000, 946_728],
  ])("preserves the %s EXP pace", (_route, originalExperience, expectedExperience) => {
    const edited = applyKh1SlotEdits(createKh1Slot(originalExperience), {
      archiveIndex: 0,
      level: 100,
      donaldLevel: 53,
      goofyLevel: 54,
      munny: 6_401,
      itemCounts: {},
    });

    expect(new DataView(edited.buffer).getUint32(0x40, true)).toBe(expectedExperience);
  });

  it("does not rewrite Sora's progression when the level is unchanged", () => {
    const original = createKh1Slot();
    const edited = applyKh1SlotEdits(original, {
      archiveIndex: 0,
      level: 54,
      donaldLevel: 53,
      goofyLevel: 54,
      munny: 7_000,
      itemCounts: {},
    });

    expect(edited.slice(0x04, 0x44)).toEqual(original.slice(0x04, 0x44));
  });

  it("repairs a previously inconsistent direct level edit from its real progression baseline", () => {
    const inconsistent = createKh1Slot();
    inconsistent[0x04] = 99;

    expect(inspectKh1Slot(inconsistent)?.needsProgressionSync).toBe(true);

    const repaired = applyKh1SlotEdits(inconsistent, {
      archiveIndex: 0,
      level: 100,
      donaldLevel: 53,
      goofyLevel: 54,
      munny: 6_401,
      itemCounts: {},
    });

    expect(repaired[0x04]).toBe(100);
    expect(repaired[0x06]).toBe(87);
    expect(repaired[0x08]).toBe(8);
    expect(repaired[0x09]).toBe(50);
    expect(repaired[0x0a]).toBe(49);
    expect(repaired[0x0b]).toBe(50);
    expect(new DataView(repaired.buffer).getUint32(0x40, true)).toBe(975_766);
  });

  it("rejects values and item ids outside the safe editing list", () => {
    const original = createKh1Slot();

    expect(() =>
      applyKh1SlotEdits(original, {
        archiveIndex: 0,
        level: 101,
        donaldLevel: 53,
        goofyLevel: 54,
        munny: 0,
        itemCounts: {},
      }),
    ).toThrow("Level must be between 1 and 100");

    expect(() =>
      applyKh1SlotEdits(original, {
        archiveIndex: 0,
        level: 54,
        donaldLevel: 101,
        goofyLevel: 54,
        munny: 0,
        itemCounts: {},
      }),
    ).toThrow("Donald level must be between 1 and 100");

    expect(() =>
      applyKh1SlotEdits(original, {
        archiveIndex: 0,
        level: 54,
        donaldLevel: 53,
        goofyLevel: 0,
        munny: 0,
        itemCounts: {},
      }),
    ).toThrow("Goofy level must be between 1 and 100");

    expect(() =>
      applyKh1SlotEdits(original, {
        archiveIndex: 0,
        level: 54,
        donaldLevel: 53,
        goofyLevel: 54,
        munny: 0,
        itemCounts: { 0xa0: 1 },
      }),
    ).toThrow("not on the safe KH1 editing list");
  });
});
