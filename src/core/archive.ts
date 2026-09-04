import { detectSaveFormat, type SaveFormat } from "./formats";

const PNG_HEADER_LENGTH = 0x70;
const ENTRY_HEADER_LENGTH = 0x158;
const ENCRYPTED_HEADER_LENGTH = 0xf0;
const KEY_LENGTH = 0x10;
const KEY_OFFSET = ENCRYPTED_HEADER_LENGTH - KEY_LENGTH;
const NAME_LENGTH = 0x40;
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type SaveVariant = "steam-ww" | "egs-pc" | "unknown-pc";

export interface SaveEntry {
  readonly archiveIndex: number;
  readonly name: string;
  readonly dataLength: number;
  readonly createdAt?: Date;
  readonly modifiedAt?: Date;
  readonly isSystemEntry: boolean;
  readonly isEmpty: boolean;
}

export interface ArchiveEntryRecord extends SaveEntry {
  readonly plainHeader: Uint8Array;
  readonly strideBytes: Uint8Array;
  readonly data: Uint8Array;
}

export interface SaveArchiveDocument {
  readonly format: SaveFormat;
  readonly fileName: string;
  readonly variant: SaveVariant;
  readonly entries: readonly SaveEntry[];
  readonly totalEntries: number;
  readonly emptyEntries: number;
  readonly originalBytes: Uint8Array;
  readonly pngHeader: Uint8Array;
  readonly encryptionKey: Uint8Array;
  readonly footer: Uint8Array;
  readonly records: readonly ArchiveEntryRecord[];
}

export interface MigrationComparison {
  readonly archiveIndex: number;
  readonly source?: SaveEntry;
  readonly destination?: SaveEntry;
  readonly status: "new" | "different" | "same" | "destination-only";
}

export interface MigrationResult {
  readonly bytes: Uint8Array;
  readonly archive: SaveArchiveDocument;
  readonly transferredEntries: number;
  readonly preservedEntries: number;
  readonly validationChecks: number;
}

function readArchiveName(bytes: Uint8Array): string {
  const terminator = bytes.indexOf(0);
  const visibleBytes = terminator === -1 ? bytes : bytes.subarray(0, terminator);
  return new TextDecoder("utf-8", { fatal: false })
    .decode(visibleBytes)
    .replace(/[\u0000-\u001f\u007f]/g, "�")
    .trim();
}

