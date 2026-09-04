import { parseSaveArchive, type SaveArchiveDocument } from "../core/archive";
import { inspectKh1Archive, type Kh1SlotSummary } from "../core/kh1";
import { inspectKh2Archive, type Kh2SlotSummary } from "../core/kh2";
import { inspectRecomArchive, type RecomSlotSummary } from "../core/recom";

interface ArchiveWorkerRequest {
  readonly file: File;
  readonly fileName: string;
}

type ArchiveWorkerResponse =
  | {
      readonly ok: true;
      readonly archive: SaveArchiveDocument;
      readonly kh1Slots: readonly Kh1SlotSummary[];
      readonly recomSlots: readonly RecomSlotSummary[];
      readonly kh2Slots: readonly Kh2SlotSummary[];
    }
  | { readonly ok: false; readonly error: string };

interface ArchiveWorkerGlobal {
  onmessage: ((event: MessageEvent<ArchiveWorkerRequest>) => void) | null;
  postMessage(message: ArchiveWorkerResponse, transfer: readonly Transferable[]): void;
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  if (!(bytes.buffer instanceof ArrayBuffer)) {
    throw new Error("The save uses an unsupported shared memory buffer.");
  }
  return bytes.buffer;
}

function collectTransferBuffers(archive: SaveArchiveDocument): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const add = (bytes: Uint8Array): void => {
    buffers.add(bufferOf(bytes));
  };

  add(archive.originalBytes);
  add(archive.pngHeader);
  add(archive.encryptionKey);
  add(archive.footer);
  archive.records.forEach((record) => {
    add(record.plainHeader);
    add(record.strideBytes);
    add(record.data);
  });

  return [...buffers];
}

const workerGlobal = self as unknown as ArchiveWorkerGlobal;

workerGlobal.onmessage = async (event) => {
  try {
    const buffer = await event.data.file.arrayBuffer();
    const archive = parseSaveArchive(buffer, event.data.fileName);
    const kh1Slots = inspectKh1Archive(archive);
    const recomSlots = inspectRecomArchive(archive);
    const kh2Slots = inspectKh2Archive(archive);
    const transfer = collectTransferBuffers(archive);

    workerGlobal.postMessage({ ok: true, archive, kh1Slots, recomSlots, kh2Slots }, transfer);
  } catch (cause) {
    workerGlobal.postMessage(
      {
        ok: false,
        error: cause instanceof Error ? cause.message : "The save could not be opened.",
      },
      [],
    );
  }
};
