import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { AppHeading } from "@/shared/ui/app-typography";
import { LoginForm } from "@/features/auth/login/ui/login-form";

function LoginPanel() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07090b] p-8 text-white">
      <section className="w-full max-w-[22.375rem] rounded-[2rem] border border-white/10 bg-[#121619]/95 p-8 shadow-[0_28px_130px_rgba(0,0,0,0.58)]">
        <div className="flex flex-col items-center text-center">
          <AppBrandLogo
            variant="icon"
            size="lg"
            className="mb-6"
            markClassName="shadow-[0_0_34px_rgba(205,255,0,0.25)]"
          />
          <AppHeading as="h1" size="compact" className="text-3xl">
            Login
          </AppHeading>
          <div className="mt-8 w-full">
            <LoginForm returnTo="/" />
          </div>
        </div>
      </section>
    </div>
  );
}

const meta = {
  title: "Project Design/Auth/LoginForm",
  component: LoginPanel,
} satisfies Meta<typeof LoginPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
