// UI-03: which stored object the upload plugin deletes with a file, and how
// long an answer waits for a removal
const { describe, it, expect, afterEach } = require("@jest/globals");
const {
  mediaIds,
  removalMode,
  storageFile,
  waitAtMost,
} = require("../../src/utils/media-files");

const R2 = {
  provider: "strapi-provider-cloudflare-r2",
  providerOptions: {
    cloudflarePublicAccessUrl: "https://r2.example.test/",
  },
};

const minioFile = (overrides = {}) => ({
  id: 1,
  hash: "photo_abc123",
  ext: ".jpg",
  url: "https://r2.example.test/photo_abc123.jpg",
  provider: "minio-for-strapi-v4",
  folderPath: "/1",
  formats: {
    thumbnail: {
      hash: "thumbnail_photo_abc123",
      ext: ".jpg",
      path: null,
      url: "https://r2.example.test/thumbnail_photo_abc123.jpg",
    },
  },
  ...overrides,
});

describe("storageFile", () => {
  it("leaves a file of the current provider as it is", () => {
    const file = {
      ...minioFile(),
      provider: "strapi-provider-cloudflare-r2",
      url: "https://r2.example.test/1/photo_abc123.jpg",
    };
    expect(storageFile(file, R2)).toBe(file);
  });

  it("gives a file sent before R2 and copied to the bucket root to the current provider, at the root", () => {
    const file = minioFile();
    const result = storageFile(file, R2);

    expect(result).toMatchObject({
      id: 1,
      hash: "photo_abc123",
      ext: ".jpg",
      provider: "strapi-provider-cloudflare-r2",
      folderPath: "/",
      path: undefined,
    });
    expect(result.formats.thumbnail).toMatchObject({
      hash: "thumbnail_photo_abc123",
      folderPath: "/",
      path: undefined,
    });
    // the row read from the database is not changed
    expect(file.provider).toBe("minio-for-strapi-v4");
    expect(file.folderPath).toBe("/1");
  });

  it("accepts such a file without formats", () => {
    expect(storageFile(minioFile({ formats: null }), R2).provider).toBe(
      "strapi-provider-cloudflare-r2"
    );
  });

  it.each([
    [
      "served from another host",
      { url: "https://cdn.example.test/photo_abc123.jpg" },
    ],
    [
      "in a folder of the bucket",
      { url: "https://r2.example.test/1/photo_abc123.jpg" },
    ],
    [
      "with a format elsewhere",
      {
        formats: {
          thumbnail: {
            hash: "thumbnail_photo_abc123",
            ext: ".jpg",
            url: "https://old.example.test/thumbnail_photo_abc123.jpg",
          },
        },
      },
    ],
  ])(
    "keeps the old provider of a file %s (only its row is deleted)",
    (_label, overrides) => {
      const file = minioFile(overrides);
      expect(storageFile(file, R2)).toBe(file);
    }
  );

  it("keeps the old provider without a public R2 URL", () => {
    const file = minioFile();
    expect(storageFile(file, { provider: "local", providerOptions: {} })).toBe(
      file
    );
  });
});

describe("mediaIds", () => {
  it("collects the ids of single and multiple media fields", () => {
    expect(
      mediaIds({ id: 3 }, [{ id: 4 }, { id: 3 }], null, undefined, [])
    ).toEqual([3, 4]);
  });
});

describe("removalMode", () => {
  it("reads MEDIA_REMOVAL: delete by default, log for log and anything else", () => {
    expect(removalMode(undefined)).toEqual({ mode: "delete", unknown: false });
    expect(removalMode("")).toEqual({ mode: "delete", unknown: false });
    expect(removalMode(" Delete ")).toEqual({ mode: "delete", unknown: false });
    expect(removalMode("log")).toEqual({ mode: "log", unknown: false });
    expect(removalMode("off")).toEqual({ mode: "log", unknown: true });
    expect(removalMode("false")).toEqual({ mode: "log", unknown: true });
  });
});

describe("waitAtMost", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("stops waiting at the delay, for a removal that never ends", async () => {
    jest.useFakeTimers();
    let done = false;
    const waiting = waitAtMost(new Promise(() => {}), 5000).then(() => {
      done = true;
    });

    await jest.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    await waiting;
  });

  it("returns as soon as a fast removal ends, and leaves no timer", async () => {
    jest.useFakeTimers();
    let done = false;
    const removal = new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    const waiting = waitAtMost(removal, 5000).then(() => {
      done = true;
    });

    await jest.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    await waiting;
    expect(jest.getTimerCount()).toBe(0);
  });
});
