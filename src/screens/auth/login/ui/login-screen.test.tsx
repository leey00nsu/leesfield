import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginScreen } from "@/screens/auth/login/ui/login-screen";

vi.mock("next/image", () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      priority?: boolean;
      sizes?: string;
    },
  ) => {
    const imageProps = { ...props };
    delete imageProps.fill;
    delete imageProps.priority;
    delete imageProps.sizes;

    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imageProps} alt={imageProps.alt ?? ""} />;
  },
}));

vi.mock("@/widgets/header/ui/header", () => ({
  Header: () => <header data-testid="header" />,
}));

vi.mock("@/features/auth/login/ui/login-form", () => ({
  LoginForm: () => <form aria-label="login form" />,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => {
    const messages: Record<string, string> = {
      panelLabel: "Login",
      headline: "Log in to leesfield",
      subtitle: "Use your account to keep creating images, videos, and audio.",
      terms: "Continuing opens your private workspace and generation history.",
      "preview.imageAlt": "Creative studio login preview",
      "preview.badges.unlimited": "Private workspace",
      "preview.badges.quality": "Saved history",
      "preview.badges.prompt": "Saved work",
      "preview.title": "LEESFIELD STUDIO",
      "preview.description": "",
      "preview.tabs.image": "Image",
      "preview.tabs.video": "Video",
      "preview.tabs.audio": "Audio",
      "preview.tabs.api": "API",
    };
    return messages[key] ?? key;
  },
}));

describe("LoginScreen", () => {
  it("does not render the private workspace helper sentence", async () => {
    render(await LoginScreen({}));

    expect(screen.getByRole("heading", { name: "Log in to leesfield" })).toBeInTheDocument();
    expect(
      screen.queryByText("Continuing opens your private workspace and generation history."),
    ).not.toBeInTheDocument();
  });
});
