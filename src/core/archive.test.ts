import { describe, expect, it } from "vitest";
import {
  compareSaveArchives,
  inferSaveVariant,
  migrateSaveEntries,
  parseSaveArchive,
} from "./archive";
import { SAVE_FORMATS, type SaveFormat } from "./formats";

const PNG_HEADER_LENGTH = 0x70;
const ENTRY_HEADER_LENGTH = 0x158;
const ENCRYPTED_HEADER_LENGTH = 0xf0;
const KEY_LENGTH = 0x10;
const KEY_OFFSET = ENCRYPTED_HEADER_LENGTH - KEY_LENGTH;

interface FixtureEntry {
  readonly index: number;
  readonly name: string;
  readonly data: Uint8Array;
  readonly created?: number;
  readonly modified?: number;
}

interface FixtureOptions {
  readonly keySeed?: number;
  readonly headerSeed?: number;
  readonly footerSeed?: number;
}

function createFixture(
  format: SaveFormat,
  entries: readonly FixtureEntry[],
  options: FixtureOptions = {},
): Uint8Array {
  const bytes = new Uint8Array(format.fileSize);
  const tableLength = format.entryCount * ENTRY_HEADER_LENGTH;
  const tableEnd = PNG_HEADER_LENGTH + tableLength;
  const dataRegionEnd = tableEnd + format.entryCount * format.stride;
  const table = bytes.subarray(PNG_HEADER_LENGTH, tableEnd);
  const tableView = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const encoder = new TextEncoder();

  bytes.fill(options.headerSeed ?? 0x11, 0, PNG_HEADER_LENGTH);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.fill(options.footerSeed ?? 0x22, dataRegionEnd);

  for (const entry of entries) {
    const offset = entry.index * ENTRY_HEADER_LENGTH;
    table.set(encoder.encode(entry.name).subarray(0, 0x3f), offset);
    tableView.setInt32(offset + 0x40, entry.created ?? 0, true);
    tableView.setInt32(offset + 0x48, entry.modified ?? 0, true);
    tableView.setInt32(offset + 0x50, entry.data.byteLength, true);
    bytes.set(entry.data, tableEnd + entry.index * format.stride);
  }

  const keySeed = options.keySeed ?? 1;
  const key = Uint8Array.from({ length: KEY_LENGTH }, (_, index) => keySeed + index);
  for (let index = 0; index < ENCRYPTED_HEADER_LENGTH; index += 1) {
    table[index] ^= key[index % KEY_LENGTH];
  }

  expect(table.slice(KEY_OFFSET, KEY_OFFSET + KEY_LENGTH)).toEqual(key);
  return bytes;
}

function data(length: number, seed: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index + seed) % 251);
}

describe("parseSaveArchive", () => {
  it("detects and lists encrypted KH1 archive entries without changing the input", () => {
    const format = SAVE_FORMATS.find((candidate) => candidate.id === "kh1")!;
    const fixture = createFixture(format, [
      {
        index: 0,
        name: "BISLPS-25198-01",
        data: data(93_184, 3),
        created: 1_700_000_000,
        modified: 1_700_000_100,
      },
      { index: 1, name: "-01/system.bin", data: data(1_024, 7) },
    ]);
    const before = fixture.slice();

    const archive = parseSaveArchive(fixture, "KHFM_WW.png");

    expect(archive.format.id).toBe("kh1");
    expect(archive.variant).toBe("steam-ww");
    expect(archive.entries).toHaveLength(2);
    expect(archive.entries[0]).toMatchObject({
      archiveIndex: 0,
      name: "BISLPS-25198-01",
      dataLength: 93_184,
      isSystemEntry: false,
    });
    expect(archive.entries[1].isSystemEntry).toBe(true);
    expect(fixture.every((value, index) => value === before[index])).toBe(true);
  });

  it.each([
    ["recom", "BISLPM-66676COM-01", 13_872],
    ["kh2", "BISLPM-66675FM-01", 69_568],
    ["bbs", "BISLPM-66677-01", 79_872],
  ] as const)("detects %s by its archive size", (formatId, name, length) => {
    const format = SAVE_FORMATS.find((candidate) => candidate.id === formatId)!;
    const fixture = createFixture(format, [
      { index: 0, name, data: data(length, 5) },
    ]);

    expect(parseSaveArchive(fixture).format.id).toBe(formatId);
  });

  it.each([
    ["KHFM_WW.png", "steam-ww"],
    ["KHFM.png", "egs-pc"],
    ["renamed.bin", "unknown-pc"],
    ["renamed.png", "unknown-pc"],
  ] as const)("classifies %s as %s", (fileName, variant) => {
    expect(inferSaveVariant(fileName)).toBe(variant);
  });

  it("rejects unsupported file sizes", () => {
    expect(() => parseSaveArchive(new Uint8Array(512))).toThrow("Unsupported save size");
  });

  it("rejects a same-sized file without the PNG save signature", () => {
    const format = SAVE_FORMATS.find((candidate) => candidate.id === "recom")!;
    expect(() => parseSaveArchive(new Uint8Array(format.fileSize))).toThrow(
      "not a PNG save archive",
    );
  });

  it("rejects an entry length larger than the format stride", () => {
    const format = SAVE_FORMATS.find((candidate) => candidate.id === "recom")!;
    const fixture = createFixture(format, []);
    const table = fixture.subarray(PNG_HEADER_LENGTH);
    const key = table.slice(KEY_OFFSET, KEY_OFFSET + KEY_LENGTH);

    for (let index = 0; index < ENCRYPTED_HEADER_LENGTH; index += 1) {
      table[index] ^= key[index % KEY_LENGTH];
    }
    new DataView(table.buffer, table.byteOffset).setInt32(
      ENTRY_HEADER_LENGTH + 0x50,
      format.stride + 1,
      true,
    );
    for (let index = 0; index < ENCRYPTED_HEADER_LENGTH; index += 1) {
      table[index] ^= key[index % KEY_LENGTH];
    }

    expect(() => parseSaveArchive(fixture)).toThrow("invalid length");
  });
});

