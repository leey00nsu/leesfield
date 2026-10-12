const legacySettings = () => { const { composition: _removed, ...rest } = defaultCinemaSettings(); void _removed; return { ...rest, shootingEnabled: true, schemaVersion: 1, focalLength: "auto" }; };

import { describe, expect, it } from "vitest";
import { cinemaSnapshotSchema, defaultCinemaSettings, parseCinemaSettings, readCinemaSettings } from "./cinema-contract";
import { composeCinemaPrompt } from "./cinema-prompt";
import { applyCinemaFinalPrompt, cinemaPromptField, cinemaSourcePrompt } from "./cinema-model-support";
import { cinemaCatalog } from "./cinema-catalog";

const model = { providerConfig: { gradio_contract: {
  version: 1, apiName: "/generate", diagnostics: [], reviewed: true, output: null,
  inputs: [{ name: "description", label: "Prompt", kind: "string", schema: { type: "string" }, required: true, nullable: false, canonical: "prompt" }],
} } };
describe("Cinema authoring and submission", () => {
  it("keeps the exact legacy prompt when neutral, including whitespace", () => {
    const source = "  a film\nwith multiple lines  ";
    expect(composeCinemaPrompt(source, undefined, "image").finalPrompt).toBe(source);
    expect(readCinemaSettings(undefined).status).toBe("legacy-auto");
    const blank = composeCinemaPrompt("", { ...defaultCinemaSettings(), composition: "wide" }, "image");
    expect(blank.finalPrompt).toContain("Apply the selected shot size as the primary framing instruction.");
    expect(blank.finalPrompt).not.toContain("PRIORITY:.");
    expect(blank.finalPrompt).toContain("Use a wide environmental shot");
    expect(composeCinemaPrompt("", defaultCinemaSettings(), "image").finalPrompt).toBe("");
  });
  it("describes selective hardware without forcing quality or other Auto choices", () => {
    const settings = { ...defaultCinemaSettings(), camera: "16mm-film", aperture: "f14" };
    const result = composeCinemaPrompt("A rainy street", settings, "image");
    expect(result.sourcePrompt).toBe("A rainy street");
    expect(result.finalPrompt).toContain("Camera rendering inspired by ARRIFLEX 16SR 3");
    expect(result.finalPrompt).toContain("f/1.4 wide-open aperture");
    expect(result.finalPrompt).toContain("intended focus target sharply resolved");
    expect(result.finalPrompt).toContain("distant background elements with creamy, smooth blur");
    expect(result.finalPrompt).not.toMatch(/8K|Auto|at \d+mm|using a/);
    expect(composeCinemaPrompt(result.sourcePrompt, settings, "image")).toEqual(result);
  });
  it("separates displayed equipment specifications from new rendering directions", () => {
    const settings = { ...defaultCinemaSettings(), camera: "modular-8k", lens: "modern-prime" };
    const current = composeCinemaPrompt("A portrait", settings, "image");
    expect(current.mappingVersion).toBe(10);
    expect(current.finalPrompt).toContain("RED V-RAPTOR XL");
    expect(current.finalPrompt).toContain("ZEISS Otus");
    expect(current.finalPrompt).not.toMatch(/\d+mm|F\d|8K/);
    expect(cinemaCatalog.lens.find(item => item.id === "modern-prime")?.name).toBe("ZEISS Otus 55mm");
  });
  it.each([1, 2, 3, 4, 5, 6])("reads frozen mapping version %i without regenerating its prompt", mappingVersion => {
    const previous = { schemaVersion: 1, mappingVersion, settings: { ...legacySettings(), lens: "modern-prime", focalLength: "85" },
      sourcePrompt: "A portrait", finalPrompt: "Saved verbatim: ZEISS Otus 55mm, at 85mm.  \n" };
    expect(cinemaSnapshotSchema.parse(previous)).toEqual(previous);
    expect(cinemaSnapshotSchema.safeParse({ ...previous, mappingVersion: 7 }).success).toBe(false);
  });
  it("keeps all selected optics and makes shooting values authoritative over equipment names", () => {
    for (const camera of cinemaCatalog.camera) for (const lens of cinemaCatalog.lens)
      for (const focal of cinemaCatalog.composition) for (const aperture of cinemaCatalog.aperture) {
        const result = composeCinemaPrompt("A ceramic vase on a table, wide shot, focus on its handle",
          { ...defaultCinemaSettings(), camera: camera.id, lens: lens.id, composition: focal.id, aperture: aperture.id }, "image");
        expect(result.finalPrompt).toContain(focal.prompt);
        expect(result.finalPrompt).toContain(aperture.prompt);
        expect(result.finalPrompt).toContain("Maintain the selected camera and lens characteristics without allowing them to override the requested shot size.");
        expect(result.finalPrompt).toContain(camera.prompt);
        expect(result.finalPrompt).toContain(lens.prompt);
        expect(result.finalPrompt).toContain("prioritize the explicitly selected shot-size setting");
        expect(result.finalPrompt).toContain(focal.prompt + "\n\n");
        expect(result.finalPrompt.startsWith(focal.prompt)).toBe(true);
        expect(result.finalPrompt.indexOf(focal.prompt)).toBeLessThan(result.finalPrompt.indexOf("Camera rendering"));
        expect(result.finalPrompt.indexOf(aperture.name)).toBeLessThan(result.finalPrompt.indexOf("Lens character"));
      }
  });
  it.each([
  [
    "extreme-wide",
    "Use an extreme wide establishing shot with the camera positioned very far from the primary subject. Make the surrounding environment the dominant visual element, emphasizing the overall scale and atmosphere of the location.\n\nFor a single human subject, show the entire body occupying approximately 10–20% of the image height. The subject should appear small within a vast environment.\n\nReveal extensive surroundings, including clearly distinguishable foreground, middle-ground, and distant background layers. Emphasize the spatial relationship between the subject and the larger setting.\n\nPreserve the subject's visibility and intended focus target without enlarging the subject into a closer composition.\n\nAvoid medium-shot or close-up framing."
  ],
  [
    "wide",
    "Use a wide environmental shot with the camera positioned at a considerable distance from the primary subject.\n\nFor a single human subject, show the entire body from head to toe, occupying approximately 20–40% of the image height.\n\nKeep the subject relatively small while giving substantial visual importance to the surrounding architecture, landscape, or environment.\n\nMaintain generous negative space around the subject, with clearly readable foreground, middle-ground, and background elements.\n\nEstablish a strong relationship between the subject and the surrounding location while preserving the original scene content.\n\nDo not crop the subject's body or convert the composition into a medium shot or close-up."
  ],
  [
    "full",
    "Use a full shot that clearly shows the primary subject in its entirety while maintaining a recognizable surrounding environment.\n\nFor a single human subject, frame the entire body from head to toe, occupying approximately 65–85% of the image height.\n\nPosition the camera at a distance that allows the full figure to remain comfortably within the frame, with visible space above the head and below the feet.\n\nMake the subject the dominant compositional element while retaining enough environmental context to establish the location.\n\nPreserve natural body proportions, intended posture, and clear visibility of the entire subject.\n\nAvoid cropping the head, feet, or important extremities."
  ],
  [
    "medium-wide",
    "Use a medium wide shot, also known as a medium long shot, balancing the primary subject with meaningful environmental context.\n\nFor a single human subject, frame approximately from the knees upward, keeping the upper body and surrounding environment clearly visible.\n\nPosition the camera at a moderate distance, allowing the subject to appear prominent without completely dominating the composition.\n\nMaintain readable background architecture, environmental objects, and spatial relationships around the subject.\n\nPreserve natural body proportions and the intended focus target.\n\nAvoid excessively tight waist-up framing or full-body establishing-shot composition."
  ],
  [
    "medium",
    "Use a medium shot with the primary subject occupying a substantial portion of the composition.\n\nFor a single human subject, frame approximately from the waist upward, showing the torso, shoulders, head, and natural gestures.\n\nPosition the camera at a comfortable conversational distance, with the subject clearly emphasized while retaining some recognizable surrounding environment.\n\nMaintain balanced visual relationships between the subject and background.\n\nKeep the intended focus target sharply defined according to the selected aperture and focus instructions.\n\nAvoid framing the subject as a close-up or revealing an unnecessarily expansive environment."
  ],
  [
    "medium-close-up",
    "Use a medium close-up shot emphasizing the primary subject's upper body, facial features, and expression.\n\nFor a single human subject, frame approximately from the chest upward, keeping the head, shoulders, and upper chest clearly visible.\n\nMake the subject the dominant visual element while retaining a limited but recognizable amount of background context.\n\nPreserve natural facial proportions, realistic perspective, and the intended focus target.\n\nMaintain enough space around the head and shoulders to avoid excessively tight cropping.\n\nAvoid full-body framing or extreme facial close-ups."
  ],
  [
    "close-up",
    "Use a close-up shot emphasizing the primary subject's face, expression, and fine visual details.\n\nFor a single human subject, frame primarily the face and nearby shoulders, allowing the head to occupy most of the image.\n\nMinimize the visible surrounding environment while preserving enough contextual background to maintain the intended atmosphere.\n\nKeep the facial features naturally proportioned and the intended focus target precisely defined.\n\nEmphasize subtle expressions, realistic skin textures, and fine subject details without artificial distortion.\n\nAvoid medium-shot framing or excessive environmental space. Do not crop into an isolated facial feature unless explicitly requested."
  ],
  [
    "extreme-close-up",
    "Use an extreme close-up shot focusing on a specific small area or detail of the primary subject.\n\nFor a human subject, emphasize the explicitly requested focal detail, such as the eyes, lips, hands, or another clearly identified feature.\n\nIf no specific detail is requested, use the most visually significant feature relevant to the original scene.\n\nAllow the selected detail to occupy most of the image, with surrounding areas partially or completely excluded from the composition.\n\nReveal fine textures, subtle surface structures, and intricate visual details while preserving photorealistic proportions.\n\nMaintain precise focus on the intended detail according to the selected aperture.\n\nAvoid showing the full face, upper body, or surrounding environment unless needed to identify the focused detail."
  ]
])("uses the exact user shot paragraphs for %s", (composition, phrase) => {
    const result = composeCinemaPrompt("A person at a cafe, focus on the eyes", { ...defaultCinemaSettings(), composition }, "image");
    expect(result.finalPrompt).toContain(phrase);
    expect(result.finalPrompt).toContain("prioritize the explicitly selected shot-size setting");
    expect(result.finalPrompt).toContain('Do not interpret a focus instruction, such as "focus on the eyes," as a request for a close-up.');
    expect(result.finalPrompt).not.toMatch(/\d+mm|focal length|preserve those instructions as the highest priority/);
    expect(result.finalPrompt.startsWith(phrase + "\n\n")).toBe(true);
    expect(result.finalPrompt.split(phrase)).toHaveLength(2);
    expect(result.sourcePrompt).toBe("A person at a cafe, focus on the eyes");
  });
  it("reads frozen mapping7 exactly and reserves full shots for mapping8", () => {
    const previous = { ...composeCinemaPrompt("A person", { ...defaultCinemaSettings(), composition: "close-up" }, "image"), settings: { ...defaultCinemaSettings(), shootingEnabled: true, composition: "close-up" }, mappingVersion: 7, finalPrompt: "Saved mapping7 prompt  \n" };
    expect(cinemaSnapshotSchema.parse(previous)).toEqual(previous);
    expect(cinemaSnapshotSchema.safeParse({ ...previous, settings: { ...previous.settings, composition: "full" } }).success).toBe(false);
    expect(cinemaSnapshotSchema.safeParse(composeCinemaPrompt("scene", { ...defaultCinemaSettings(), composition: "full" }, "image")).success).toBe(true);
  });
  it("adds shot common instructions only for an enabled explicit composition", () => {
    const common = "Apply the selected shot size as the primary framing instruction.\n\nThe selected shot size determines the relative size of the primary subject within the image, the camera-to-subject distance, and how much of the surrounding environment is visible.\n\nPreserve the original scene's subject identity, actions, environment, lighting, camera angle, and intended focus target.\n\nIf the original scene specifies a different shot size, prioritize the explicitly selected shot-size setting while preserving other scene details whenever possible.\n\nDo not interpret a focus instruction, such as \"focus on the eyes,\" as a request for a close-up. The focus target determines where the image is sharp, not how tightly the subject is framed.\n\nMaintain the selected camera and lens characteristics without allowing them to override the requested shot size.\n\nFor human subjects, use the described body framing as the primary composition reference. For non-human subjects, apply equivalent relative subject scale and environmental coverage.\n\nDo not introduce new objects or alter the scene solely to satisfy the composition.\n\nTreat subject-size percentages as approximate visual targets rather than rigid measurements.";
    for (const source of ["", "  A wide shot of a vase, focus on its handle.  \n"]) {
      const chosen = composeCinemaPrompt(source, { ...defaultCinemaSettings(), composition: "close-up" }, "image");
      expect(chosen.finalPrompt).toContain(common);
      expect(chosen.finalPrompt.split(common)).toHaveLength(2);
      expect(chosen.sourcePrompt).toBe(source);
      for (const settings of [defaultCinemaSettings(), { ...defaultCinemaSettings(), camera: "16mm-film", aperture: "f14" }, { ...defaultCinemaSettings(), shootingEnabled: false, composition: "full" }])
        expect(composeCinemaPrompt(source, settings, "image").finalPrompt).not.toContain(common);
    }
  });
  it("upgrades validated legacy editing settings without inferring framing or mutating frozen data", () => {
    const legacy = { ...legacySettings(), focalLength: "85", aperture: "f14" };
    expect(parseCinemaSettings(legacy, "image")).toEqual({ ...defaultCinemaSettings(), aperture: "f14" });
    expect(legacy.focalLength).toBe("85");
    expect(readCinemaSettings({ ...legacy, focalLength: "unknown" }).status).toBe("unsupported");
    expect(cinemaSnapshotSchema.safeParse({ ...composeCinemaPrompt("scene", undefined, "image"), mappingVersion: 11 }).success).toBe(false);
  });
  it.each([
    ["f14", /focus target sharply resolved.*creamy, smooth blur/],
    ["f4", /focus target crisp.*Background objects should remain recognizable/],
    ["f11", /multiple surrounding depth planes.*physically plausible focus falloff/],
  ])("communicates focus and background appearance for %s", (aperture, visualIntent) => {
    const result = composeCinemaPrompt("A product", { ...defaultCinemaSettings(), aperture }, "image");
    expect(result.finalPrompt).toMatch(visualIntent);
    expect(result.finalPrompt).not.toMatch(/\d+mm/);
  });
  it("uses independent sentences for visual directions without adding shooting instructions", () => {
    const result = composeCinemaPrompt("A scene", { ...defaultCinemaSettings(), palette: "cool-blue", lighting: "window" }, "image");
    expect(result.finalPrompt).toBe("A scene\n\nCinema direction: Cool blue color grading. Soft natural window light.");
    expect(result.finalPrompt).not.toMatch(/shot size|focus target/);
  });
  it("preserves disabled shooting choices while applying independent visual style", () => {
    const result = composeCinemaPrompt("A portrait", { ...defaultCinemaSettings(), shootingEnabled: false, camera: "16mm-film", composition: "close-up", lighting: "window" }, "image");
    expect(result.finalPrompt).toContain("Soft natural window light");
    expect(result.finalPrompt).not.toContain("16mm");
    expect(result.finalPrompt).not.toContain("85mm");
    expect(result.finalPrompt).toBe("A portrait\n\nCinema direction: Soft natural window light.");
    expect(result.settings.camera).toBe("auto");
    expect(result.settings).not.toHaveProperty("shootingEnabled");
  });
  it("keeps unknown persisted values for explicit recovery and rejects invalid submissions", () => {
    const raw = { ...defaultCinemaSettings(), camera: "deleted-camera" };
    expect(readCinemaSettings(raw)).toEqual({ status: "unsupported", raw });
    expect(() => parseCinemaSettings(raw, "image")).toThrow("CINEMA_SETTINGS_UNSUPPORTED");
    expect(() => parseCinemaSettings({ ...defaultCinemaSettings(), schemaVersion: 3 }, "image")).toThrow();
    expect(() => parseCinemaSettings({ ...defaultCinemaSettings(), movement: "orbit" }, "image")).toThrow("CINEMA_VIDEO_ONLY");
    expect(composeCinemaPrompt("A runner", { ...defaultCinemaSettings(), movement: "tracking" }, "video").finalPrompt).toContain("tracks the moving subject");
  });
  it("uses the actual explicit provider prompt and writes back to its declared field", () => {
    const payload = { prompt: "unused canonical", dynamicParams: { description: "explicit scene", strength: 2 } };
    expect(cinemaSourcePrompt(model, payload)).toBe("explicit scene");
    const snapshot = composeCinemaPrompt(cinemaSourcePrompt(model, payload), { ...defaultCinemaSettings(), palette: "cool-blue" }, "image");
    const next = applyCinemaFinalPrompt(model, payload, snapshot.finalPrompt);
    expect(next.dynamicParams).toEqual({ description: snapshot.finalPrompt, strength: 2 });
    expect(next.prompt).toBe(snapshot.finalPrompt);
  });
  it("offers all 33 movements while preserving frozen snapshots and saved orbit separately", () => {
    expect(cinemaCatalog.movement).toHaveLength(33);
    expect(new Set(cinemaCatalog.movement.map(item => item.id)).size).toBe(33);
    expect(cinemaCatalog.movement.some(item => item.id === "orbit")).toBe(false);
    for (const movement of cinemaCatalog.movement) {
      const current = composeCinemaPrompt("A scene", { ...defaultCinemaSettings(), movement: movement.id }, "video");
      expect(current.mappingVersion).toBe(10);
      expect(current.finalPrompt.toLowerCase()).toContain(movement.prompt.toLowerCase());
      expect(() => parseCinemaSettings(current.settings, "image")).toThrow("CINEMA_VIDEO_ONLY");
    }
    for (const mappingVersion of [7, 8]) {
      const snapshot = { schemaVersion: 2, mappingVersion, settings: { ...defaultCinemaSettings(), shootingEnabled: true, movement: "orbit" }, sourcePrompt: "source", finalPrompt: "Saved orbit verbatim  \n" };
      expect(cinemaSnapshotSchema.parse(snapshot)).toEqual(snapshot);
      expect(cinemaSnapshotSchema.safeParse({ ...snapshot, settings: { ...snapshot.settings, movement: "drone-orbit" } }).success).toBe(false);
    }
    const previous = { schemaVersion: 2, mappingVersion: 9,
      settings: { ...defaultCinemaSettings(), shootingEnabled: false, movement: "snorricam" },
      sourcePrompt: "source", finalPrompt: "Saved mapping9 unchanged  \n" };
    expect(cinemaSnapshotSchema.parse(previous)).toEqual(previous);
    expect(parseCinemaSettings(previous.settings, "video")).toMatchObject({ movement: "auto" });
    const legacy = { schemaVersion: 1, mappingVersion: 6, settings: { ...legacySettings(), movement: "drone-orbit" }, sourcePrompt: "source", finalPrompt: "saved" };
    expect(cinemaSnapshotSchema.safeParse(legacy).success).toBe(false);
    expect(composeCinemaPrompt("source", { ...defaultCinemaSettings(), movement: "orbit" }, "video").finalPrompt).toContain("Camera orbits around the subject");
  });
  it("detects promptless contracts rather than inferring support from a model name", () => {
    expect(cinemaPromptField({ providerConfig: { gradio_contract: { ...model.providerConfig.gradio_contract, inputs: [] } } }).supported).toBe(false);
  });
});
