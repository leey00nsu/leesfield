"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Lock, User } from "lucide-react";
import { loginAction } from "@/server/auth/actions";
import {
  loginSchema,
  type LoginFormValues,
} from "@/shared/lib/validators/auth";

const initialState = {
  error: "",
};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    formAction(formData);
  });

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-surface-dark p-8 shadow-2xl">
      <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl transition-all duration-500" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-accent-purple/10 blur-3xl transition-all duration-500" />

      <form className="relative z-10 flex flex-col gap-6" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label
            className="text-xs font-bold uppercase tracking-widest text-gray-500"
            htmlFor="email"
          >
            Username or Email
          </label>
          <div className="group/input relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <User className="h-5 w-5 text-gray-500 transition-colors group-focus-within/input:text-primary" />
            </div>
            <input
              id="email"
              type="email"
              className="w-full rounded-lg border border-white/10 bg-surface-lighter py-3 pl-10 pr-4 font-mono text-sm text-white placeholder:text-gray-600 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="ENTER_ID..."
              autoComplete="username"
              {...form.register("email")}
            />
          </div>
          {form.formState.errors.email && (
            <p className="text-xs text-red-400">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              className="text-xs font-bold uppercase tracking-widest text-gray-500"
              htmlFor="password"
            >
              Password
            </label>
            <button
              type="button"
              className="text-xs font-mono text-primary transition-colors hover:text-white hover:underline"
            >
              FORGOT_PASSWORD?
            </button>
          </div>
          <div className="group/input relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Lock className="h-5 w-5 text-gray-500 transition-colors group-focus-within/input:text-primary" />
            </div>
            <input
              id="password"
              type="password"
              className="w-full rounded-lg border border-white/10 bg-surface-lighter py-3 pl-10 pr-4 font-mono text-sm text-white placeholder:text-gray-600 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="••••••••"
              autoComplete="current-password"
              {...form.register("password")}
            />
          </div>
          {form.formState.errors.password && (
            <p className="text-xs text-red-400">
              {form.formState.errors.password.message}
            </p>
          )}
        </div>

        {state?.error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="group/btn mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold uppercase tracking-wider text-primary-content shadow-[0_4px_20px_rgba(212,240,50,0.15)] transition-all hover:bg-white hover:text-black hover:shadow-[0_4px_30px_rgba(255,255,255,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Authenticating..." : "Authenticate"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
        </button>

        <div className="mt-2 text-center">
          <p className="text-xs font-mono text-gray-500">
            NO_ACCESS_TOKEN?{" "}
            <span className="font-bold text-white transition-colors hover:text-primary">
              REQUEST_ACCESS
            </span>
          </p>
        </div>
      </form>
    </div>
  );
}
