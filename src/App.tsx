import {
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  compareSaveArchives,
  migrateSaveEntries,
  parseSaveArchive,
  variantDisplayName,
  type MigrationComparison,
  type MigrationResult,
  type SaveArchiveDocument,
} from "./core/archive";

interface LoadedSave {
  readonly file: File;
  readonly archive: SaveArchiveDocument;
}

interface ArchivePickerProps {
  readonly label: string;
  readonly description: string;
  readonly loaded?: LoadedSave;
  readonly onChoose: (file: File) => void;
}

const STATUS_LABELS: Record<MigrationComparison["status"], string> = {
  new: "New entry",
  different: "Will replace",
  same: "Identical",
  "destination-only": "Keep destination",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(date?: Date): string {
  return date
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "—";
}

function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(
    new Blob([copy.buffer], { type: "application/octet-stream" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function createBackupName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : ".png";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  return `${base}.backup-${stamp}${extension}`;
}

function ArchivePicker({ label, description, loaded, onChoose }: ArchivePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function selectFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    if (file) onChoose(file);
    event.currentTarget.value = "";
  }

  function dropFile(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onChoose(file);
  }

  return (
    <section className={`picker-card${loaded ? " has-file" : ""}`}>
      <div className="picker-heading">
        <span className="picker-number" aria-hidden="true">
          {label.startsWith("Source") ? "01" : "02"}
        </span>
        <div>
          <h2>{label}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div
        className={`drop-zone${dragging ? " is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={dropFile}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".png,image/png"
          onChange={selectFile}
        />
        {loaded ? (
          <div className="loaded-file">
            <strong>{loaded.file.name}</strong>
            <span>{loaded.archive.format.displayName}</span>
            <span>
              {variantDisplayName(loaded.archive.variant)} · {loaded.archive.entries.length} entries ·{" "}
              {formatBytes(loaded.file.size)}
            </span>
          </div>
        ) : (
          <div className="empty-file">
            <strong>Drop a save here</strong>
            <span>or choose a PC save archive</span>
          </div>
        )}
        <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>
          {loaded ? "Replace" : "Choose file"}
        </button>
      </div>
    </section>
  );
}

export function App() {
  const [source, setSource] = useState<LoadedSave>();
  const [destination, setDestination] = useState<LoadedSave>();
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<MigrationResult>();

  async function loadFile(role: "source" | "destination", file: File): Promise<void> {
    setError(undefined);
    setResult(undefined);

    try {
      const archive = parseSaveArchive(await file.arrayBuffer(), file.name);
      const loaded = { file, archive };

      if (role === "source") {
        setSource(loaded);
        setSelectedIndices(new Set(archive.entries.map((entry) => entry.archiveIndex)));
      } else {
        setDestination(loaded);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The save could not be opened.");
    }
  }

  const formatsMatch =
    source && destination && source.archive.format.id === destination.archive.format.id;
  const compatibilityError =
    source && destination && !formatsMatch
      ? `Choose two files from the same game. These are ${source.archive.format.displayName} and ${destination.archive.format.displayName}.`
      : undefined;
  const comparisons = useMemo(
    () =>
      source && destination && formatsMatch
        ? compareSaveArchives(source.archive, destination.archive)
        : [],
    [source, destination, formatsMatch],
  );
  const selectableIndices = source?.archive.entries.map((entry) => entry.archiveIndex) ?? [];
  const allSelected =
    selectableIndices.length > 0 &&
    selectableIndices.every((index) => selectedIndices.has(index));

  function toggleEntry(index: number): void {
    setResult(undefined);
    setSelectedIndices((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll(): void {
    setResult(undefined);
    setSelectedIndices(allSelected ? new Set() : new Set(selectableIndices));
  }

  function buildMigration(): void {
    if (!source || !destination || !formatsMatch) return;
    setError(undefined);

    try {
      setResult(
        migrateSaveEntries(
          source.archive,
          destination.archive,
          [...selectedIndices].sort((left, right) => left - right),
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The converted save could not be built.");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">K</div>
        <div>
          <p className="eyebrow">KH Save Editor</p>
          <h1>Keyblade</h1>
        </div>
        <span className="mode-badge">Local processing</span>
      </header>

      <section className="intro">
        <p className="step-label">Save migration workspace</p>
        <h2>Move the saves. Keep the account shell.</h2>
        <p>
          The source provides the entries you want. The destination provides the account-bound
          header and should be a save created by the account you will play on.
        </p>
      </section>

      <div className="picker-grid">
        <ArchivePicker
          label="Source save"
          description="The progress you want to transfer or recover."
          loaded={source}
          onChoose={(file) => void loadFile("source", file)}
        />
        <ArchivePicker
          label="Destination save"
          description="A save created by the destination Steam or Epic account."
          loaded={destination}
          onChoose={(file) => void loadFile("destination", file)}
        />
      </div>

      {(error || compatibilityError) && (
        <section className="notice is-error" role="alert">
          <strong>Cannot continue</strong>
          <span>{error ?? compatibilityError}</span>
        </section>
      )}

      {source && destination && formatsMatch && (
        <section className="comparison" aria-labelledby="comparison-title">
          <div className="section-heading">
            <div>
              <p className="step-label">03 · Choose entries</p>
              <h2 id="comparison-title">{source.archive.format.displayName}</h2>
              <p>
                Selected source entries replace the same archive positions. Unselected destination
                entries remain byte-for-byte intact.
              </p>
            </div>
            <button type="button" className="text-button" onClick={toggleAll}>
              {allSelected ? "Clear selection" : "Select all source entries"}
            </button>
          </div>

          <div className="notice">
            <strong>System entries are included</strong>
            <span>Keep them selected when moving full saves or repairing a missing first slot.</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col" className="check-column">Move</th>
                  <th scope="col">Entry</th>
                  <th scope="col">Source</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Result</th>
                  <th scope="col">Modified</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((comparison) => {
                  const selectable = Boolean(comparison.source);
                  return (
                    <tr key={comparison.archiveIndex}>
                      <td className="check-column">
                        <input
                          type="checkbox"
                          checked={selectable && selectedIndices.has(comparison.archiveIndex)}
                          disabled={!selectable}
                          onChange={() => toggleEntry(comparison.archiveIndex)}
                          aria-label={`Transfer entry ${comparison.archiveIndex + 1}`}
                        />
                      </td>
                      <td>{String(comparison.archiveIndex + 1).padStart(2, "0")}</td>
                      <td>
                        <span className="archive-name">{comparison.source?.name ?? "—"}</span>
                        {comparison.source && (
                          <small>{formatBytes(comparison.source.dataLength)}</small>
                        )}
                      </td>
                      <td>
                        <span className="archive-name">{comparison.destination?.name ?? "Empty"}</span>
                        {comparison.destination && (
                          <small>{formatBytes(comparison.destination.dataLength)}</small>
                        )}
                      </td>
                      <td>
                        <span className={`entry-status is-${comparison.status}`}>
                          {STATUS_LABELS[comparison.status]}
                        </span>
                      </td>
                      <td>{formatDate(comparison.source?.modifiedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="build-row">
            <div>
              <strong>{selectedIndices.size} entries selected</strong>
              <span>
                Output keeps {variantDisplayName(destination.archive.variant)} account data from{" "}
                {destination.file.name}.
              </span>
            </div>
            <button
              type="button"
              className="primary-button"
              disabled={selectedIndices.size === 0}
              onClick={buildMigration}
            >
              Build and validate
            </button>
          </div>
        </section>
      )}

      {result && destination && (
        <section className="result-panel" aria-live="polite">
          <div className="result-copy">
            <p className="step-label">04 · Ready</p>
            <h2>Converted save passed validation.</h2>
            <p>
              {result.transferredEntries} entries transferred, {result.preservedEntries} destination
              entries preserved, and {result.validationChecks} structural checks passed.
            </p>
          </div>
          <div className="download-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => downloadBytes(result.bytes, destination.file.name)}
            >
              Download converted save
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                downloadBytes(
                  destination.archive.originalBytes,
                  createBackupName(destination.file.name),
                )
              }
            >
              Download untouched backup
            </button>
          </div>
          <p className="cloud-warning">
            Keep Steam Cloud disabled while testing the output. Your selected input files were never
            modified.
          </p>
        </section>
      )}

      <footer>
        <span>Nothing leaves your device.</span>
        <span>KH1 · Re:Chain · KH2 · Birth by Sleep</span>
      </footer>
    </main>
  );
}
