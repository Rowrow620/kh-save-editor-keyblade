import {
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import keybladeIcon from "./assets/keyblade-icon.png";
import {
  compareSaveArchives,
  migrateSaveEntries,
  variantDisplayName,
  type MigrationComparison,
  type SaveArchiveDocument,
} from "./core/archive";
import {
  editKh1Archive,
  KH1_FARMABLE_ITEMS,
  type Kh1SlotEdits,
  type Kh1SlotSummary,
} from "./core/kh1";
import {
  editKh2Archive,
  kh2PartyLevelsAtSoraLevel,
  KH2_FARMABLE_ITEMS,
  type Kh2SlotEdits,
  type Kh2SlotSummary,
} from "./core/kh2";
import {
  editRecomArchive,
  RECOM_FARMABLE_CARDS,
  type RecomSlotEdits,
  type RecomSlotSummary,
} from "./core/recom";

type AppMode = "edit" | "transfer";

interface LoadedSave {
  readonly file: File;
  readonly archive: SaveArchiveDocument;
  readonly kh1Slots: readonly Kh1SlotSummary[];
  readonly recomSlots: readonly RecomSlotSummary[];
  readonly kh2Slots: readonly Kh2SlotSummary[];
}

interface ArchivePickerProps {
  readonly label: string;
  readonly loaded?: LoadedSave;
  readonly error?: string;
  readonly processing: boolean;
  readonly onChoose: (file: File) => void;
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

interface ProcessedSave {
  readonly archive: SaveArchiveDocument;
  readonly kh1Slots: readonly Kh1SlotSummary[];
  readonly recomSlots: readonly RecomSlotSummary[];
  readonly kh2Slots: readonly Kh2SlotSummary[];
}

const TRANSFER_STATUS: Record<MigrationComparison["status"], string> = {
  new: "Add",
  different: "Replace",
  same: "Identical",
  "destination-only": "Keep destination",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const copy = bytes.slice();
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: "image/png" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function processSaveFile(file: File): Promise<ProcessedSave> {
  const worker = new Worker(new URL("./workers/archive.worker.ts", import.meta.url), {
    type: "module",
  });

  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ArchiveWorkerResponse>) => {
      worker.terminate();
      if (event.data.ok) {
        resolve({
          archive: event.data.archive,
          kh1Slots: event.data.kh1Slots,
          recomSlots: event.data.recomSlots,
          kh2Slots: event.data.kh2Slots,
        });
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("The save processor stopped unexpectedly."));
    };
    worker.postMessage({ file, fileName: file.name });
  });
}

function waitForLoadingPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function ArchivePicker({ label, loaded, error, processing, onChoose }: ArchivePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function selectFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    if (file) onChoose(file);
    event.currentTarget.value = "";
  }

  function dropFile(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragging(false);
    if (processing) return;
    const file = event.dataTransfer.files[0];
    if (file) onChoose(file);
  }

  function openPicker(event: KeyboardEvent<HTMLLabelElement>): void {
    if (processing) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <label
      className={`drop-zone${dragging ? " is-dragging" : ""}${loaded ? " has-file" : ""}${error ? " has-error" : ""}${processing ? " is-processing" : ""}`}
      htmlFor={inputId}
      aria-busy={processing}
      aria-disabled={processing}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={dropFile}
      onKeyDown={openPicker}
      tabIndex={0}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".png,image/png"
        disabled={processing}
        onChange={selectFile}
      />
      <span className="drop-label">{label}</span>
      {processing ? (
        <div className="processing-state" role="status" aria-live="polite">
          <span className="processing-spinner" aria-hidden="true" />
          <strong>Processing save data…</strong>
        </div>
      ) : error ? (
        <div className="file-state is-error" role="alert">
          <strong>That save could not be opened</strong>
          <span>{error}</span>
          <small>Drop another file to try again</small>
        </div>
      ) : loaded ? (
        <div className="file-state">
          <strong>{loaded.file.name}</strong>
          <span>{loaded.archive.format.displayName}</span>
          <small>
            {variantDisplayName(loaded.archive.variant)} · {loaded.archive.entries.length} entries ·{" "}
            {formatBytes(loaded.file.size)}
          </small>
        </div>
      ) : (
        <div className="file-state">
          <strong>Drop a save here</strong>
          <span>or click to choose a file</span>
        </div>
      )}
    </label>
  );
}

