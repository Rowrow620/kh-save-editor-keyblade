import {
  migrateSaveEntries,
  type MigrationResult,
  type SaveArchiveDocument,
} from "./archive";

const KH1_FINAL_MIX_MAGIC = 0x05;
const MINIMUM_SLOT_LENGTH = 0x16420;
const CHARACTER_LENGTH = 0x74;
const SORA_CHARACTER_OFFSET = 0x04;
const DONALD_CHARACTER_OFFSET = SORA_CHARACTER_OFFSET + CHARACTER_LENGTH;
const GOOFY_CHARACTER_OFFSET = DONALD_CHARACTER_OFFSET + CHARACTER_LENGTH;
const CHARACTER_LEVEL_OFFSET = 0x00;
const CHARACTER_CURRENT_HP_OFFSET = 0x01;
const CHARACTER_MAX_HP_OFFSET = 0x02;
const CHARACTER_CURRENT_MP_OFFSET = 0x03;
const CHARACTER_MAX_MP_OFFSET = 0x04;
const CHARACTER_MAX_AP_OFFSET = 0x05;
const CHARACTER_STRENGTH_OFFSET = 0x06;
const CHARACTER_DEFENSE_OFFSET = 0x07;
const CHARACTER_ACCESSORY_SLOTS_OFFSET = 0x18;
const CHARACTER_ITEM_SLOTS_OFFSET = 0x21;
const CHARACTER_EXPERIENCE_OFFSET = 0x3c;
const CHARACTER_ABILITIES_OFFSET = 0x40;
const CHARACTER_ABILITY_COUNT = 0x30;
const SORA_LEVEL_OFFSET = 0x04;
const SORA_MAX_HP_OFFSET = 0x06;
const SORA_MAX_MP_OFFSET = 0x08;
const SORA_MAX_AP_OFFSET = 0x09;
const SORA_STRENGTH_OFFSET = 0x0a;
const SORA_DEFENSE_OFFSET = 0x0b;
const SORA_EXPERIENCE_OFFSET = 0x40;
const INVENTORY_OFFSET = 0x499;
const MUNNY_OFFSET = 0x1641c;

type Kh1ExperienceRoute = "dawn" | "midday" | "night";
type SoraDreamWeapon = "sword" | "shield" | "rod";

const KH1_FINAL_MIX_EXPERIENCE: Readonly<Record<Kh1ExperienceRoute, readonly number[]>> = {
  dawn: [
    0, 0, 12, 28, 51, 84, 130, 195, 286, 406, 526, 646, 826, 1_006, 1_186,
    1_436, 1_686, 1_936, 2_286, 2_636, 2_986, 3_486, 3_986, 4_486, 5_186,
    5_886, 6_586, 7_576, 8_566, 9_556, 10_856, 12_156, 13_456, 15_356, 17_256,
    19_156, 21_856, 24_556, 27_256, 31_056, 34_856, 38_656, 44_056, 49_456,
    54_856, 62_356, 69_856, 77_356, 87_956, 98_556, 109_156, 124_056, 138_956,
    153_856, 171_856, 189_856, 207_856, 225_856, 243_856, 261_856, 279_856,
    297_856, 315_856, 333_856, 351_856, 369_856, 387_856, 405_856, 423_856,
    441_856, 459_856, 477_856, 495_856, 513_856, 531_856, 549_856, 567_856,
    585_856, 603_856, 621_856, 639_856, 657_856, 675_856, 693_856, 711_856,
    729_856, 747_856, 765_856, 783_856, 801_856, 819_856, 837_856, 855_856,
    873_856, 891_856, 909_856, 927_856, 945_856, 963_856, 981_856, 999_856,
  ],
  midday: [
    0, 0, 18, 42, 75, 120, 182, 266, 376, 526, 676, 826, 1_036, 1_246, 1_456,
    1_746, 2_036, 2_326, 2_726, 3_126, 3_526, 4_066, 4_606, 5_146, 5_886,
    6_626, 7_366, 8_366, 9_366, 10_366, 11_666, 12_966, 14_266, 16_066, 17_866,
    19_666, 22_166, 24_666, 27_166, 30_666, 34_166, 37_666, 42_366, 47_066,
    51_766, 58_266, 64_766, 71_266, 80_166, 89_066, 97_966, 110_066, 122_166,
    134_266, 150_766, 167_266, 183_766, 201_766, 219_766, 237_766, 255_766,
    273_766, 291_766, 309_766, 327_766, 345_766, 363_766, 381_766, 399_766,
    417_766, 435_766, 453_766, 471_766, 489_766, 507_766, 525_766, 543_766,
    561_766, 579_766, 597_766, 615_766, 633_766, 651_766, 669_766, 687_766,
    705_766, 723_766, 741_766, 759_766, 777_766, 795_766, 813_766, 831_766,
    849_766, 867_766, 885_766, 903_766, 921_766, 939_766, 957_766, 975_766,
  ],
  night: [
    0, 0, 25, 58, 102, 160, 238, 338, 468, 648, 828, 1_008, 1_248, 1_488,
    1_728, 2_048, 2_368, 2_688, 3_118, 3_548, 3_978, 4_558, 5_138, 5_718,
    6_488, 7_258, 8_028, 9_028, 10_028, 11_028, 12_328, 13_628, 14_928,
    16_728, 18_528, 20_328, 22_728, 25_128, 27_528, 30_728, 33_928, 37_128,
    41_428, 45_728, 50_028, 55_728, 61_428, 67_128, 74_728, 82_328, 89_928,
    100_028, 110_128, 120_228, 133_728, 147_228, 160_728, 176_728, 192_728,
    208_728, 226_728, 244_728, 262_728, 280_728, 298_728, 316_728, 334_728,
    352_728, 370_728, 388_728, 406_728, 424_728, 442_728, 460_728, 478_728,
    496_728, 514_728, 532_728, 550_728, 568_728, 586_728, 604_728, 622_728,
    640_728, 658_728, 676_728, 694_728, 712_728, 730_728, 748_728, 766_728,
    784_728, 802_728, 820_728, 838_728, 856_728, 874_728, 892_728, 910_728,
    928_728, 946_728,
  ],
};

