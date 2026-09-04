import {
  migrateSaveEntries,
  type MigrationResult,
  type SaveArchiveDocument,
} from "./archive";

const KH2_MAGIC_CODES = new Set([0x4a32484b, 0x5532484b, 0x4532484b]);
const MUNNY_OFFSET = 0x2440;
const CHARACTER_OFFSET = 0x24f0;
const CHARACTER_STRIDE = 0x114;
const CHARACTER_LEVEL_OFFSET = 0x0f;
const ABILITIES_OFFSET = 0x54;
const ABILITY_COUNT = 0x50;
const INVENTORY_OFFSET = 0x3580;
const EXPERIENCE_OFFSET = 0x36e0;
const MINIMUM_SLOT_LENGTH = 0x3704;

const SORA_EXPERIENCE = [
  0, 40, 100, 184, 296, 440, 620, 840, 1128, 1492, 1940, 2480, 3120, 3902, 4838,
  5940, 7260, 8814, 10618, 12688, 15088, 17838, 20949, 24433, 28302, 32622,
  37407, 42671, 48485, 54865, 61886, 69566, 77984, 87160, 97177, 108057, 119887,
  132691, 146560, 161520, 177666, 195026, 213699, 233715, 255177, 278117, 302642,
  328786, 356660, 386378, 417978, 450378, 483578, 517578, 552378, 587978, 624378,
  661578, 699578, 738378, 777978, 818378, 859578, 901578, 944378, 987978, 1032378,
  1077578, 1123578, 1170378, 1217978, 1266378, 1315578, 1365578, 1416378, 1467978,
  1520378, 1573578, 1627578, 1682378, 1737978, 1794378, 1851578, 1909578, 1968378,
  2027978, 2088378, 2149578, 2211578, 2274378, 2337978, 2402378, 2467578, 2533578,
  2600378, 2667978, 2736378, 2805578, 2875578,
] as const;

const DONALD_EXPERIENCE = [
  0, 40, 86, 148, 247, 376, 540, 742, 987, 1305, 1704, 2192, 2777, 3467, 4306, 5307,
  6481, 7883, 9529, 11435, 13617, 16142, 19029, 22292, 25943, 29994, 34514, 39516,
  45015, 51084, 57739, 65057, 73057, 81820, 91366, 101780, 113085, 125370, 138659,
  153045, 168555, 185286, 203266, 222596, 243307, 265504, 289219, 314561, 341565,
  370344, 401014, 433614, 467014, 501214, 536214, 572014, 608614, 646014, 684214,
  723214, 763014, 803614, 845014, 887214, 930214, 974014, 1018614, 1064014, 1110214,
  1157214, 1205014, 1253614, 1303014, 1353214, 1404214, 1456014, 1508614, 1562014,
  1616214, 1671214, 1727014, 1783614, 1841014, 1899214, 1958214, 2018014, 2078614,
  2140014, 2202214, 2265214, 2329014, 2393614, 2459014, 2525214, 2592214, 2660014,
  2728614, 2798014, 2868214,
] as const;

const GOOFY_EXPERIENCE = [
  0, 40, 86, 146, 219, 341, 497, 690, 925, 1231, 1616, 2088, 2655, 3325, 4141, 5116,
  6261, 7630, 9239, 11104, 13241, 15716, 18548, 21750, 25334, 29312, 33752, 38667,
  44072, 50039, 56584, 63783, 71655, 80280, 89678, 99933, 111068, 123171, 136266,
  150445, 165735, 182232, 199964, 219031, 239464, 261367, 284772, 309787, 336447,
  364864, 395153, 427353, 460353, 494153, 528753, 564153, 600353, 637353, 675153,
  713753, 753153, 793353, 834353, 876153, 918753, 962153, 1006353, 1051353, 1097153,
  1143753, 1191153, 1239353, 1288353, 1338153, 1388753, 1440153, 1492353, 1545353,
  1599153, 1653753, 1709153, 1765353, 1822353, 1880153, 1938753, 1998153, 2058353,
  2119353, 2181153, 2243753, 2307153, 2371353, 2436353, 2502153, 2568753, 2636153,
  2704353, 2773353, 2843153,
] as const;

export type Kh2DreamWeapon = "Sword" | "Shield" | "Staff";