function Kh1Inspector({ label, loaded }: { readonly label: string; readonly loaded: LoadedSave }) {
  return (
    <section className="inspector-panel" aria-label={`${label} KH1 save details`}>
      <header className="inspector-heading">
        <div>
          <span>{label}</span>
          <h2>KH1 Final Mix</h2>
        </div>
        <span className="read-only-badge">Read only</span>
      </header>

      {loaded.kh1Slots.length === 0 ? (
        <p className="empty-inspection">No playable KH1 save slots were found.</p>
      ) : (
        <div className="slot-list">
          {loaded.kh1Slots.map((slot) => (
            <article className="slot-summary" key={slot.archiveIndex}>
              <div className="slot-heading">
                <span>Slot {slot.archiveIndex + 1}</span>
              </div>

              <dl className="stat-grid">
                <div>
                  <dt>Sora level</dt>
                  <dd>{slot.level}</dd>
                </div>
                <div>
                  <dt>Donald level</dt>
                  <dd>{slot.donaldLevel}</dd>
                </div>
                <div>
                  <dt>Goofy level</dt>
                  <dd>{slot.goofyLevel}</dd>
                </div>
                <div>
                  <dt>Munny</dt>
                  <dd>{slot.munny.toLocaleString()}</dd>
                </div>
              </dl>

              <div className="inventory-heading">
                <h3>Farmable inventory</h3>
                <span>{slot.farmableItems.length} item types</span>
              </div>

              {slot.farmableItems.length > 0 ? (
                <ul className="inventory-list">
                  {slot.farmableItems.map((item) => (
                    <li key={item.id}>
                      <span>{item.name}</span>
                      <strong>×{item.count}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-inventory">No whitelisted farmable items are currently held.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function makeKh1Draft(slot: Kh1SlotSummary): Kh1SlotEdits {
  const heldCounts = new Map(slot.farmableItems.map((item) => [item.id, item.count]));
  return {
    archiveIndex: slot.archiveIndex,
    level: slot.level,
    donaldLevel: slot.donaldLevel,
    goofyLevel: slot.goofyLevel,
    munny: slot.munny,
    itemCounts: Object.fromEntries(
      KH1_FARMABLE_ITEMS.map((item) => [item.id, heldCounts.get(item.id) ?? 0]),
    ),
  };
}

function Kh1Editor({ loaded }: { readonly loaded: LoadedSave }) {
  const [drafts, setDrafts] = useState<readonly Kh1SlotEdits[]>(() =>
    loaded.kh1Slots.map(makeKh1Draft),
  );
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const changedDrafts = useMemo(
    () =>
      drafts.filter((draft) => {
        const original = loaded.kh1Slots.find(
          (slot) => slot.archiveIndex === draft.archiveIndex,
        );
        if (
          !original ||
          original.needsProgressionSync ||
          draft.level !== original.level ||
          draft.donaldLevel !== original.donaldLevel ||
          draft.goofyLevel !== original.goofyLevel ||
          draft.munny !== original.munny
        ) {
          return true;
        }
        const heldCounts = new Map(original.farmableItems.map((item) => [item.id, item.count]));
        return KH1_FARMABLE_ITEMS.some(
          (item) => draft.itemCounts[item.id] !== (heldCounts.get(item.id) ?? 0),
        );
      }),
    [drafts, loaded.kh1Slots],
  );

  function updateDraft(
    archiveIndex: number,
    update: (draft: Kh1SlotEdits) => Kh1SlotEdits,
  ): void {
    setMessage(undefined);
    setError(undefined);
    setDrafts((current) =>
      current.map((draft) => (draft.archiveIndex === archiveIndex ? update(draft) : draft)),
    );
  }

  function createEditedSave(): void {
    try {
      const result = editKh1Archive(loaded.archive, changedDrafts);
      downloadBytes(result.bytes, loaded.file.name);
      setError(undefined);
      setMessage(`Downloaded ${loaded.file.name}. The uploaded original was not changed.`);
    } catch (cause) {
      setMessage(undefined);
      setError(cause instanceof Error ? cause.message : "The edited save could not be created.");
    }
  }

  return (
    <section className="inspector-panel editor-panel" aria-label="KH1 save editor">
      <header className="inspector-heading">
        <div>
          <span>Edit save</span>
          <h2>KH1 Final Mix</h2>
        </div>
      </header>

      {drafts.length === 0 ? (
        <p className="empty-inspection">No playable KH1 save slots were found.</p>
      ) : (
        <div className="slot-list">
          {drafts.map((draft) => (
            <article className="slot-summary" key={draft.archiveIndex}>
              <div className="slot-heading">
                <span>Slot {draft.archiveIndex + 1}</span>
              </div>

              <div className="editor-stat-grid">
                <label>
                  <span>Sora level</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={draft.level}
                    onChange={(event) => {
                      const level = event.currentTarget.valueAsNumber;
                      if (!Number.isNaN(level)) {
                        updateDraft(draft.archiveIndex, (current) => ({ ...current, level }));
                      }
                    }}
                  />
                </label>
                <label>
                  <span>Donald level</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={draft.donaldLevel}
                    onChange={(event) => {
                      const donaldLevel = event.currentTarget.valueAsNumber;
                      if (!Number.isNaN(donaldLevel)) {
                        updateDraft(draft.archiveIndex, (current) => ({
                          ...current,
                          donaldLevel,
                        }));
                      }
                    }}
                  />
                </label>
                <label>
                  <span>Goofy level</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={draft.goofyLevel}
                    onChange={(event) => {
                      const goofyLevel = event.currentTarget.valueAsNumber;
                      if (!Number.isNaN(goofyLevel)) {
                        updateDraft(draft.archiveIndex, (current) => ({
                          ...current,
                          goofyLevel,
                        }));
                      }
                    }}
                  />
                </label>
                <label>
                  <span>Munny</span>
                  <input
                    type="number"
                    min="0"
                    max="99999"
                    value={draft.munny}
                    onChange={(event) => {
                      const munny = event.currentTarget.valueAsNumber;
                      if (!Number.isNaN(munny)) {
                        updateDraft(draft.archiveIndex, (current) => ({ ...current, munny }));
                      }
                    }}
                  />
                </label>
              </div>
              <p className="level-sync-note">
                Level changes sync base stats, EXP, equipment slots, and level-earned abilities.
              </p>

              <div className="inventory-heading">
                <h3>Farmable inventory</h3>
                <span>0–99 each</span>
              </div>
              <div className="inventory-edit-grid">
                {KH1_FARMABLE_ITEMS.map((item) => (
                  <label key={item.id}>
                    <span>{item.name}</span>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      aria-label={`${item.name} quantity`}
                      value={draft.itemCounts[item.id]}
                      onChange={(event) => {
                        const count = event.currentTarget.valueAsNumber;
                        if (!Number.isNaN(count)) {
                          updateDraft(draft.archiveIndex, (current) => ({
                            ...current,
                            itemCounts: { ...current.itemCounts, [item.id]: count },
                          }));
                        }
                      }}
                    />
                  </label>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="action-row">
        <div aria-live="polite">
          {error && <span className="action-error">{error}</span>}
          {message && <span className="action-success">{message}</span>}
          {!error && !message && (
            <span>{changedDrafts.length} changed slot{changedDrafts.length === 1 ? "" : "s"}</span>
          )}
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={changedDrafts.length === 0}
          onClick={createEditedSave}
        >
          Create edited save
        </button>
      </div>
    </section>
  );
}

function recomInventoryIndices(): number[] {
  return RECOM_FARMABLE_CARDS.flatMap((card) =>
    Array.from({ length: 10 }, (_, value) => [
      card.normalBaseIndex + value,
      ...(card.premiumBaseIndex === undefined ? [] : [card.premiumBaseIndex + value]),
    ]).flat(),
  );
}

const RECOM_EDITABLE_INDICES = recomInventoryIndices();

function makeRecomDraft(slot: RecomSlotSummary): RecomSlotEdits {
  const heldCounts = new Map(slot.cards.map((card) => [card.inventoryIndex, card.count]));
  return {
    archiveIndex: slot.archiveIndex,
    mooglePoints: slot.mooglePoints,
    cardCounts: Object.fromEntries(
      RECOM_EDITABLE_INDICES.map((inventoryIndex) => [
        inventoryIndex,
        heldCounts.get(inventoryIndex) ?? 0,
      ]),
    ),
  };
}

function RecomCardQuantityEditor({
  draft,
  onChange,
}: {
  readonly draft: RecomSlotEdits;
  readonly onChange: (next: RecomSlotEdits) => void;
}) {
  const [selectedCardId, setSelectedCardId] = useState(RECOM_FARMABLE_CARDS[0].id);
  const [cardValue, setCardValue] = useState(1);
  const selectedCard =
    RECOM_FARMABLE_CARDS.find((card) => card.id === selectedCardId) ??
    RECOM_FARMABLE_CARDS[0];
  const normalIndex = selectedCard.normalBaseIndex + cardValue;
  const premiumIndex =
    selectedCard.premiumBaseIndex === undefined
      ? undefined
      : selectedCard.premiumBaseIndex + cardValue;
  const categories = [...new Set(RECOM_FARMABLE_CARDS.map((card) => card.category))];

  function setCardCount(inventoryIndex: number, count: number): void {
    if (Number.isNaN(count)) return;
    onChange({
      ...draft,
      cardCounts: { ...draft.cardCounts, [inventoryIndex]: count },
    });
  }

  return (
    <div className="card-editor">
      <div className="card-picker-grid">
        <label>
          <span>Card</span>
          <select value={selectedCard.id} onChange={(event) => setSelectedCardId(event.currentTarget.value)}>
            {categories.map((category) => (
              <optgroup key={category} label={category}>
                {RECOM_FARMABLE_CARDS.filter((card) => card.category === category).map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span>Card value</span>
          <select value={cardValue} onChange={(event) => setCardValue(Number(event.currentTarget.value))}>
            {Array.from({ length: 10 }, (_, value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="editor-stat-grid card-quantity-grid">
        <label>
          <span>Normal quantity</span>
          <input
            type="number"
            min="0"
            max="99"
            value={draft.cardCounts[normalIndex] ?? 0}
            onChange={(event) => setCardCount(normalIndex, event.currentTarget.valueAsNumber)}
          />
        </label>
        {premiumIndex !== undefined && (
          <label>
            <span>Premium quantity</span>
            <input
              type="number"
              min="0"
              max="99"
              value={draft.cardCounts[premiumIndex] ?? 0}
              onChange={(event) => setCardCount(premiumIndex, event.currentTarget.valueAsNumber)}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function RecomEditor({ loaded }: { readonly loaded: LoadedSave }) {
  const [drafts, setDrafts] = useState<readonly RecomSlotEdits[]>(() =>
    loaded.recomSlots.map(makeRecomDraft),
  );
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const changedDrafts = useMemo(
    () =>
      drafts.filter((draft) => {
        const original = loaded.recomSlots.find((slot) => slot.archiveIndex === draft.archiveIndex);
        if (!original || draft.mooglePoints !== original.mooglePoints) return true;
        const heldCounts = new Map(original.cards.map((card) => [card.inventoryIndex, card.count]));
        return RECOM_EDITABLE_INDICES.some(
          (inventoryIndex) =>
            draft.cardCounts[inventoryIndex] !== (heldCounts.get(inventoryIndex) ?? 0),
        );
      }),
    [drafts, loaded.recomSlots],
  );

  function updateDraft(archiveIndex: number, next: RecomSlotEdits): void {
    setMessage(undefined);
    setError(undefined);
    setDrafts((current) =>
      current.map((draft) => (draft.archiveIndex === archiveIndex ? next : draft)),
    );
  }

  function createEditedSave(): void {
    try {
      const result = editRecomArchive(loaded.archive, changedDrafts);
      downloadBytes(result.bytes, loaded.file.name);
      setError(undefined);
      setMessage(`Downloaded ${loaded.file.name}. The uploaded original was not changed.`);
    } catch (cause) {
      setMessage(undefined);
      setError(cause instanceof Error ? cause.message : "The edited save could not be created.");
    }
  }

  return (
    <section className="inspector-panel editor-panel" aria-label="Re:Chain save editor">
      <header className="inspector-heading">
        <div>
          <span>Edit save</span>
          <h2>Re:Chain of Memories</h2>
        </div>
      </header>

      {drafts.length === 0 ? (
        <p className="empty-inspection">No playable Re:Chain save slots were found.</p>
      ) : (
        <div className="slot-list">
          {drafts.map((draft) => {
            const original = loaded.recomSlots.find(
              (slot) => slot.archiveIndex === draft.archiveIndex,
            )!;
            return (
              <article className="slot-summary" key={draft.archiveIndex}>
                <div className="slot-heading">
                  <span>Slot {draft.archiveIndex + 1}</span>
                  <small>{original.story}'s story</small>
                </div>
                <div className="editor-stat-grid">
                  <label className="read-only-field">
                    <span>Level</span>
                    <output>{original.level}</output>
                  </label>
                  {original.story === "Sora" && (
                    <label>
                      <span>Moogle Points</span>
                      <input
                        type="number"
                        min="0"
                        max="99999"
                        value={draft.mooglePoints ?? 0}
                        onChange={(event) => {
                          const mooglePoints = event.currentTarget.valueAsNumber;
                          if (!Number.isNaN(mooglePoints)) {
                            updateDraft(draft.archiveIndex, { ...draft, mooglePoints });
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
                <p className="level-sync-note">
                  Level is read-only because each Re:Chain level grants a player-selected stat or
                  sleight reward.
                </p>
                <div className="inventory-heading">
                  <h3>Card inventory</h3>
                  <span>Enemy and story cards excluded</span>
                </div>
                <RecomCardQuantityEditor
                  draft={draft}
                  onChange={(next) => updateDraft(draft.archiveIndex, next)}
                />
              </article>
            );
          })}
        </div>
      )}

      <div className="action-row">
        <div aria-live="polite">
          {error && <span className="action-error">{error}</span>}
          {message && <span className="action-success">{message}</span>}
          {!error && !message && (
            <span>{changedDrafts.length} changed slot{changedDrafts.length === 1 ? "" : "s"}</span>
          )}
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={changedDrafts.length === 0}
          onClick={createEditedSave}
        >
          Create edited save
        </button>
      </div>
    </section>
  );
}

function makeKh2Draft(slot: Kh2SlotSummary): Kh2SlotEdits {
  const heldCounts = new Map(slot.farmableItems.map((item) => [item.id, item.count]));
  return {
    archiveIndex: slot.archiveIndex,
    soraLevel: slot.soraLevel,
    munny: slot.munny,
    itemCounts: Object.fromEntries(
      KH2_FARMABLE_ITEMS.map((item) => [item.id, heldCounts.get(item.id) ?? 0]),
    ),
  };
}

function Kh2Editor({ loaded }: { readonly loaded: LoadedSave }) {
  const [drafts, setDrafts] = useState<readonly Kh2SlotEdits[]>(() =>
    loaded.kh2Slots.map(makeKh2Draft),
  );
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const changedDrafts = useMemo(
    () =>
      drafts.filter((draft) => {
        const original = loaded.kh2Slots.find((slot) => slot.archiveIndex === draft.archiveIndex);
        if (
          !original ||
          original.needsLevelSync ||
          draft.soraLevel !== original.soraLevel ||
          draft.munny !== original.munny
        ) {
          return true;
        }
        const heldCounts = new Map(original.farmableItems.map((item) => [item.id, item.count]));
        return KH2_FARMABLE_ITEMS.some(
          (item) => draft.itemCounts[item.id] !== (heldCounts.get(item.id) ?? 0),
        );
      }),
    [drafts, loaded.kh2Slots],
  );

  function updateDraft(
    archiveIndex: number,
    update: (draft: Kh2SlotEdits) => Kh2SlotEdits,
  ): void {
    setMessage(undefined);
    setError(undefined);
    setDrafts((current) =>
      current.map((draft) => (draft.archiveIndex === archiveIndex ? update(draft) : draft)),
    );
  }

  function createEditedSave(): void {
    try {
      const result = editKh2Archive(loaded.archive, changedDrafts);
      downloadBytes(result.bytes, loaded.file.name);
      setError(undefined);
      setMessage(`Downloaded ${loaded.file.name}. The uploaded original was not changed.`);
    } catch (cause) {
      setMessage(undefined);
      setError(cause instanceof Error ? cause.message : "The edited save could not be created.");
    }
  }

  return (
    <section className="inspector-panel editor-panel" aria-label="KH2 save editor">
      <header className="inspector-heading">
        <div>
          <span>Edit save</span>
          <h2>Kingdom Hearts II Final Mix</h2>
        </div>
      </header>

      {drafts.length === 0 ? (
        <p className="empty-inspection">No playable KH2 save slots were found.</p>
      ) : (
        <div className="slot-list">
          {drafts.map((draft) => {
            const original = loaded.kh2Slots.find(
              (slot) => slot.archiveIndex === draft.archiveIndex,
            )!;
            const partyLevels =
              draft.soraLevel === original.soraLevel
                ? {
                    sora: original.soraLevel,
                    donald: original.donaldLevel,
                    goofy: original.goofyLevel,
                  }
                : kh2PartyLevelsAtSoraLevel(draft.soraLevel);
            return (
              <article className="slot-summary" key={draft.archiveIndex}>
                <div className="slot-heading">
                  <span>Slot {draft.archiveIndex + 1}</span>
                  {original.dreamWeapon && <small>{original.dreamWeapon} route</small>}
                </div>
                <div className="editor-stat-grid">
                  <label>
                    <span>Sora level</span>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={draft.soraLevel}
                      onChange={(event) => {
                        const soraLevel = event.currentTarget.valueAsNumber;
                        if (!Number.isNaN(soraLevel) && soraLevel >= 1 && soraLevel <= 99) {
                          updateDraft(draft.archiveIndex, (current) => ({
                            ...current,
                            soraLevel,
                          }));
                        }
                      }}
                    />
                  </label>
                  <label className="read-only-field">
                    <span>Donald level</span>
                    <output>{partyLevels.donald}</output>
                  </label>
                  <label className="read-only-field">
                    <span>Goofy level</span>
                    <output>{partyLevels.goofy}</output>
                  </label>
                  <label>
                    <span>Munny</span>
                    <input
                      type="number"
                      min="0"
                      max="99999"
                      value={draft.munny}
                      onChange={(event) => {
                        const munny = event.currentTarget.valueAsNumber;
                        if (!Number.isNaN(munny)) {
                          updateDraft(draft.archiveIndex, (current) => ({ ...current, munny }));
                        }
                      }}
                    />
                  </label>
                </div>
                <p className="level-sync-note">
                  Sora's level sets shared EXP, synchronizes Donald and Goofy, and updates Sora's
                  level-earned abilities. Boosts and story rewards are preserved.
                </p>
                <div className="inventory-heading">
                  <h3>Farmable inventory</h3>
                  <span>0–99 each</span>
                </div>
                <div className="inventory-edit-grid">
                  {KH2_FARMABLE_ITEMS.map((item) => (
                    <label key={item.id}>
                      <span>{item.name}</span>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        aria-label={`${item.name} quantity`}
                        value={draft.itemCounts[item.id]}
                        onChange={(event) => {
                          const count = event.currentTarget.valueAsNumber;
                          if (!Number.isNaN(count)) {
                            updateDraft(draft.archiveIndex, (current) => ({
                              ...current,
                              itemCounts: { ...current.itemCounts, [item.id]: count },
                            }));
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="action-row">
        <div aria-live="polite">
          {error && <span className="action-error">{error}</span>}
          {message && <span className="action-success">{message}</span>}
          {!error && !message && (
            <span>{changedDrafts.length} changed slot{changedDrafts.length === 1 ? "" : "s"}</span>
          )}
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={changedDrafts.length === 0}
          onClick={createEditedSave}
        >
          Create edited save
        </button>
      </div>
    </section>
  );
}

interface TransferBuilderProps {
  readonly source: LoadedSave;
  readonly destination: LoadedSave;
  readonly comparisons: readonly MigrationComparison[];
  readonly selectedIndices: ReadonlySet<number>;
  readonly onSelectionChange: (next: Set<number>) => void;
}

function TransferBuilder({
  source,
  destination,
  comparisons,
  selectedIndices,
  onSelectionChange,
}: TransferBuilderProps) {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const selectable = comparisons.filter((comparison) => comparison.source);
  const allSelected =
    selectable.length > 0 &&
    selectable.every((comparison) => selectedIndices.has(comparison.archiveIndex));

  function toggle(index: number): void {
    setMessage(undefined);
    setError(undefined);
    const next = new Set(selectedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onSelectionChange(next);
  }

  function toggleAll(): void {
    setMessage(undefined);
    setError(undefined);
    onSelectionChange(
      allSelected
        ? new Set()
        : new Set(selectable.map((comparison) => comparison.archiveIndex)),
    );
  }

  function createTransferredSave(): void {
    try {
      const result = migrateSaveEntries(
        source.archive,
        destination.archive,
        [...selectedIndices].sort((left, right) => left - right),
      );
      downloadBytes(result.bytes, destination.file.name);
      setError(undefined);
      setMessage(`Downloaded ${destination.file.name}. The destination upload was not changed.`);
    } catch (cause) {
      setMessage(undefined);
      setError(cause instanceof Error ? cause.message : "The transferred save could not be created.");
    }
  }

  return (
    <section className="inspector-panel transfer-panel" aria-label="Save transfer selection">
      <header className="inspector-heading">
        <div>
          <span>Transfer selection</span>
          <h2>{source.archive.format.displayName}</h2>
        </div>
        <button type="button" className="text-button" onClick={toggleAll}>
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </header>

      <p className="transfer-note">
        Selected source entries replace the same positions. Everything else in the destination
        remains unchanged.
      </p>

      <div className="transfer-list">
        {comparisons.map((comparison) => {
          const canSelect = Boolean(comparison.source);
          return (
            <label key={comparison.archiveIndex}>
              <input
                type="checkbox"
                checked={canSelect && selectedIndices.has(comparison.archiveIndex)}
                disabled={!canSelect}
                onChange={() => toggle(comparison.archiveIndex)}
              />
              <span>Entry {comparison.archiveIndex + 1}</span>
              <small>{TRANSFER_STATUS[comparison.status]}</small>
            </label>
          );
        })}
      </div>

      <div className="action-row">
        <div aria-live="polite">
          {error && <span className="action-error">{error}</span>}
          {message && <span className="action-success">{message}</span>}
          {!error && !message && <span>{selectedIndices.size} entries selected</span>}
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={selectedIndices.size === 0}
          onClick={createTransferredSave}
        >
          Create transferred save
        </button>
      </div>
    </section>
  );
}

export function App() {
  const [mode, setMode] = useState<AppMode>("edit");
  const [source, setSource] = useState<LoadedSave>();
  const [destination, setDestination] = useState<LoadedSave>();
  const [sourceError, setSourceError] = useState<string>();
  const [destinationError, setDestinationError] = useState<string>();
  const [sourceProcessing, setSourceProcessing] = useState(false);
  const [destinationProcessing, setDestinationProcessing] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  async function loadFile(role: "source" | "destination", file: File): Promise<void> {
    const setLoaded = role === "source" ? setSource : setDestination;
    const setError = role === "source" ? setSourceError : setDestinationError;
    const setProcessing = role === "source" ? setSourceProcessing : setDestinationProcessing;
    setLoaded(undefined);
    setError(undefined);
    setProcessing(true);

    try {
      await waitForLoadingPaint();
      const processedSave = await processSaveFile(file);
      setLoaded({ file, ...processedSave });
      if (role === "source") {
        setSelectedIndices(
          new Set(processedSave.archive.entries.map((entry) => entry.archiveIndex)),
        );
      }
    } catch (cause) {
      setLoaded(undefined);
      setError(cause instanceof Error ? cause.message : "The save could not be opened.");
    } finally {
      setProcessing(false);
    }
  }

  const formatsMatch =
    source && destination && source.archive.format.id === destination.archive.format.id;
  const comparisons = useMemo(
    () =>
      source && destination && formatsMatch
        ? compareSaveArchives(source.archive, destination.archive)
        : [],
    [source, destination, formatsMatch],
  );

  return (
    <main className="app-shell">
      <div className="workspace">
        <header className="brand-title">
          <div className="brand-copy">
            <h1>KEYBLADE</h1>
            <p>KH Save Editor</p>
          </div>
          <img className="brand-icon" src={keybladeIcon} alt="" aria-hidden="true" />
        </header>

        <div className="mode-switch" role="tablist" aria-label="Save operation">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "edit"}
            className={mode === "edit" ? "is-active" : ""}
            onClick={() => setMode("edit")}
          >
            Edit save
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "transfer"}
            className={mode === "transfer" ? "is-active" : ""}
            onClick={() => setMode("transfer")}
          >
            Transfer saves
          </button>
        </div>

        <div className={`picker-grid${mode === "edit" ? " is-single" : ""}`}>
          <ArchivePicker
            label={mode === "edit" ? "Save to edit" : "Source save"}
            loaded={source}
            error={sourceError}
            processing={sourceProcessing}
            onChoose={(file) => void loadFile("source", file)}
          />
          {mode === "transfer" && (
            <ArchivePicker
              label="Steam destination"
              loaded={destination}
              error={destinationError}
              processing={destinationProcessing}
              onChoose={(file) => void loadFile("destination", file)}
            />
          )}
        </div>

        {mode === "edit" && source?.archive.format.id === "kh1" && (
          <Kh1Editor
            key={`${source.file.name}-${source.file.size}-${source.file.lastModified}`}
            loaded={source}
          />
        )}

        {mode === "edit" && source?.archive.format.id === "recom" && (
          <RecomEditor
            key={`${source.file.name}-${source.file.size}-${source.file.lastModified}`}
            loaded={source}
          />
        )}

        {mode === "edit" && source?.archive.format.id === "kh2" && (
          <Kh2Editor
            key={`${source.file.name}-${source.file.size}-${source.file.lastModified}`}
            loaded={source}
          />
        )}

        {mode === "edit" && source?.archive.format.id === "bbs" && (
          <section className="inspector-panel unsupported-panel">
            <span>Editing support</span>
            <h2>{source.archive.format.displayName}</h2>
            <p>Editing is deferred until a real Birth by Sleep save is available for validation.</p>
          </section>
        )}

        {mode === "transfer" && source && destination && !formatsMatch && (
          <section className="compatibility-error" role="alert">
            <strong>These saves are from different games.</strong>
            <span>
              Choose a {source.archive.format.displayName} destination to match the source.
            </span>
          </section>
        )}

        {mode === "transfer" &&
          (source?.archive.format.id === "kh1" || destination?.archive.format.id === "kh1") && (
            <div className="inspector-grid">
              {source?.archive.format.id === "kh1" && (
                <Kh1Inspector label="Source save" loaded={source} />
              )}
              {destination?.archive.format.id === "kh1" && (
                <Kh1Inspector label="Steam destination" loaded={destination} />
              )}
            </div>
          )}

        {mode === "transfer" && source && destination && formatsMatch && (
          <TransferBuilder
            key={`${source.file.name}-${source.file.lastModified}-${destination.file.name}-${destination.file.lastModified}`}
            source={source}
            destination={destination}
            comparisons={comparisons}
            selectedIndices={selectedIndices}
            onSelectionChange={setSelectedIndices}
          />
        )}
      </div>
    </main>
  );
}