const SORA_LEVEL_REWARDS = [
  0, 0, 4, 5, 4, 5, 1, 4, 1, 5, 1, 3, 2, 4, 1, 5, 1, 3, 6, 4, 3, 5, 1,
  3, 2, 4, 1, 5, 1, 3, 6, 4, 3, 5, 1, 3, 2, 4, 1, 5, 1, 3, 6, 4, 3, 5,
  1, 3, 2, 4, 1, 5, 1, 3, 1, 4, 3, 5, 1, 3, 2, 4, 1, 5, 1, 3, 1, 4, 3,
  5, 1, 3, 1, 4, 1, 5, 1, 3, 4, 5, 3, 4, 5, 3, 4, 5, 3, 4, 5, 3, 4, 5,
  3, 4, 5, 3, 4, 5, 3, 4, 5,
] as const;

const DONALD_LEVEL_REWARDS = [
  0, 0, 1, 4, 5, 4, 5, 4, 1, 5, 1, 3, 1, 4, 5, 6, 3, 4, 1, 5, 2, 3, 4,
  1, 5, 6, 3, 1, 4, 5, 2, 3, 1, 4, 5, 6, 3, 4, 1, 5, 2, 3, 1, 4, 5, 6,
  3, 4, 1, 5, 2, 3, 1, 4, 5, 1, 3, 4, 1, 5, 2, 3, 4, 5, 3, 4, 5, 4, 5,
  4, 2, 5, 4, 5, 4, 5, 4, 5, 4, 5, 2, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4,
  5, 4, 5, 4, 5, 4, 5, 4, 5,
] as const;

const GOOFY_LEVEL_REWARDS = [
  0, 0, 5, 4, 5, 1, 5, 1, 5, 1, 4, 6, 3, 1, 5, 2, 4, 1, 3, 6, 5, 1, 4,
  1, 3, 6, 5, 1, 4, 2, 3, 1, 5, 6, 4, 1, 3, 1, 5, 4, 3, 1, 5, 2, 4, 1,
  3, 5, 4, 1, 3, 1, 5, 4, 3, 1, 5, 2, 4, 1, 3, 5, 4, 1, 3, 5, 4, 1, 3,
  5, 4, 3, 5, 4, 3, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5,
  4, 5, 4, 5, 4, 5, 4, 5, 4,
] as const;

type LevelRewardTable = Readonly<Record<number, number>>;

const SORA_ABILITY_REWARDS: Readonly<Record<SoraDreamWeapon, LevelRewardTable>> = {
  sword: {
    6: 0xb6, 9: 0x8a, 12: 0xb5, 15: 0x93, 18: 0xbc, 21: 0x86, 24: 0x95,
    27: 0xb7, 30: 0x02, 33: 0x94, 36: 0x85, 39: 0xb8, 42: 0x07, 45: 0x97,
    48: 0x99, 50: 0xc1, 51: 0xb9, 54: 0x06, 57: 0x91, 60: 0x92, 63: 0x98,
    66: 0x86, 69: 0xbe, 72: 0x87, 75: 0x85, 78: 0x9a, 81: 0xbc, 84: 0x88,
    87: 0x98, 90: 0x9c, 93: 0x86, 96: 0x87, 99: 0x88, 100: 0x9b,
  },
  shield: {
    3: 0x06, 6: 0xb5, 9: 0x9a, 12: 0xbc, 15: 0x95, 18: 0xb9, 21: 0x8a,
    24: 0x9c, 27: 0xbe, 30: 0x85, 33: 0x07, 36: 0x99, 39: 0xb6, 42: 0x9b,
    45: 0x93, 48: 0x88, 51: 0xb7, 54: 0x06, 55: 0xc1, 57: 0x85, 60: 0x94,
    63: 0x86, 66: 0x02, 69: 0xb8, 72: 0x97, 75: 0x88, 78: 0x91, 81: 0xbc,
    84: 0x92, 87: 0x86, 90: 0x98, 93: 0x87, 96: 0x86, 99: 0x87, 100: 0x98,
  },
  rod: {
    6: 0xb9, 9: 0x85, 12: 0xb8, 15: 0x8a, 18: 0xb7, 21: 0x97, 24: 0x87,
    27: 0xbc, 30: 0x02, 33: 0x95, 36: 0x92, 39: 0xbe, 42: 0x98, 45: 0x87,
    48: 0x9c, 51: 0xb6, 54: 0x07, 55: 0xc1, 57: 0x93, 60: 0x9a, 63: 0x9b,
    66: 0x02, 69: 0xb5, 72: 0x85, 75: 0x98, 78: 0x94, 81: 0xbc, 84: 0x91,
    87: 0x86, 90: 0x99, 93: 0x86, 96: 0x88, 99: 0x86, 100: 0x88,
  },
};