describe("migrateSaveEntries", () => {
  const format = SAVE_FORMATS.find((candidate) => candidate.id === "kh1")!;

  it.each(SAVE_FORMATS)("rebuilds $displayName with the destination envelope", (candidate) => {
    const source = parseSaveArchive(
      createFixture(
        candidate,
        [{ index: 0, name: `${candidate.id}-source-01`, data: data(512, 12) }],
        { keySeed: 3, headerSeed: 0x23, footerSeed: 0x33 },
      ),
      candidate.fileNames.at(-1),
    );
    const destination = parseSaveArchive(
      createFixture(candidate, [], {
        keySeed: 93,
        headerSeed: 0x93,
        footerSeed: 0xa3,
      }),
      candidate.fileNames[0],
    );

    const result = migrateSaveEntries(source, destination, [0]);

    expect(result.archive.format.id).toBe(candidate.id);
    expect(result.archive.records[0].name).toBe(`${candidate.id}-source-01`);
    expect(result.archive.encryptionKey).toEqual(destination.encryptionKey);
    expect(result.archive.pngHeader).toEqual(destination.pngHeader);
    expect(result.archive.footer).toEqual(destination.footer);
  });

  it("transfers slot 1 while preserving the destination account envelope", () => {
    const sourceBytes = createFixture(
      format,
      [
        { index: 0, name: "BISLPS-25198-01", data: data(93_184, 8) },
        { index: 1, name: "-01/system.bin", data: data(1_024, 9) },
      ],
      { keySeed: 1, headerSeed: 0x19, footerSeed: 0x29 },
    );
    const destinationBytes = createFixture(
      format,
      [{ index: 4, name: "BISLPS-25198-03", data: data(93_184, 21) }],
      { keySeed: 81, headerSeed: 0x91, footerSeed: 0xa1 },
    );
    const source = parseSaveArchive(sourceBytes, "KHFM.png");
    const destination = parseSaveArchive(destinationBytes, "KHFM_WW.png");

    const result = migrateSaveEntries(source, destination, [0, 1]);

    expect(result.archive.entries.map((entry) => entry.archiveIndex)).toEqual([0, 1, 4]);
    expect(result.archive.records[0].name).toBe("BISLPS-25198-01");
    expect(result.archive.records[4].name).toBe("BISLPS-25198-03");
    expect(result.archive.encryptionKey).toEqual(destination.encryptionKey);
    expect(result.archive.pngHeader).toEqual(destination.pngHeader);
    expect(result.archive.footer).toEqual(destination.footer);
    expect(result.transferredEntries).toBe(2);
    expect(result.preservedEntries).toBe(1);
  });

  it("shows new, changed, identical, and destination-only entries", () => {
    const shared = data(128, 4);
    const source = parseSaveArchive(
      createFixture(format, [
        { index: 0, name: "slot-1", data: shared },
        { index: 1, name: "slot-2", data: data(128, 5) },
        { index: 2, name: "slot-3", data: data(128, 6) },
      ]),
    );
    const destination = parseSaveArchive(
      createFixture(format, [
        { index: 0, name: "slot-1", data: shared },
        { index: 1, name: "slot-2", data: data(128, 9) },
        { index: 4, name: "slot-5", data: data(128, 10) },
      ]),
    );

    expect(compareSaveArchives(source, destination).map((entry) => entry.status)).toEqual([
      "same",
      "different",
      "new",
      "destination-only",
    ]);
  });

  it("rejects cross-game migration", () => {
    const kh1 = parseSaveArchive(createFixture(format, []));
    const recomFormat = SAVE_FORMATS.find((candidate) => candidate.id === "recom")!;
    const recom = parseSaveArchive(createFixture(recomFormat, []));

    expect(() => migrateSaveEntries(kh1, recom, [0])).toThrow("different games");
  });

  it("does not alter either input archive", () => {
    const sourceBytes = createFixture(format, [
      { index: 0, name: "slot-1", data: data(256, 4) },
    ]);
    const destinationBytes = createFixture(
      format,
      [{ index: 0, name: "temporary", data: data(256, 8) }],
      { keySeed: 44 },
    );
    const sourceBefore = sourceBytes.slice();
    const destinationBefore = destinationBytes.slice();

    migrateSaveEntries(
      parseSaveArchive(sourceBytes),
      parseSaveArchive(destinationBytes),
      [0],
    );

    expect(sourceBytes.every((value, index) => value === sourceBefore[index])).toBe(true);
    expect(
      destinationBytes.every((value, index) => value === destinationBefore[index]),
    ).toBe(true);
  });
});