const SORA_LEVEL_ABILITIES: Readonly<Record<Kh2DreamWeapon, Readonly<Record<number, number>>>> = {
  Sword: { 7: 390, 9: 401, 12: 403, 15: 392, 17: 411, 20: 402, 23: 408, 25: 397, 28: 405, 31: 400, 33: 396, 36: 391, 39: 409, 41: 540, 44: 394, 47: 416, 49: 393, 53: 410, 59: 414, 65: 395, 73: 406, 85: 415, 99: 542 },
  Shield: { 7: 411, 9: 390, 12: 403, 15: 396, 17: 401, 20: 402, 23: 392, 25: 416, 28: 397, 31: 414, 33: 408, 36: 406, 39: 400, 41: 542, 44: 391, 47: 405, 49: 415, 53: 540, 59: 409, 65: 393, 73: 394, 85: 395, 99: 410 },
  Staff: { 7: 401, 9: 411, 12: 403, 15: 408, 17: 390, 20: 402, 23: 396, 25: 405, 28: 416, 31: 409, 33: 392, 36: 394, 39: 414, 41: 410, 44: 406, 47: 397, 49: 395, 53: 542, 59: 400, 65: 415, 73: 391, 85: 393, 99: 540 },
};

export interface Kh2FarmableItemDefinition {
  readonly id: number;
  readonly name: string;
  readonly category: "Consumable" | "Synthesis material";
}

const materialGroup = (start: number, element: string): Kh2FarmableItemDefinition[] =>
  ["Shard", "Stone", "Gem", "Crystal"].map((tier, index) => ({
    id: start + index,
    name: `${element} ${tier}`,
    category: "Synthesis material" as const,
  }));

export const KH2_FARMABLE_ITEMS: readonly Kh2FarmableItemDefinition[] = [
  ...["Potion", "Hi-Potion", "Ether", "Elixir", "Mega-Potion", "Mega-Ether", "Megalixir"].map(
    (name, id) => ({ id, name, category: "Consumable" as const }),
  ),
  ...materialGroup(143, "Blazing"),
  ...materialGroup(151, "Lightning"),
  ...materialGroup(155, "Power"),
  ...materialGroup(159, "Lucid"),
  ...materialGroup(163, "Dense"),
  ...materialGroup(167, "Twilight"),
  ...materialGroup(171, "Mythril"),
  ...materialGroup(175, "Bright"),
  ...materialGroup(179, "Energy"),
  ...materialGroup(183, "Serenity"),
  { id: 203, name: "Orichalcum", category: "Synthesis material" },
  ...materialGroup(204, "Frost"),
  ...materialGroup(234, "Dark"),
  ...materialGroup(296, "Remembrance"),
  ...materialGroup(300, "Tranquility"),
];

export interface Kh2FarmableItem extends Kh2FarmableItemDefinition {
  readonly count: number;
}

export interface Kh2SlotSummary {
  readonly archiveIndex: number;
  readonly soraLevel: number;
  readonly donaldLevel: number;
  readonly goofyLevel: number;
  readonly experience: number;
  readonly dreamWeapon?: Kh2DreamWeapon;
  readonly needsLevelSync: boolean;
  readonly munny: number;
  readonly farmableItems: readonly Kh2FarmableItem[];
}

export interface Kh2SlotEdits {
  readonly archiveIndex: number;
  readonly soraLevel: number;
  readonly munny: number;
  readonly itemCounts: Readonly<Record<number, number>>;
}

export interface Kh2PartyLevels {
  readonly sora: number;
  readonly donald: number;
  readonly goofy: number;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return view(bytes).getUint16(offset, true);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return view(bytes).getUint32(offset, true);
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  view(bytes).setUint16(offset, value, true);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  view(bytes).setUint32(offset, value, true);
}

function levelForExperience(experience: number, thresholds: readonly number[]): number {
  let level = 1;
  while (level < thresholds.length && experience >= thresholds[level]) level += 1;
  return level;
}

export function kh2PartyLevelsAtSoraLevel(soraLevel: number): Kh2PartyLevels {
  assertIntegerInRange("Sora level", soraLevel, 1, 99);
  const experience = SORA_EXPERIENCE[soraLevel - 1];
  return {
    sora: soraLevel,
    donald: levelForExperience(experience, DONALD_EXPERIENCE),
    goofy: levelForExperience(experience, GOOFY_EXPERIENCE),
  };
}

function abilityOffset(characterIndex: number, slot: number): number {
  return CHARACTER_OFFSET + characterIndex * CHARACTER_STRIDE + ABILITIES_OFFSET + slot * 2;
}