const DONALD_ABILITY_REWARDS: LevelRewardTable = {
  10: 0x9a, 15: 0x97, 20: 0x98, 25: 0x85, 30: 0x89, 35: 0xbe,
  40: 0x85, 45: 0x9c, 50: 0x98, 55: 0x9b, 60: 0x99,
};

const GOOFY_ABILITY_REWARDS: LevelRewardTable = {
  9: 0x9e, 12: 0x9b, 15: 0x9d, 18: 0x85, 21: 0x9f, 24: 0x9c, 27: 0x07,
  30: 0xbf, 33: 0x89, 36: 0x99, 39: 0x98, 42: 0xa0, 45: 0x9a, 48: 0x97,
  51: 0x85, 54: 0x07, 57: 0x98,
};

const DONALD_EXPERIENCE_INCREMENTS = [
  0, 26, 35, 47, 63, 85, 110, 150, 200, 200, 200, 280, 280, 280, 370, 370,
  370, 500, 500, 500, 680, 680, 680, 920, 920, 920, 1_200, 1_200, 1_200,
  1_600, 1_600, 1_600, 2_200, 2_200, 2_200, 3_000, 3_000, 3_000, 4_000,
  4_000, 4_000, 5_400, 5_400, 5_400, 7_400, 7_400, 7_400, 9_900, 9_900,
  9_900, 13_400, 13_400, 13_400, 18_000, 18_000, 18_000, 18_000, 18_000,
  18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000,
  18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000,
  18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000,
  18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000, 18_000,
  18_000, 18_000, 18_000, 18_000, 18_000, 18_000,
] as const;

const GOOFY_EXPERIENCE_INCREMENTS = [
  0, 10, 14, 19, 27, 38, 54, 76, 100, 100, 100, 150, 150, 150, 210, 210, 210,
  290, 290, 290, 410, 410, 410, 580, 580, 580, 820, 820, 820, 1_100, 1_100,
  1_100, 1_600, 1_600, 1_600, 2_200, 2_200, 2_200, 3_200, 3_200, 3_200,
  4_500, 4_500, 4_500, 6_300, 6_300, 6_300, 8_800, 8_800, 8_800, 12_400,
  12_400, 12_400, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500,
  17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500,
  17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500,
  17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500,
  17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500, 17_500,
  17_500, 17_500, 17_500, 17_500,
] as const;

function cumulativeExperience(increments: readonly number[]): readonly number[] {
  const thresholds = Array<number>(101).fill(0);
  for (let level = 2; level <= 100; level += 1) {
    thresholds[level] = thresholds[level - 1] + increments[level - 1];
  }
  return thresholds;
}

const DONALD_EXPERIENCE = cumulativeExperience(DONALD_EXPERIENCE_INCREMENTS);
const GOOFY_EXPERIENCE = cumulativeExperience(GOOFY_EXPERIENCE_INCREMENTS);

const EXPERIENCE_ROUTES = Object.keys(KH1_FINAL_MIX_EXPERIENCE) as Kh1ExperienceRoute[];

interface CharacterStartingStats {
  readonly hp: number;
  readonly mp: number;
  readonly ap: number;
  readonly strength: number;
  readonly defense: number;
  readonly accessorySlots: number;
  readonly itemSlots: number;
  readonly weapon?: SoraDreamWeapon;
}

const SORA_STARTING_STATS: readonly CharacterStartingStats[] = [
  { weapon: "rod", hp: 18, mp: 3, ap: 3, strength: 4, defense: 1, accessorySlots: 2, itemSlots: 6 },
  { weapon: "rod", hp: 18, mp: 3, ap: 3, strength: 2, defense: 3, accessorySlots: 2, itemSlots: 6 },
  { weapon: "shield", hp: 18, mp: 2, ap: 1, strength: 4, defense: 4, accessorySlots: 2, itemSlots: 8 },
  { weapon: "shield", hp: 18, mp: 2, ap: 3, strength: 3, defense: 4, accessorySlots: 2, itemSlots: 8 },
  { weapon: "sword", hp: 18, mp: 2, ap: 1, strength: 5, defense: 2, accessorySlots: 2, itemSlots: 7 },
  { weapon: "sword", hp: 18, mp: 2, ap: 3, strength: 5, defense: 1, accessorySlots: 2, itemSlots: 7 },
];

const DONALD_STARTING_STATS: CharacterStartingStats = {
  hp: 12,
  mp: 3,
  ap: 1,
  strength: 1,
  defense: 1,
  accessorySlots: 2,
  itemSlots: 2,
};

const GOOFY_STARTING_STATS: CharacterStartingStats = {
  hp: 21,
  mp: 1,
  ap: 1,
  strength: 4,
  defense: 1,
  accessorySlots: 2,
  itemSlots: 4,
};

export type Kh1FarmableItemCategory = "Consumable" | "Synthesis material";

export interface Kh1FarmableItem {
  readonly id: number;
  readonly name: string;
  readonly category: Kh1FarmableItemCategory;
  readonly count: number;
}

