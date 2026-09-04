export interface SaveFormat {
  readonly id: "kh1" | "recom" | "kh2" | "bbs";
  readonly displayName: string;
  readonly fileNames: readonly string[];
  readonly fileSize: number;
  readonly entryCount: number;
  readonly stride: number;
}

export const SAVE_FORMATS: readonly SaveFormat[] = [
  {
    id: "kh1",
    displayName: "Kingdom Hearts Final Mix",
    fileNames: ["KHFM_WW.png", "KHFM.png"],
    fileSize: 0x11eb09d,
    entryCount: 200,
    stride: 0x16c40,
  },
  {
    id: "recom",
    displayName: "Kingdom Hearts Re:Chain of Memories",
    fileNames: ["KHReCoM_WW.png", "KHReCoM.png"],
    fileSize: 0x188f5f,
    entryCount: 100,
    stride: 0x3a30,
  },
  {
    id: "kh2",
    displayName: "Kingdom Hearts II Final Mix",
    fileNames: ["KHIIFM_WW.png", "KHIIFM.png"],
    fileSize: 0x6bed08,
    entryCount: 100,
    stride: 0x10fc0,
  },
  {
    id: "bbs",
    displayName: "Kingdom Hearts Birth by Sleep Final Mix",
    fileNames: ["KHBbSFM_WW.png", "KHBbSFM.png"],
    fileSize: 0x7d3b94,
    entryCount: 100,
    stride: 0x13c00,
  },
] as const;

export function detectSaveFormat(fileSize: number): SaveFormat {
  const format = SAVE_FORMATS.find((candidate) => candidate.fileSize === fileSize);

  if (!format) {
    throw new Error(
      `Unsupported save size (${fileSize.toLocaleString()} bytes). ` +
        "This preview currently supports KH1, Re:Chain, KH2, and Birth by Sleep PC saves.",
    );
  }

  return format;
}
