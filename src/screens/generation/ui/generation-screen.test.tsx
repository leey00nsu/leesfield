import { GenerationComposerLayout } from "@/shared/ui/generation-media-rail";
import { useEffect, useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import { GenerationScreen } from "./generation-screen";
const navigation = vi.hoisted(() => ({
  params: new URLSearchParams("type=image"),
}));
const lifecycle = vi.hoisted(() => ({
  mounted: vi.fn(),
  unmounted: vi.fn(),
  submitted: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => navigation.params,
}));
function MockForm({ media }: { media: string }) {
  const [value, setValue] = useState("");
  const [job, setJob] = useState(false);
  useEffect(() => {
    lifecycle.mounted(media);
    return () => lifecycle.unmounted(media);
  }, [media]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setJob(true);
        lifecycle.submitted(media);
      }}
    >
      <GenerationComposerLayout>
        <input
          aria-label={media}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button>Start {media}</button>
        {job && <p>Running {media}</p>}
      </GenerationComposerLayout>
    </form>
  );
}
vi.mock("@/features/image-generation/ui/image-generation-form", () => ({
  ImageGenerationForm: () => <MockForm media="image" />,
}));
vi.mock("@/features/video-generation/ui/video-generation-form", () => ({
  VideoGenerationForm: () => <MockForm media="video" />,
}));
vi.mock("@/features/audio-generation/ui/audio-generation-form", () => ({
  AudioGenerationForm: () => <MockForm media="audio" />,
}));
describe("GenerationScreen", () => {
  it("keeps drafts and running jobs mounted while changing media", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const user = userEvent.setup();
    const view = renderWithIntl(<GenerationScreen isAuthenticated />);
    await user.type(await screen.findByRole("textbox", { name: "image" }), "my draft");
    await user.click(screen.getByRole("button", { name: "Start image" }));
    await user.click(screen.getByRole("tab", { name: "오디오" }));
    navigation.params = new URLSearchParams("type=audio");
    view.rerender(<GenerationScreen isAuthenticated />);
    expect(screen.queryByRole("textbox", { name: "image" })).toBeNull();
    await user.type(
      await screen.findByRole("textbox", { name: "audio" }),
      "audio draft",
    );
    navigation.params = new URLSearchParams("type=image");
    view.rerender(<GenerationScreen isAuthenticated />);
    expect(screen.getByRole("textbox", { name: "image" })).toHaveValue(
      "my draft",
    );
    expect(screen.getByText("Running image")).toBeVisible();
    expect(lifecycle.unmounted).not.toHaveBeenCalled();
    expect(lifecycle.submitted).toHaveBeenCalledTimes(1);
    expect(lifecycle.mounted.mock.calls.map((call) => call[0])).toEqual([
      "image",
      "audio",
    ]);
  });
});