function soraAbilityIds(bytes: Uint8Array): number[] {
  return Array.from({ length: ABILITY_COUNT }, (_, slot) => readUint16(bytes, abilityOffset(0, slot)))
    .filter((ability) => ability !== 0)
    .map((ability) => ability & 0x7fff);
}

function rewardsThroughLevel(route: Kh2DreamWeapon, level: number): number[] {
  return Object.entries(SORA_LEVEL_ABILITIES[route])
    .filter(([rewardLevel]) => Number(rewardLevel) <= level)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, ability]) => ability);
}

export function inferKh2DreamWeapon(
  bytes: Uint8Array,
  level: number,
): Kh2DreamWeapon | undefined {
  const abilities = new Set(soraAbilityIds(bytes));
  const routes = (Object.keys(SORA_LEVEL_ABILITIES) as Kh2DreamWeapon[]).filter((route) =>
    rewardsThroughLevel(route, level).every((ability) => abilities.has(ability)),
  );
  return routes.length === 1 ? routes[0] : undefined;
}

function synchronizeSoraAbilities(
  bytes: Uint8Array,
  route: Kh2DreamWeapon,
  oldLevel: number,
  targetLevel: number,
): void {
  const oldRewards = new Set(rewardsThroughLevel(route, oldLevel));
  const targetRewards = new Set(rewardsThroughLevel(route, targetLevel));

  for (const ability of oldRewards) {
    if (targetRewards.has(ability)) continue;
    for (let slot = 0; slot < ABILITY_COUNT; slot += 1) {
      const offset = abilityOffset(0, slot);
      if ((readUint16(bytes, offset) & 0x7fff) === ability) {
        writeUint16(bytes, offset, 0);
        break;
      }
    }
  }

  const present = new Set(soraAbilityIds(bytes));
  for (const ability of targetRewards) {
    if (present.has(ability)) continue;
    const emptySlot = Array.from({ length: ABILITY_COUNT }, (_, slot) => slot).find(
      (slot) => readUint16(bytes, abilityOffset(0, slot)) === 0,
    );
    if (emptySlot === undefined) {
      throw new Error("Sora's ability list is full, so level abilities cannot be synchronized.");
    }
    writeUint16(bytes, abilityOffset(0, emptySlot), ability);
    present.add(ability);
  }
}

function setLevel(bytes: Uint8Array, characterIndex: number, level: number): void {
  bytes[CHARACTER_OFFSET + characterIndex * CHARACTER_STRIDE + CHARACTER_LEVEL_OFFSET] = level;
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

let kh2ChecksumTable: Uint32Array | undefined;

function checksumTable(): Uint32Array {
  if (kh2ChecksumTable) return kh2ChecksumTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index << 24;
    for (let bit = 0; bit < 255; bit += 1) {
      value = ((value << 1) ^ (value < 0 ? 0x04c11db7 : 0)) | 0;
    }
    table[index] = value >>> 0;
  }
  kh2ChecksumTable = table;
  return table;
}

export function calculateKh2Checksum(bytes: Uint8Array): number {
  if (bytes.byteLength < 0x0c) throw new Error("The KH2 save record is truncated.");
  const table = checksumTable();
  let checksum = 0xffffffff;
  const consume = (byte: number): void => {
    checksum = (table[((checksum >>> 24) ^ byte) & 0xff] ^ (checksum << 8)) >>> 0;
  };
  for (let offset = 0; offset < 0x08; offset += 1) consume(bytes[offset]);
  for (let offset = 0x0c; offset < bytes.byteLength; offset += 1) consume(bytes[offset]);
  return (checksum ^ 0xffffffff) >>> 0;
}

export function inspectKh2Slot(
  data: Uint8Array,
  archiveIndex = 0,
): Kh2SlotSummary | undefined {
  if (data.byteLength < MINIMUM_SLOT_LENGTH || !KH2_MAGIC_CODES.has(readUint32(data, 0))) {
    return undefined;
  }

  const experience = readUint32(data, EXPERIENCE_OFFSET);
  const soraLevel = data[CHARACTER_OFFSET + CHARACTER_LEVEL_OFFSET];
  const donaldLevel = data[CHARACTER_OFFSET + CHARACTER_STRIDE + CHARACTER_LEVEL_OFFSET];
  const goofyLevel = data[CHARACTER_OFFSET + CHARACTER_STRIDE * 2 + CHARACTER_LEVEL_OFFSET];
  const farmableItems = KH2_FARMABLE_ITEMS.flatMap<Kh2FarmableItem>((item) => {
    const count = data[INVENTORY_OFFSET + item.id];
    return count > 0 ? [{ ...item, count }] : [];
  });

  return {
    archiveIndex,
    soraLevel,
    donaldLevel,
    goofyLevel,
    experience,
    dreamWeapon: inferKh2DreamWeapon(data, soraLevel),
    needsLevelSync:
      soraLevel !== levelForExperience(experience, SORA_EXPERIENCE) ||
      donaldLevel !== levelForExperience(experience, DONALD_EXPERIENCE) ||
      goofyLevel !== levelForExperience(experience, GOOFY_EXPERIENCE),
    munny: readUint32(data, MUNNY_OFFSET),
    farmableItems,
  };
}

