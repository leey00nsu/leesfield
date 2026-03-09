const AUDIO_MIME_TO_EXTENSION = {
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
} as const;

const EXTENSION_TO_AUDIO_MIME: Record<string, keyof typeof AUDIO_MIME_TO_EXTENSION> = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  wave: "audio/wav",
  weba: "audio/webm",
  webm: "audio/webm",
};

function canonicalizeAudioMime(contentType?: string | null) {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "audio/x-wav") return "audio/wav";
  if (normalized in AUDIO_MIME_TO_EXTENSION) {
    return normalized as keyof typeof AUDIO_MIME_TO_EXTENSION;
  }
  return null;
}

function resolveMimeFromPath(source?: string | null) {
  if (!source) return null;
  const normalized = source.trim();
  if (!normalized) return null;

  const [withoutHash] = normalized.split("#");
  const [withoutQuery] = withoutHash.split("?");
  const leaf = withoutQuery.split("/").pop() ?? withoutQuery;
  const fileLike = leaf.includes("=") ? leaf.split("=").pop() ?? leaf : leaf;
  const extension = fileLike.includes(".")
    ? fileLike.split(".").pop()?.toLowerCase()
    : undefined;

  if (!extension) return null;
  return EXTENSION_TO_AUDIO_MIME[extension] ?? null;
}

function resolveMimeFromBuffer(buffer?: Uint8Array | Buffer | null) {
  if (!buffer || buffer.length < 4) return null;

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    return "audio/wav";
  }

  if (buffer[0] === 0x66 && buffer[1] === 0x4c && buffer[2] === 0x61 && buffer[3] === 0x43) {
    return "audio/flac";
  }

  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return "audio/ogg";
  }

  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return "audio/mpeg";
  }

  if (buffer[0] === 0xff && buffer.length >= 2) {
    const secondByte = buffer[1];
    if (secondByte === 0xf1 || secondByte === 0xf9) {
      return "audio/aac";
    }
    if ((secondByte & 0xe0) === 0xe0) {
      return "audio/mpeg";
    }
  }

  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "audio/webm";
  }

  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return "audio/mp4";
  }

  return null;
}

export function resolveAudioMime({
  contentType,
  sourceUrl,
  fileName,
  buffer,
}: {
  contentType?: string | null;
  sourceUrl?: string | null;
  fileName?: string | null;
  buffer?: Uint8Array | Buffer | null;
}) {
  return (
    canonicalizeAudioMime(contentType) ??
    resolveMimeFromPath(fileName) ??
    resolveMimeFromPath(sourceUrl) ??
    resolveMimeFromBuffer(buffer) ??
    "application/octet-stream"
  );
}

export function resolveAudioExtension(contentType?: string | null) {
  const canonicalMime = canonicalizeAudioMime(contentType);
  if (!canonicalMime) return "bin";
  return AUDIO_MIME_TO_EXTENSION[canonicalMime];
}