function unixSecondsToDate(value: number): Date | undefined {
  if (value <= 0) {
    return undefined;
  }

  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isSystemEntry(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.includes("system") || normalized.endsWith("-sys");
}

function arraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function entryContentEqual(left: ArchiveEntryRecord, right: ArchiveEntryRecord): boolean {
  return arraysEqual(left.plainHeader, right.plainHeader) && arraysEqual(left.data, right.data);
}

export function inferSaveVariant(fileName: string): SaveVariant {
  const normalized = fileName.trim().toLowerCase();
  const knownNames = SAVE_FILE_NAMES_BY_VARIANT;

  if (knownNames.steam.has(normalized)) {
    return "steam-ww";
  }

  if (knownNames.egs.has(normalized)) {
    return "egs-pc";
  }

  return "unknown-pc";
}

const SAVE_FILE_NAMES_BY_VARIANT = {
  steam: new Set(
    ["KHFM_WW.png", "KHReCoM_WW.png", "KHIIFM_WW.png", "KHBbSFM_WW.png"].map(
      (name) => name.toLowerCase(),
    ),
  ),
  egs: new Set(
    ["KHFM.png", "KHReCoM.png", "KHIIFM.png", "KHBbSFM.png"].map((name) =>
      name.toLowerCase(),
    ),
  ),
};

export function variantDisplayName(variant: SaveVariant): string {
  switch (variant) {
    case "steam-ww":
      return "Steam · Worldwide";
    case "egs-pc":
      return "Epic / legacy PC";
    case "unknown-pc":
      return "PC · renamed file";
  }
}

export function parseSaveArchive(
  input: ArrayBuffer | Uint8Array,
  fileName = "unknown.png",
): SaveArchiveDocument {
  const inputBytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bytes = input instanceof Uint8Array ? inputBytes.slice() : inputBytes;
  const format = detectSaveFormat(bytes.byteLength);

  if (!arraysEqual(bytes.subarray(0, PNG_SIGNATURE.byteLength), PNG_SIGNATURE)) {
    throw new Error("The file has the expected size but is not a PNG save archive.");
  }

  const tableLength = format.entryCount * ENTRY_HEADER_LENGTH;
  const tableStart = PNG_HEADER_LENGTH;
  const tableEnd = tableStart + tableLength;
  const dataRegionEnd = tableEnd + format.entryCount * format.stride;

  if (dataRegionEnd > bytes.byteLength) {
    throw new Error("The save archive is truncated before its data region ends.");
  }

  const encryptedTable = bytes.slice(tableStart, tableEnd);
  const encryptionKey = encryptedTable.slice(KEY_OFFSET, KEY_OFFSET + KEY_LENGTH);
  const plainTable = encryptedTable.slice();

  for (let index = 0; index < ENCRYPTED_HEADER_LENGTH; index += 1) {
    plainTable[index] ^= encryptionKey[index % KEY_LENGTH];
  }

  const tableView = new DataView(
    plainTable.buffer,
    plainTable.byteOffset,
    plainTable.byteLength,
  );
  const records: ArchiveEntryRecord[] = [];

  for (let archiveIndex = 0; archiveIndex < format.entryCount; archiveIndex += 1) {
    const headerOffset = archiveIndex * ENTRY_HEADER_LENGTH;
    const plainHeader = plainTable.slice(headerOffset, headerOffset + ENTRY_HEADER_LENGTH);
    const name = readArchiveName(plainHeader.subarray(0, NAME_LENGTH));
    const createdSeconds = tableView.getInt32(headerOffset + 0x40, true);
    const modifiedSeconds = tableView.getInt32(headerOffset + 0x48, true);
    const dataLength = tableView.getInt32(headerOffset + 0x50, true);

    if (dataLength < 0 || dataLength > format.stride) {
      throw new Error(
        `Entry ${archiveIndex + 1} declares an invalid length of ${dataLength.toLocaleString()} bytes.`,
      );
    }

    const dataOffset = tableEnd + archiveIndex * format.stride;
    const strideBytes = bytes.subarray(dataOffset, dataOffset + format.stride);
    const data = strideBytes.subarray(0, dataLength);
    const isEmpty = name.length === 0 && dataLength === 0;

    records.push({
      archiveIndex,
      name: name || (dataLength > 0 ? "Unnamed entry" : ""),
      dataLength,
      createdAt: unixSecondsToDate(createdSeconds),
      modifiedAt: unixSecondsToDate(modifiedSeconds),
      isSystemEntry: isSystemEntry(name),
      isEmpty,
      plainHeader,
      strideBytes,
      data,
    });
  }

  const entries = records.filter((entry) => !entry.isEmpty);

  return {
    format,
    fileName,
    variant: inferSaveVariant(fileName),
    entries,
    totalEntries: format.entryCount,
    emptyEntries: format.entryCount - entries.length,
    originalBytes: bytes,
    pngHeader: bytes.slice(0, PNG_HEADER_LENGTH),
    encryptionKey,
    footer: bytes.slice(dataRegionEnd),
    records,
  };
}

export function compareSaveArchives(
  source: SaveArchiveDocument,
  destination: SaveArchiveDocument,
): readonly MigrationComparison[] {
  assertMatchingFormats(source, destination);
  const comparisons: MigrationComparison[] = [];

  for (let index = 0; index < source.format.entryCount; index += 1) {
    const sourceRecord = source.records[index];
    const destinationRecord = destination.records[index];

    if (sourceRecord.isEmpty && destinationRecord.isEmpty) {
      continue;
    }

    let status: MigrationComparison["status"];
    if (sourceRecord.isEmpty) {
      status = "destination-only";
    } else if (destinationRecord.isEmpty) {
      status = "new";
    } else if (entryContentEqual(sourceRecord, destinationRecord)) {
      status = "same";
    } else {
      status = "different";
    }

    comparisons.push({
      archiveIndex: index,
      source: sourceRecord.isEmpty ? undefined : sourceRecord,
      destination: destinationRecord.isEmpty ? undefined : destinationRecord,
      status,
    });
  }

  return comparisons;
}

function assertMatchingFormats(
  source: SaveArchiveDocument,
  destination: SaveArchiveDocument,
): void {
  if (source.format.id !== destination.format.id) {
    throw new Error(
      `These saves are from different games (${source.format.displayName} and ${destination.format.displayName}).`,
    );
  }
}

export function migrateSaveEntries(
  source: SaveArchiveDocument,
  destination: SaveArchiveDocument,
  selectedIndices: readonly number[],
): MigrationResult {
  assertMatchingFormats(source, destination);

  const selected = new Set(selectedIndices);
  if (selected.size === 0) {
    throw new Error("Select at least one source entry to transfer.");
  }

  for (const index of selected) {
    if (!Number.isInteger(index) || index < 0 || index >= source.format.entryCount) {
      throw new Error(`Entry index ${index} is outside this archive.`);
    }
    if (source.records[index].isEmpty) {
      throw new Error(`Source entry ${index + 1} is empty and cannot be transferred.`);
    }
  }

  const combinedRecords = destination.records.map((entry, index) =>
    selected.has(index) ? source.records[index] : entry,
  );
  const tableLength = source.format.entryCount * ENTRY_HEADER_LENGTH;
  const tableStart = PNG_HEADER_LENGTH;
  const tableEnd = tableStart + tableLength;
  const dataRegionEnd = tableEnd + source.format.entryCount * source.format.stride;
  const plainTable = new Uint8Array(tableLength);

  for (const record of combinedRecords) {
    plainTable.set(record.plainHeader, record.archiveIndex * ENTRY_HEADER_LENGTH);
  }

  // These bytes are padding in the decoded first header. Zeroing them ensures
  // the destination key is embedded exactly when the table is encrypted.
  plainTable.fill(0, KEY_OFFSET, KEY_OFFSET + KEY_LENGTH);

  const encryptedTable = plainTable.slice();
  for (let index = 0; index < ENCRYPTED_HEADER_LENGTH; index += 1) {
    encryptedTable[index] ^= destination.encryptionKey[index % KEY_LENGTH];
  }

  const output = destination.originalBytes.slice();
  output.set(destination.pngHeader, 0);
  output.set(encryptedTable, tableStart);

  for (const record of combinedRecords) {
    const dataOffset = tableEnd + record.archiveIndex * source.format.stride;
    output.set(record.strideBytes, dataOffset);
  }

  output.set(destination.footer, dataRegionEnd);
  const validated = parseSaveArchive(output, destination.fileName);
  let validationChecks = 3;

  if (!arraysEqual(validated.pngHeader, destination.pngHeader)) {
    throw new Error("Validation failed: the destination header was not preserved.");
  }
  if (!arraysEqual(validated.encryptionKey, destination.encryptionKey)) {
    throw new Error("Validation failed: the destination account key was not preserved.");
  }
  if (!arraysEqual(validated.footer, destination.footer)) {
    throw new Error("Validation failed: the destination footer was not preserved.");
  }

  combinedRecords.forEach((expected, index) => {
    const actual = validated.records[index];
    validationChecks += 2;
    if (!arraysEqual(actual.plainHeader, expected.plainHeader)) {
      throw new Error(`Validation failed: entry ${index + 1} metadata changed.`);
    }
    if (!arraysEqual(actual.strideBytes, expected.strideBytes)) {
      throw new Error(`Validation failed: entry ${index + 1} data changed.`);
    }
  });

  return {
    bytes: output,
    archive: validated,
    transferredEntries: selected.size,
    preservedEntries: combinedRecords.filter(
      (entry, index) => !selected.has(index) && !entry.isEmpty,
    ).length,
    validationChecks,
  };
}