export function applyKh2SlotEdits(data: Uint8Array, edits: Kh2SlotEdits): Uint8Array {
  const summary = inspectKh2Slot(data, edits.archiveIndex);
  if (!summary) {
    throw new Error(`Archive entry ${edits.archiveIndex + 1} is not a playable KH2 save slot.`);
  }
  assertIntegerInRange("Sora level", edits.soraLevel, 1, 99);
  assertIntegerInRange("Munny", edits.munny, 0, 99_999);

  const edited = data.slice();
  if (edits.soraLevel !== summary.soraLevel) {
    const route = summary.dreamWeapon;
    if (!route) {
      throw new Error(
        "Sora's Dream Weapon route could not be identified safely from this save, so the level was not changed.",
      );
    }
    synchronizeSoraAbilities(edited, route, summary.soraLevel, edits.soraLevel);
    const experience = SORA_EXPERIENCE[edits.soraLevel - 1];
    writeUint32(edited, EXPERIENCE_OFFSET, experience);
    setLevel(edited, 0, edits.soraLevel);
    setLevel(edited, 1, levelForExperience(experience, DONALD_EXPERIENCE));
    setLevel(edited, 2, levelForExperience(experience, GOOFY_EXPERIENCE));
  } else if (summary.needsLevelSync) {
    setLevel(edited, 0, levelForExperience(summary.experience, SORA_EXPERIENCE));
    setLevel(edited, 1, levelForExperience(summary.experience, DONALD_EXPERIENCE));
    setLevel(edited, 2, levelForExperience(summary.experience, GOOFY_EXPERIENCE));
  }

  writeUint32(edited, MUNNY_OFFSET, edits.munny);
  const editableItemIds = new Set(KH2_FARMABLE_ITEMS.map((item) => item.id));
  for (const [rawId, count] of Object.entries(edits.itemCounts)) {
    const id = Number(rawId);
    if (!editableItemIds.has(id)) {
      throw new Error(`Item ${rawId} is not on the safe KH2 editing list.`);
    }
    assertIntegerInRange(`Item ${id} quantity`, count, 0, 99);
    edited[INVENTORY_OFFSET + id] = count;
  }

  writeUint32(edited, 0x08, calculateKh2Checksum(edited));
  return edited;
}

export function editKh2Archive(
  archive: SaveArchiveDocument,
  edits: readonly Kh2SlotEdits[],
): MigrationResult {
  if (archive.format.id !== "kh2") throw new Error("This editor requires a KH2 Final Mix save.");
  if (edits.length === 0) throw new Error("Make at least one change before creating an edited save.");
  const editsByIndex = new Map(edits.map((slotEdits) => [slotEdits.archiveIndex, slotEdits]));
  if (editsByIndex.size !== edits.length) throw new Error("Each KH2 save slot can only be edited once.");

  const records = archive.records.map((record) => {
    const slotEdits = editsByIndex.get(record.archiveIndex);
    if (!slotEdits) return record;
    const data = applyKh2SlotEdits(record.data, slotEdits);
    const strideBytes = record.strideBytes.slice();
    strideBytes.set(data, 0);
    return { ...record, data, strideBytes };
  });

  return migrateSaveEntries(
    { ...archive, entries: records.filter((record) => !record.isEmpty), records },
    archive,
    [...editsByIndex.keys()],
  );
}

export function inspectKh2Archive(archive: SaveArchiveDocument): readonly Kh2SlotSummary[] {
  if (archive.format.id !== "kh2") return [];
  return archive.records.flatMap<Kh2SlotSummary>((record) => {
    const summary = inspectKh2Slot(record.data, record.archiveIndex);
    return summary ? [summary] : [];
  });
}
