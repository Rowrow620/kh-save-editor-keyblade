import {
  migrateSaveEntries,
  type MigrationResult,
  type SaveArchiveDocument,
} from "./archive";

const RECOM_MAGIC = 0x07;
const RECORD_HEADER_LENGTH = 0x10;
const PLAY_MODE_OFFSET = 0x480;
const CARD_INVENTORY_OFFSET = 0x1fc4;
const EXPERIENCE_OFFSET = 0x2d50;
const LEVEL_OFFSET = 0x2d54;
const MOOGLE_POINTS_OFFSET = 0x2d58;
const MINIMUM_SLOT_LENGTH = MOOGLE_POINTS_OFFSET + 4;

export type RecomStory = "Sora" | "Riku";
export type RecomCardCategory = "Attack" | "Magic / Summon" | "Item" | "Map";

export interface RecomCardDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: RecomCardCategory;
  readonly normalBaseIndex: number;
  readonly premiumBaseIndex?: number;
}

export interface RecomHeldCard {
  readonly inventoryIndex: number;
  readonly count: number;
}

export interface RecomSlotSummary {
  readonly archiveIndex: number;
  readonly story: RecomStory;
  readonly level: number;
  readonly experience: number;
  readonly mooglePoints?: number;
  readonly cards: readonly RecomHeldCard[];
}

export interface RecomSlotEdits {
  readonly archiveIndex: number;
  readonly mooglePoints?: number;
  readonly cardCounts: Readonly<Record<number, number>>;
}

function makeCardDefinitions(
  names: readonly (string | undefined)[],
  category: RecomCardCategory,
  normalBaseIndex: number,
  premiumBaseIndex?: number,
): RecomCardDefinition[] {
  return names.flatMap((name, typeIndex) =>
    name
      ? [
          {
            id: `${category.toLowerCase().replaceAll(/[^a-z]+/g, "-")}-${typeIndex}`,
            name,
            category,
            normalBaseIndex: normalBaseIndex + typeIndex * 10,
            premiumBaseIndex:
              premiumBaseIndex === undefined ? undefined : premiumBaseIndex + typeIndex * 10,
          },
        ]
      : [],
  );
}

const ATTACK_CARDS = [
  "Kingdom Key",
  "Three Wishes",
  "Crabclaw",
  "Pumpkinhead",
  "Fairy Harp",
  "Wishing Star",
  "Spellbinder",
  "Metal Chocobo",
  "Olympia",
  "Lionheart",
  "Lady Luck",
  "Divine Rose",
  "Oathkeeper",
  "Oblivion",
  "Ultima Weapon",
  "Diamond Dust",
  "One-Winged Angel",
  "Soul Eater",
  "Star Seeker",
  "Monochrome",
  "Follow the Wind",
  "Hidden Dragon",
  "Photon Debugger",
  "Bond of Flame",
] as const;

const MAGIC_AND_SUMMON_CARDS = [
  "Fire",
  "Blizzard",
  "Thunder",
  "Cure",
  "Gravity",
  "Stop",
  "Aero",
  undefined,
  undefined,
  "Simba",
  "Genie",
  "Bambi",
  "Dumbo",
  "Tinker Bell",
  "Mushu",
  "Cloud",
] as const;

const ITEM_CARDS = [
  "Potion",
  "Hi-Potion",
  "Mega-Potion",
  "Ether",
  "Mega-Ether",
  "Elixir",
  "Megalixir",
] as const;

const MAP_CARDS = [
  "Tranquil Darkness",
  "Teeming Darkness",
  "Feeble Darkness",
  "Almighty Darkness",
  "Sleeping Darkness",
  "Looming Darkness",
  "Premium Room",
  "White Room",
  "Black Room",
  "Bottomless Darkness",
  "Roulette Darkness",
  "Martial Waking",
  "Sorcerous Waking",
  "Alchemic Waking",
  "Meeting Ground",
  "Stagnant Space",
  "Strong Initiative",
  "Lasting Daze",
  "Calm Bounty",
  "Guarded Trove",
  "False Bounty",
  "Moment's Reprieve",
  "Mingling Worlds",
  "Moogle Room",
  "Random Joker",
] as const;

