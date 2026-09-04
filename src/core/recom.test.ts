import { describe, expect, it } from "vitest";
import {
  applyRecomSlotEdits,
  calculateRecomChecksum,
  inspectRecomSlot,
  RECOM_FARMABLE_CARDS,
} from "./recom";

const CARD_INVENTORY_OFFSET = 0x1fc4;

function createRecomSlot(story: "Sora" | "Riku" = "Sora"): Uint8Array {
  const bytes = new Uint8Array(0x3630);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x07, true);
  view.setUint32(0x08, 0x3620, true);
  bytes[0x480] = story === "Sora" ? 0 : 1;
  view.setUint32(0x2d50, story === "Sora" ? 288_568 : 71_152, true);
  view.setUint32(0x2d54, story === "Sora" ? 59 : 37, true);
  view.setUint32(0x2d58, story === "Sora" ? 146 : 0, true);
  bytes[CARD_INVENTORY_OFFSET + 170] = 3;
  bytes[CARD_INVENTORY_OFFSET + 804] = 7;
  view.setUint32(0x04, calculateRecomChecksum(bytes), true);
  return bytes;
}

function referenceChecksum(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = 0x10 + view.getUint32(0x08, true);
  let checksum = -1;
  for (let offset = 0x10; offset < end; offset += 1) {
    checksum ^= bytes[offset] << 31;
    const carry = checksum < 0;
    checksum = (checksum << 1) | 0;
    if (carry) checksum = (checksum ^ 0x04c11db7) | 0;
  }
  return (~checksum) >>> 0;
}

describe("Re:Chain of Memories inspection", () => {
  it("reads Sora and Riku slots without treating system data as playable", () => {
    expect(inspectRecomSlot(createRecomSlot("Sora"), 2)).toMatchObject({
      archiveIndex: 2,
      story: "Sora",
      level: 59,
      experience: 288_568,
      mooglePoints: 146,
    });
    expect(inspectRecomSlot(createRecomSlot("Riku"))).toMatchObject({
      story: "Riku",
      level: 37,
      experience: 71_152,
      mooglePoints: undefined,
    });
    expect(inspectRecomSlot(new Uint8Array(0x3630))).toBeUndefined();
  });

  it("exposes normal and premium non-story card definitions while excluding enemy cards", () => {
    expect(RECOM_FARMABLE_CARDS.find((card) => card.name === "Kingdom Key")).toMatchObject({
      normalBaseIndex: 0,
      premiumBaseIndex: 240,
    });
    expect(RECOM_FARMABLE_CARDS.find((card) => card.name === "Potion")).toMatchObject({
      normalBaseIndex: 800,
      premiumBaseIndex: undefined,
    });
    expect(RECOM_FARMABLE_CARDS.every((card) => card.normalBaseIndex < 1120)).toBe(true);
  });
});

describe("Re:Chain of Memories editing", () => {
  it("edits Moogle Points and card quantities, preserves the input, and regenerates checksum", () => {
    const original = createRecomSlot();
    const originalChecksum = new DataView(original.buffer).getUint32(0x04, true);
    const edited = applyRecomSlotEdits(original, {
      archiveIndex: 0,
      mooglePoints: 99_999,
      cardCounts: { 170: 11, 240: 4, 804: 22 },
    });
    const editedView = new DataView(edited.buffer);

    expect(inspectRecomSlot(edited)).toMatchObject({ mooglePoints: 99_999, level: 59 });
    expect(edited[CARD_INVENTORY_OFFSET + 170]).toBe(11);
    expect(edited[CARD_INVENTORY_OFFSET + 240]).toBe(4);
    expect(edited[CARD_INVENTORY_OFFSET + 804]).toBe(22);
    expect(editedView.getUint32(0x04, true)).toBe(referenceChecksum(edited));
    expect(editedView.getUint32(0x04, true)).not.toBe(originalChecksum);
    expect(new DataView(original.buffer).getUint32(0x2d58, true)).toBe(146);
    expect(original[CARD_INVENTORY_OFFSET + 170]).toBe(3);
  });

  it("does not allow Sora-only points or enemy-card offsets in a Riku save", () => {
    expect(() =>
      applyRecomSlotEdits(createRecomSlot("Riku"), {
        archiveIndex: 0,
        mooglePoints: 20,
        cardCounts: {},
      }),
    ).toThrow("only available in Sora's story");
    expect(() =>
      applyRecomSlotEdits(createRecomSlot(), {
        archiveIndex: 0,
        mooglePoints: 146,
        cardCounts: { 1120: 1 },
      }),
    ).toThrow("safe Re:Chain editing list");
  });

  it("rejects values outside the in-game editor limits", () => {
    expect(() =>
      applyRecomSlotEdits(createRecomSlot(), {
        archiveIndex: 0,
        mooglePoints: 100_000,
        cardCounts: {},
      }),
    ).toThrow("between 0 and 99999");
    expect(() =>
      applyRecomSlotEdits(createRecomSlot(), {
        archiveIndex: 0,
        mooglePoints: 146,
        cardCounts: { 0: 100 },
      }),
    ).toThrow("between 0 and 99");
  });
});
