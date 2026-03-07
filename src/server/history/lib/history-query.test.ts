import {
  buildImageWhere,
  buildVideoWhere,
  extractInputAudios,
  extractReferenceText,
  extractModel,
  parseHistoryQuery,
} from "@/server/history/lib/history-query";

describe("history-query", () => {
  describe("parseHistoryQuery", () => {
    it("기본값을 적용한다", () => {
      const params = new URLSearchParams();
      const result = parseHistoryQuery(params);

      expect(result).toEqual({
        type: "all",
        query: "",
        sort: "date_desc",
        limit: 24,
        offset: 0,
      });
    });

    it("유효하지 않은 값은 기본값으로 치환한다", () => {
      const params = new URLSearchParams({
        type: "unknown",
        sort: "latest",
        limit: "200",
        offset: "-10",
      });
      const result = parseHistoryQuery(params);

      expect(result.type).toBe("all");
      expect(result.sort).toBe("date_desc");
      expect(result.limit).toBe(100);
      expect(result.offset).toBe(0);
    });

    it("쿼리 파라미터를 정규화한다", () => {
      const params = new URLSearchParams({
        type: "IMAGE",
        sort: "DATE_ASC",
        query: "  hello  ",
        limit: "12",
        offset: "5",
      });
      const result = parseHistoryQuery(params);

      expect(result).toEqual({
        type: "image",
        query: "hello",
        sort: "date_asc",
        limit: 12,
        offset: 5,
      });
    });

    it("limit 하한을 보정한다", () => {
      const params = new URLSearchParams({
        limit: "-1",
      });
      const result = parseHistoryQuery(params);
      expect(result.limit).toBe(1);
    });

    it("audio 타입을 허용한다", () => {
      const params = new URLSearchParams({
        type: "AUDIO",
      });

      const result = parseHistoryQuery(params);

      expect(result.type).toBe("audio");
    });
  });

  describe("buildImageWhere", () => {
    it("query가 없으면 빈 조건을 반환한다", () => {
      const query = parseHistoryQuery(new URLSearchParams());
      expect(buildImageWhere(query)).toEqual({});
    });

    it("prompt/model 검색 조건을 생성한다", () => {
      const query = parseHistoryQuery(new URLSearchParams({ query: "test" }));
      expect(buildImageWhere(query)).toEqual({
        OR: [
          {
            prompt: {
              contains: "test",
              mode: "insensitive",
            },
          },
          {
            requestParams: {
              path: ["model"],
              string_contains: "test",
            },
          },
        ],
      });
    });
  });

  describe("buildVideoWhere", () => {
    it("query가 없으면 빈 조건을 반환한다", () => {
      const query = parseHistoryQuery(new URLSearchParams());
      expect(buildVideoWhere(query)).toEqual({});
    });

    it("prompt/model 검색 조건을 생성한다", () => {
      const query = parseHistoryQuery(new URLSearchParams({ query: "clip" }));
      expect(buildVideoWhere(query)).toEqual({
        OR: [
          {
            prompt: {
              contains: "clip",
              mode: "insensitive",
            },
          },
          {
            requestParams: {
              path: ["model"],
              string_contains: "clip",
            },
          },
        ],
      });
    });
  });

  describe("extractModel", () => {
    it("model 문자열을 추출한다", () => {
      expect(extractModel({ model: "Z-Image-Turbo" })).toBe("Z-Image-Turbo");
    });

    it("model이 문자열이 아니면 null을 반환한다", () => {
      expect(extractModel({ model: 123 })).toBeNull();
      expect(extractModel({})).toBeNull();
      expect(extractModel(null)).toBeNull();
    });
  });

  describe("audio reference extractors", () => {
    it("inputAudio와 referenceText를 추출한다", () => {
      expect(
        extractInputAudios({
          inputAudio: "data:audio/wav;base64,UklGRg==",
          referenceText: "reference words",
        }),
      ).toEqual(["data:audio/wav;base64,UklGRg=="]);
      expect(
        extractReferenceText({
          referenceText: "reference words",
        }),
      ).toBe("reference words");
    });

    it("inputAudio가 없거나 잘못된 타입이면 빈 배열을 반환한다", () => {
      expect(extractInputAudios({})).toEqual([]);
      expect(extractInputAudios(null)).toEqual([]);
      expect(extractInputAudios({ inputAudio: 123 })).toEqual([]);
      expect(extractInputAudios({ inputAudio: [] })).toEqual([]);
    });

    it("referenceText가 없거나 잘못된 타입이면 null을 반환한다", () => {
      expect(extractReferenceText({})).toBeNull();
      expect(extractReferenceText(null)).toBeNull();
      expect(extractReferenceText({ referenceText: "" })).toBeNull();
      expect(extractReferenceText({ referenceText: 123 })).toBeNull();
    });
  });
});