export interface Kh1SlotSummary {
  readonly archiveIndex: number;
  readonly level: number;
  readonly donaldLevel: number;
  readonly goofyLevel: number;
  readonly needsProgressionSync: boolean;
  readonly munny: number;
  readonly farmableItems: readonly Kh1FarmableItem[];
}

export interface Kh1FarmableItemDefinition {
  readonly id: number;
  readonly name: string;
  readonly category: Kh1FarmableItemCategory;
}

export const KH1_FARMABLE_ITEMS: readonly Kh1FarmableItemDefinition[] = [
  { id: 0x01, name: "Potion", category: "Consumable" },
  { id: 0x02, name: "Hi-Potion", category: "Consumable" },
  { id: 0x03, name: "Ether", category: "Consumable" },
  { id: 0x04, name: "Elixir", category: "Consumable" },
  { id: 0x06, name: "Mega-Potion", category: "Consumable" },
  { id: 0x07, name: "Mega-Ether", category: "Consumable" },
  { id: 0x08, name: "Megalixir", category: "Consumable" },
  { id: 0x09, name: "Fury Stone", category: "Synthesis material" },
  { id: 0x0a, name: "Power Stone", category: "Synthesis material" },
  { id: 0x0b, name: "Energy Stone", category: "Synthesis material" },
  { id: 0x0c, name: "Blazing Stone", category: "Synthesis material" },
  { id: 0x0d, name: "Frost Stone", category: "Synthesis material" },
  { id: 0x0e, name: "Lightning Stone", category: "Synthesis material" },
  { id: 0x0f, name: "Dazzling Stone", category: "Synthesis material" },
  { id: 0x10, name: "Stormy Stone", category: "Synthesis material" },
  { id: 0x9b, name: "Serenity Power", category: "Synthesis material" },
  { id: 0x9c, name: "Dark Matter", category: "Synthesis material" },
  { id: 0x9d, name: "Mythril Stone", category: "Synthesis material" },
  { id: 0xe7, name: "Pretty Stone", category: "Synthesis material" },
  { id: 0xe9, name: "Lucid Shard", category: "Synthesis material" },
  { id: 0xea, name: "Lucid Gem", category: "Synthesis material" },
  { id: 0xeb, name: "Lucid Crystal", category: "Synthesis material" },
  { id: 0xec, name: "Spirit Shard", category: "Synthesis material" },
  { id: 0xed, name: "Spirit Gem", category: "Synthesis material" },
  { id: 0xee, name: "Power Shard", category: "Synthesis material" },
  { id: 0xef, name: "Power Gem", category: "Synthesis material" },
  { id: 0xf0, name: "Power Crystal", category: "Synthesis material" },
  { id: 0xf1, name: "Blaze Shard", category: "Synthesis material" },
  { id: 0xf2, name: "Blaze Gem", category: "Synthesis material" },
  { id: 0xf3, name: "Frost Shard", category: "Synthesis material" },
  { id: 0xf4, name: "Frost Gem", category: "Synthesis material" },
  { id: 0xf5, name: "Thunder Shard", category: "Synthesis material" },
  { id: 0xf6, name: "Thunder Gem", category: "Synthesis material" },
  { id: 0xf7, name: "Shiny Crystal", category: "Synthesis material" },
  { id: 0xf8, name: "Bright Shard", category: "Synthesis material" },
  { id: 0xf9, name: "Bright Gem", category: "Synthesis material" },
  { id: 0xfa, name: "Bright Crystal", category: "Synthesis material" },
  { id: 0xfb, name: "Mystery Goo", category: "Synthesis material" },
  { id: 0xfc, name: "Gale", category: "Synthesis material" },
  { id: 0xfd, name: "Mythril Shard", category: "Synthesis material" },
  { id: 0xfe, name: "Mythril", category: "Synthesis material" },
  { id: 0xff, name: "Orichalcum", category: "Synthesis material" },
];