export const RECOM_FARMABLE_CARDS: readonly RecomCardDefinition[] = [
  ...makeCardDefinitions(ATTACK_CARDS, "Attack", 0, 240),
  ...makeCardDefinitions(MAGIC_AND_SUMMON_CARDS, "Magic / Summon", 480, 640),
  ...makeCardDefinitions(ITEM_CARDS, "Item", 800),
  ...makeCardDefinitions(MAP_CARDS, "Map", 870),
];

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function assertIntegerInRange(
  label: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

function editableCardIndices(): Set<number> {
  const indices = new Set<number>();
  for (const card of RECOM_FARMABLE_CARDS) {
    for (let value = 0; value <= 9; value += 1) {
      indices.add(card.normalBaseIndex + value);
      if (card.premiumBaseIndex !== undefined) indices.add(card.premiumBaseIndex + value);
    }
  }
  return indices;
}

const EDITABLE_CARD_INDICES = editableCardIndices();

export function calculateRecomChecksum(bytes: Uint8Array): number {
  if (bytes.byteLength < RECORD_HEADER_LENGTH) {
    throw new Error("The Re:Chain save record is truncated.");
  }
  const payloadLength = readUint32(bytes, 0x08);
  const payloadEnd = RECORD_HEADER_LENGTH + payloadLength;
  if (payloadEnd > bytes.byteLength) {
    throw new Error("The Re:Chain save record declares an invalid payload length.");
  }

  let checksum = -1;
  for (let offset = RECORD_HEADER_LENGTH; offset < payloadEnd; offset += 1) {
    checksum ^= bytes[offset] << 31;
    checksum = ((checksum << 1) ^ (checksum < 0 ? 0x04c11db7 : 0)) | 0;
  }
  return (~checksum) >>> 0;
}

export function inspectRecomSlot(
  data: Uint8Array,
  archiveIndex = 0,
): RecomSlotSummary | undefined {
  if (data.byteLength < MINIMUM_SLOT_LENGTH || readUint32(data, 0) !== RECOM_MAGIC) {
    return undefined;
  }

  const playMode = data[PLAY_MODE_OFFSET];
  if (playMode !== 0 && playMode !== 1) return undefined;
  const story: RecomStory = playMode === 0 ? "Sora" : "Riku";
  const cards = [...EDITABLE_CARD_INDICES]
    .sort((left, right) => left - right)
    .flatMap<RecomHeldCard>((inventoryIndex) => {
      const count = data[CARD_INVENTORY_OFFSET + inventoryIndex];
      return count > 0 ? [{ inventoryIndex, count }] : [];
    });

  return {
    archiveIndex,
    story,
    level: readUint32(data, LEVEL_OFFSET),
    experience: readUint32(data, EXPERIENCE_OFFSET),
    mooglePoints: story === "Sora" ? readUint32(data, MOOGLE_POINTS_OFFSET) : undefined,
    cards,
  };
}

export function applyRecomSlotEdits(data: Uint8Array, edits: RecomSlotEdits): Uint8Array {
  const summary = inspectRecomSlot(data, edits.archiveIndex);
  if (!summary) {
    throw new Error(`Archive entry ${edits.archiveIndex + 1} is not a playable Re:Chain save slot.`);
  }

  const edited = data.slice();
  if (edits.mooglePoints !== undefined) {
    if (summary.story !== "Sora") {
      throw new Error("Moogle Points are only available in Sora's story.");
    }
    assertIntegerInRange("Moogle Points", edits.mooglePoints, 0, 99_999);
    writeUint32(edited, MOOGLE_POINTS_OFFSET, edits.mooglePoints);
  }

  for (const [rawIndex, count] of Object.entries(edits.cardCounts)) {
    const inventoryIndex = Number(rawIndex);
    if (!EDITABLE_CARD_INDICES.has(inventoryIndex)) {
      throw new Error(`Card index ${rawIndex} is not on the safe Re:Chain editing list.`);
    }
    assertIntegerInRange(`Card ${inventoryIndex} quantity`, count, 0, 99);
    edited[CARD_INVENTORY_OFFSET + inventoryIndex] = count;
  }

  writeUint32(edited, 0x04, calculateRecomChecksum(edited));
  return edited;
}

export function editRecomArchive(
  archive: SaveArchiveDocument,
  edits: readonly RecomSlotEdits[],
): MigrationResult {
  if (archive.format.id !== "recom") {
    throw new Error("This editor requires a Re:Chain of Memories save.");
  }
  if (edits.length === 0) {
    throw new Error("Make at least one change before creating an edited save.");
  }

  const editsByIndex = new Map(edits.map((slotEdits) => [slotEdits.archiveIndex, slotEdits]));
  if (editsByIndex.size !== edits.length) {
    throw new Error("Each Re:Chain save slot can only be edited once.");
  }

  const records = archive.records.map((record) => {
    const slotEdits = editsByIndex.get(record.archiveIndex);
    if (!slotEdits) return record;
    const data = applyRecomSlotEdits(record.data, slotEdits);
    const strideBytes = record.strideBytes.slice();
    strideBytes.set(data, 0);
    return { ...record, data, strideBytes };
  });

  return migrateSaveEntries(
    {
      ...archive,
      entries: records.filter((record) => !record.isEmpty),
      records,
    },
    archive,
    [...editsByIndex.keys()],
  );
}

export function inspectRecomArchive(archive: SaveArchiveDocument): readonly RecomSlotSummary[] {
  if (archive.format.id !== "recom") return [];
  return archive.records.flatMap<RecomSlotSummary>((record) => {
    const summary = inspectRecomSlot(record.data, record.archiveIndex);
    return summary ? [summary] : [];
  });
}