export interface Kh1SlotEdits {
  readonly archiveIndex: number;
  readonly level: number;
  readonly donaldLevel: number;
  readonly goofyLevel: number;
  readonly munny: number;
  readonly itemCounts: Readonly<Record<number, number>>;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

interface CharacterStatDelta {
  hp: number;
  mp: number;
  ap: number;
  strength: number;
  defense: number;
  accessorySlots: number;
  itemSlots: number;
}

function applyStatReward(delta: CharacterStatDelta, reward: number, direction: number): void {
  switch (reward) {
    case 1:
      delta.hp += 3 * direction;
      break;
    case 2:
      delta.mp += direction;
      break;
    case 3:
      delta.ap += 2 * direction;
      break;
    case 4:
      delta.strength += 2 * direction;
      break;
    case 5:
      delta.defense += 2 * direction;
      break;
    case 6:
      delta.itemSlots += direction;
      break;
    case 7:
      delta.accessorySlots += direction;
      break;
  }
}

function getCharacterStatDelta(
  levelRewards: readonly number[],
  secondaryRewards: LevelRewardTable,
  originalLevel: number,
  targetLevel: number,
): CharacterStatDelta {
  const delta: CharacterStatDelta = {
    hp: 0,
    mp: 0,
    ap: 0,
    strength: 0,
    defense: 0,
    accessorySlots: 0,
    itemSlots: 0,
  };
  const direction = targetLevel >= originalLevel ? 1 : -1;

  for (
    let level = Math.min(originalLevel, targetLevel) + 1;
    level <= Math.max(originalLevel, targetLevel);
    level += 1
  ) {
    applyStatReward(delta, levelRewards[level] ?? 0, direction);
    const secondary = secondaryRewards[level] ?? 0;
    if (secondary > 0 && secondary < 0x80) {
      applyStatReward(delta, secondary, direction);
    }
  }

  return delta;
}

interface SoraProgressionState {
  readonly level: number;
  readonly route: Kh1ExperienceRoute;
}

function matchesSoraNaturalStatFloor(bytes: Uint8Array, level: number): boolean {
  return SORA_STARTING_STATS.some(
    (starting) => {
      const fullGrowth = getCharacterStatDelta(
        SORA_LEVEL_REWARDS,
        SORA_ABILITY_REWARDS[starting.weapon!],
        1,
        level,
      );
      const genericGrowth = getCharacterStatDelta(SORA_LEVEL_REWARDS, {}, 1, level);
      const maxMp = bytes[SORA_MAX_MP_OFFSET];
      return (
        bytes[SORA_MAX_HP_OFFSET] === starting.hp + fullGrowth.hp &&
        (maxMp === starting.mp + fullGrowth.mp ||
          maxMp === starting.mp + genericGrowth.mp) &&
        bytes[SORA_MAX_AP_OFFSET] >= starting.ap + fullGrowth.ap &&
        bytes[SORA_STRENGTH_OFFSET] >= starting.strength + fullGrowth.strength &&
        bytes[SORA_DEFENSE_OFFSET] >= starting.defense + fullGrowth.defense
      );
    },
  );
}

function resolveSoraProgressionState(bytes: Uint8Array): SoraProgressionState | undefined {
  const experience = readUint32(bytes, SORA_EXPERIENCE_OFFSET);
  const candidates: SoraProgressionState[] = [];

  for (const route of EXPERIENCE_ROUTES) {
    const thresholds = KH1_FINAL_MIX_EXPERIENCE[route];
    for (let level = 1; level <= 100; level += 1) {
      const currentThreshold = thresholds[level];
      const nextThreshold = thresholds[level + 1];
      const experienceMatches =
        currentThreshold !== undefined &&
        experience >= currentThreshold &&
        (nextThreshold === undefined || experience < nextThreshold);
      if (experienceMatches && matchesSoraNaturalStatFloor(bytes, level)) {
        candidates.push({ level, route });
      }
    }
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

function experienceMatchesLevel(
  experience: number,
  thresholds: readonly number[],
  level: number,
): boolean {
  const currentThreshold = thresholds[level];
  const nextThreshold = thresholds[level + 1];
  return (
    currentThreshold !== undefined &&
    experience >= currentThreshold &&
    (nextThreshold === undefined || experience < nextThreshold)
  );
}

function matchesFixedCharacterStatFloor(
  bytes: Uint8Array,
  characterOffset: number,
  level: number,
  levelRewards: readonly number[],
  secondaryRewards: LevelRewardTable,
  starting: CharacterStartingStats,
): boolean {
  const growth = getCharacterStatDelta(levelRewards, secondaryRewards, 1, level);
  return (
    bytes[characterOffset + CHARACTER_MAX_HP_OFFSET] === starting.hp + growth.hp &&
    bytes[characterOffset + CHARACTER_MAX_MP_OFFSET] === starting.mp + growth.mp &&
    bytes[characterOffset + CHARACTER_MAX_AP_OFFSET] >= starting.ap + growth.ap &&
    bytes[characterOffset + CHARACTER_STRENGTH_OFFSET] >=
      starting.strength + growth.strength &&
    bytes[characterOffset + CHARACTER_DEFENSE_OFFSET] >= starting.defense + growth.defense
  );
}

function resolveFixedCharacterLevel(
  bytes: Uint8Array,
  characterOffset: number,
  thresholds: readonly number[],
  levelRewards: readonly number[],
  secondaryRewards: LevelRewardTable,
  starting: CharacterStartingStats,
): number | undefined {
  const experience = readUint32(bytes, characterOffset + CHARACTER_EXPERIENCE_OFFSET);
  const matches = Array.from({ length: 100 }, (_, index) => index + 1).filter(
    (level) =>
      experienceMatchesLevel(experience, thresholds, level) &&
      matchesFixedCharacterStatFloor(
        bytes,
        characterOffset,
        level,
        levelRewards,
        secondaryRewards,
        starting,
      ),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function characterAbilityIds(bytes: Uint8Array, characterOffset: number): number[] {
  return [...bytes.subarray(
    characterOffset + CHARACTER_ABILITIES_OFFSET,
    characterOffset + CHARACTER_ABILITIES_OFFSET + CHARACTER_ABILITY_COUNT,
  )]
    .filter((ability) => ability !== 0)
    .map((ability) => ability & 0x7f);
}

function abilitySequenceScore(
  actualAbilities: readonly number[],
  rewards: LevelRewardTable,
  maximumLevel: number,
): number {
  let actualIndex = 0;
  let score = 0;
  for (let level = 1; level <= maximumLevel; level += 1) {
    const reward = rewards[level] ?? 0;
    if (reward < 0x80) continue;
    const abilityId = reward & 0x7f;
    const matchIndex = actualAbilities.indexOf(abilityId, actualIndex);
    if (matchIndex === -1) break;
    actualIndex = matchIndex + 1;
    score += 1;
  }
  return score;
}

function resolveSoraDreamWeapon(
  bytes: Uint8Array,
  progressionLevel: number,
): SoraDreamWeapon | undefined {
  const abilities = characterAbilityIds(bytes, SORA_CHARACTER_OFFSET);
  const candidates = (["sword", "shield", "rod"] as const).map((weapon) => {
    const growth = getCharacterStatDelta(
      SORA_LEVEL_REWARDS,
      SORA_ABILITY_REWARDS[weapon],
      1,
      progressionLevel,
    );
    const genericGrowth = getCharacterStatDelta(SORA_LEVEL_REWARDS, {}, 1, progressionLevel);
    const penalties = SORA_STARTING_STATS.filter((starting) => starting.weapon === weapon)
      .filter((starting) => {
        const maxMp = bytes[SORA_MAX_MP_OFFSET];
        return (
          bytes[SORA_MAX_HP_OFFSET] === starting.hp + growth.hp &&
          (maxMp === starting.mp + growth.mp || maxMp === starting.mp + genericGrowth.mp) &&
          bytes[SORA_MAX_AP_OFFSET] >= starting.ap + growth.ap &&
          bytes[SORA_STRENGTH_OFFSET] >= starting.strength + growth.strength &&
          bytes[SORA_DEFENSE_OFFSET] >= starting.defense + growth.defense
        );
      })
      .map(
        (starting) =>
          bytes[SORA_MAX_AP_OFFSET] - (starting.ap + growth.ap) +
          bytes[SORA_STRENGTH_OFFSET] - (starting.strength + growth.strength) +
          bytes[SORA_DEFENSE_OFFSET] - (starting.defense + growth.defense),
      );
    return {
      weapon,
      abilityScore: abilitySequenceScore(
        abilities,
        SORA_ABILITY_REWARDS[weapon],
        progressionLevel,
      ),
      statPenalty: penalties.length > 0 ? Math.min(...penalties) : Number.POSITIVE_INFINITY,
    };
  });
  candidates.sort(
    (left, right) =>
      right.abilityScore - left.abilityScore || left.statPenalty - right.statPenalty,
  );
  const [best, runnerUp] = candidates;
  if (!Number.isFinite(best.statPenalty)) return undefined;
  if (
    runnerUp &&
    best.abilityScore === runnerUp.abilityScore &&
    best.statPenalty === runnerUp.statPenalty
  ) {
    return undefined;
  }
  return best.weapon;
}

function adjustSavedStat(
  bytes: Uint8Array,
  offset: number,
  delta: number,
  label: string,
): void {
  const value = bytes[offset] + delta;
  if (value < 0 || value > 0xff) {
    throw new Error(`${label} cannot be synchronized safely for this level change.`);
  }
  bytes[offset] = value;
}

function setNaturalMaximum(
  bytes: Uint8Array,
  characterOffset: number,
  maximumOffset: number,
  currentOffset: number,
  value: number,
  minimumCurrent: number,
): void {
  const absoluteMaximumOffset = characterOffset + maximumOffset;
  const difference = value - bytes[absoluteMaximumOffset];
  bytes[absoluteMaximumOffset] = value;
  const absoluteCurrentOffset = characterOffset + currentOffset;
  bytes[absoluteCurrentOffset] = Math.max(
    minimumCurrent,
    Math.min(0xff, bytes[absoluteCurrentOffset] + difference),
  );
}

function synchronizeAbilities(
  bytes: Uint8Array,
  characterOffset: number,
  rewards: LevelRewardTable,
  progressionLevel: number,
  targetLevel: number,
): void {
  const start = characterOffset + CHARACTER_ABILITIES_OFFSET;
  const abilities = [...bytes.subarray(start, start + CHARACTER_ABILITY_COUNT)].filter(
    (ability) => ability !== 0,
  );

  if (targetLevel < progressionLevel) {
    for (let level = progressionLevel; level > targetLevel; level -= 1) {
      const reward = rewards[level] ?? 0;
      if (reward < 0x80) continue;
      const abilityId = reward & 0x7f;
      let index = abilities.findIndex((ability) => ability === abilityId);
      if (index === -1) {
        index = abilities.findIndex((ability) => (ability & 0x7f) === abilityId);
      }
      if (index !== -1) abilities.splice(index, 1);
    }
  }

  const desiredCounts = new Map<number, number>();
  for (let level = 1; level <= targetLevel; level += 1) {
    const reward = rewards[level] ?? 0;
    if (reward >= 0x80) {
      const abilityId = reward & 0x7f;
      desiredCounts.set(abilityId, (desiredCounts.get(abilityId) ?? 0) + 1);
    }
  }
  const actualCounts = new Map<number, number>();
  abilities.forEach((ability) => {
    const abilityId = ability & 0x7f;
    actualCounts.set(abilityId, (actualCounts.get(abilityId) ?? 0) + 1);
  });
  desiredCounts.forEach((desiredCount, abilityId) => {
    const missing = desiredCount - (actualCounts.get(abilityId) ?? 0);
    for (let count = 0; count < missing; count += 1) abilities.push(abilityId);
  });

  if (abilities.length > CHARACTER_ABILITY_COUNT) {
    throw new Error("The synchronized ability list does not fit in this character's save data.");
  }
  bytes.fill(0, start, start + CHARACTER_ABILITY_COUNT);
  bytes.set(abilities, start);
}

function applyCharacterProgression(
  bytes: Uint8Array,
  characterOffset: number,
  levelRewards: readonly number[],
  secondaryRewards: LevelRewardTable,
  experienceThresholds: readonly number[],
  starting: CharacterStartingStats,
  progressionLevel: number,
  targetLevel: number,
): void {
  const delta = getCharacterStatDelta(
    levelRewards,
    secondaryRewards,
    progressionLevel,
    targetLevel,
  );
  const natural = getCharacterStatDelta(levelRewards, secondaryRewards, 1, targetLevel);
  setNaturalMaximum(
    bytes,
    characterOffset,
    CHARACTER_MAX_HP_OFFSET,
    CHARACTER_CURRENT_HP_OFFSET,
    starting.hp + natural.hp,
    1,
  );
  setNaturalMaximum(
    bytes,
    characterOffset,
    CHARACTER_MAX_MP_OFFSET,
    CHARACTER_CURRENT_MP_OFFSET,
    starting.mp + natural.mp,
    0,
  );
  adjustSavedStat(
    bytes,
    characterOffset + CHARACTER_MAX_AP_OFFSET,
    delta.ap,
    "Max AP",
  );
  adjustSavedStat(
    bytes,
    characterOffset + CHARACTER_STRENGTH_OFFSET,
    delta.strength,
    "Strength",
  );
  adjustSavedStat(
    bytes,
    characterOffset + CHARACTER_DEFENSE_OFFSET,
    delta.defense,
    "Defense",
  );
  bytes[characterOffset + CHARACTER_ACCESSORY_SLOTS_OFFSET] = Math.min(
    4,
    starting.accessorySlots + natural.accessorySlots,
  );
  bytes[characterOffset + CHARACTER_ITEM_SLOTS_OFFSET] = Math.min(
    8,
    starting.itemSlots + natural.itemSlots,
  );

  const savedLevel = bytes[characterOffset + CHARACTER_LEVEL_OFFSET];
  if (savedLevel !== targetLevel || progressionLevel !== targetLevel) {
    writeUint32(
      bytes,
      characterOffset + CHARACTER_EXPERIENCE_OFFSET,
      experienceThresholds[targetLevel],
    );
    bytes[characterOffset + CHARACTER_LEVEL_OFFSET] = targetLevel;
  }
  synchronizeAbilities(bytes, characterOffset, secondaryRewards, progressionLevel, targetLevel);
}

function synchronizeSoraLevel(bytes: Uint8Array, targetLevel: number): void {

  const progression = resolveSoraProgressionState(bytes);
  if (!progression) {
    throw new Error(
      "Sora's current EXP pace and stat baseline could not be identified safely. " +
        "Use a save from later in the game or an unedited backup before changing the level.",
    );
  }
  const dreamWeapon = resolveSoraDreamWeapon(bytes, progression.level);
  if (!dreamWeapon) {
    throw new Error("Sora's Dream Weapon could not be identified safely from this save.");
  }
  const starting = SORA_STARTING_STATS.find((candidate) => candidate.weapon === dreamWeapon)!;
  applyCharacterProgression(
    bytes,
    SORA_CHARACTER_OFFSET,
    SORA_LEVEL_REWARDS,
    SORA_ABILITY_REWARDS[dreamWeapon],
    KH1_FINAL_MIX_EXPERIENCE[progression.route],
    starting,
    progression.level,
    targetLevel,
  );
}

function synchronizeFixedCharacterLevel(
  bytes: Uint8Array,
  name: string,
  characterOffset: number,
  levelRewards: readonly number[],
  abilityRewards: LevelRewardTable,
  experienceThresholds: readonly number[],
  starting: CharacterStartingStats,
  targetLevel: number,
): void {
  const progressionLevel = resolveFixedCharacterLevel(
    bytes,
    characterOffset,
    experienceThresholds,
    levelRewards,
    abilityRewards,
    starting,
  );
  if (!progressionLevel) {
    throw new Error(`${name}'s current EXP and stat baseline could not be identified safely.`);
  }
  applyCharacterProgression(
    bytes,
    characterOffset,
    levelRewards,
    abilityRewards,
    experienceThresholds,
    starting,
    progressionLevel,
    targetLevel,
  );
}

function needsProgressionSynchronization(bytes: Uint8Array): boolean {
  const characterEnd = GOOFY_CHARACTER_OFFSET + CHARACTER_LENGTH;
  const originalCharacters = bytes.subarray(0, characterEnd);
  const synchronizedCharacters = originalCharacters.slice();

  try {
    synchronizeSoraLevel(
      synchronizedCharacters,
      bytes[SORA_CHARACTER_OFFSET + CHARACTER_LEVEL_OFFSET],
    );
    synchronizeFixedCharacterLevel(
      synchronizedCharacters,
      "Donald",
      DONALD_CHARACTER_OFFSET,
      DONALD_LEVEL_REWARDS,
      DONALD_ABILITY_REWARDS,
      DONALD_EXPERIENCE,
      DONALD_STARTING_STATS,
      bytes[DONALD_CHARACTER_OFFSET + CHARACTER_LEVEL_OFFSET],
    );
    synchronizeFixedCharacterLevel(
      synchronizedCharacters,
      "Goofy",
      GOOFY_CHARACTER_OFFSET,
      GOOFY_LEVEL_REWARDS,
      GOOFY_ABILITY_REWARDS,
      GOOFY_EXPERIENCE,
      GOOFY_STARTING_STATS,
      bytes[GOOFY_CHARACTER_OFFSET + CHARACTER_LEVEL_OFFSET],
    );
  } catch {
    return false;
  }

  return synchronizedCharacters.some((value, index) => value !== originalCharacters[index]);
}

export function inspectKh1Slot(
  data: Uint8Array,
  archiveIndex = 0,
): Kh1SlotSummary | undefined {
  if (data.byteLength < MINIMUM_SLOT_LENGTH) return undefined;
  if (readUint32(data, 0) !== KH1_FINAL_MIX_MAGIC) return undefined;

  const farmableItems = KH1_FARMABLE_ITEMS.flatMap<Kh1FarmableItem>((item) => {
    const count = data[INVENTORY_OFFSET + item.id];
    return count > 0 ? [{ ...item, count }] : [];
  });

  return {
    archiveIndex,
    level: data[SORA_LEVEL_OFFSET],
    donaldLevel: data[DONALD_CHARACTER_OFFSET + CHARACTER_LEVEL_OFFSET],
    goofyLevel: data[GOOFY_CHARACTER_OFFSET + CHARACTER_LEVEL_OFFSET],
    needsProgressionSync: needsProgressionSynchronization(data),
    munny: readUint32(data, MUNNY_OFFSET),
    farmableItems,
  };
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

export function applyKh1SlotEdits(data: Uint8Array, edits: Kh1SlotEdits): Uint8Array {
  if (!inspectKh1Slot(data, edits.archiveIndex)) {
    throw new Error(`Archive entry ${edits.archiveIndex + 1} is not a playable KH1 save slot.`);
  }

  assertIntegerInRange("Level", edits.level, 1, 100);
  assertIntegerInRange("Donald level", edits.donaldLevel, 1, 100);
  assertIntegerInRange("Goofy level", edits.goofyLevel, 1, 100);
  assertIntegerInRange("Munny", edits.munny, 0, 99_999);

  const editableItemIds = new Set(KH1_FARMABLE_ITEMS.map((item) => item.id));
  const edited = data.slice();
  synchronizeSoraLevel(edited, edits.level);
  synchronizeFixedCharacterLevel(
    edited,
    "Donald",
    DONALD_CHARACTER_OFFSET,
    DONALD_LEVEL_REWARDS,
    DONALD_ABILITY_REWARDS,
    DONALD_EXPERIENCE,
    DONALD_STARTING_STATS,
    edits.donaldLevel,
  );
  synchronizeFixedCharacterLevel(
    edited,
    "Goofy",
    GOOFY_CHARACTER_OFFSET,
    GOOFY_LEVEL_REWARDS,
    GOOFY_ABILITY_REWARDS,
    GOOFY_EXPERIENCE,
    GOOFY_STARTING_STATS,
    edits.goofyLevel,
  );
  writeUint32(edited, MUNNY_OFFSET, edits.munny);

  for (const [rawId, count] of Object.entries(edits.itemCounts)) {
    const id = Number(rawId);
    if (!editableItemIds.has(id)) {
      throw new Error(`Item ${rawId} is not on the safe KH1 editing list.`);
    }
    assertIntegerInRange(`Item ${id} quantity`, count, 0, 99);
    edited[INVENTORY_OFFSET + id] = count;
  }

  return edited;
}

export function editKh1Archive(
  archive: SaveArchiveDocument,
  edits: readonly Kh1SlotEdits[],
): MigrationResult {
  if (archive.format.id !== "kh1") {
    throw new Error("Safe field editing is currently available for KH1 Final Mix saves only.");
  }
  if (edits.length === 0) {
    throw new Error("Make at least one change before creating an edited save.");
  }

  const editsByIndex = new Map(edits.map((slotEdits) => [slotEdits.archiveIndex, slotEdits]));
  if (editsByIndex.size !== edits.length) {
    throw new Error("Each KH1 save slot can only be edited once.");
  }

  const stagedRecords = archive.records.map((record) => {
    const slotEdits = editsByIndex.get(record.archiveIndex);
    if (!slotEdits) return record;

    const data = applyKh1SlotEdits(record.data, slotEdits);
    const strideBytes = record.strideBytes.slice();
    strideBytes.set(data, 0);
    return { ...record, data, strideBytes };
  });
  const stagedArchive: SaveArchiveDocument = {
    ...archive,
    entries: stagedRecords.filter((record) => !record.isEmpty),
    records: stagedRecords,
  };

  return migrateSaveEntries(stagedArchive, archive, [...editsByIndex.keys()]);
}

export function inspectKh1Archive(archive: SaveArchiveDocument): readonly Kh1SlotSummary[] {
  if (archive.format.id !== "kh1") return [];

  return archive.records.flatMap<Kh1SlotSummary>((record) => {
    const summary = inspectKh1Slot(record.data, record.archiveIndex);
    return summary ? [summary] : [];
  });
}
