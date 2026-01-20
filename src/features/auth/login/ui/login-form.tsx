"use client";

import { startTransition, useActionState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Lock, User } from "lucide-react";
import { loginAction } from "@/features/auth/login/api/login-action";
import {
  createLoginSchema,
  type LoginFormValues,
} from "@/features/auth/login/model/login-schema";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import { useTranslations } from "next-intl";

const initialState = {
  errorCode: undefined,
};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );
  const tForm = useTranslations("auth.login.form");
  const tValidation = useTranslations("auth.login.validation");
  const schema = useMemo(() => createLoginSchema(tValidation), [tValidation]);
  const errorMessages = useMemo(
    () => ({
      INVALID_CREDENTIALS: tForm("errors.invalidCredentials"),
      SERVER_CONFIG: tForm("errors.serverConfig"),
      UNKNOWN: tForm("errors.unknown"),
    }),
    [tForm],
  );

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    startTransition(() => {
      formAction(formData);
    });
  });

  return (
    <Card className="relative w-full max-w-md overflow-hidden border border-white/10 bg-surface-dark shadow-2xl">
      <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl transition-all duration-500" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-accent-purple/10 blur-3xl transition-all duration-500" />
      <CardContent className="relative z-10 p-8">
        <Form {...form}>
          <form className="flex flex-col gap-6" onSubmit={onSubmit}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    {tForm("emailLabel")}
                  </FormLabel>
                  <FormControl>
                    <div className="group/input relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <User className="h-5 w-5 text-gray-500 transition-colors group-focus-within/input:text-primary" />
                      </div>
                      <Input
                        className="w-full border-white/10 bg-surface-lighter py-3 pl-10 pr-4 font-mono text-sm text-white placeholder:text-gray-600 transition-all focus-visible:ring-primary"
                        placeholder={tForm("emailPlaceholder")}
                        autoComplete="username"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs text-red-400" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    {tForm("passwordLabel")}
                  </FormLabel>
                  <FormControl>
                    <div className="group/input relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Lock className="h-5 w-5 text-gray-500 transition-colors group-focus-within/input:text-primary" />
                      </div>
                      <Input
                        type="password"
                        className="w-full border-white/10 bg-surface-lighter py-3 pl-10 pr-4 font-mono text-sm text-white placeholder:text-gray-600 transition-all focus-visible:ring-primary"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs text-red-400" />
                </FormItem>
              )}
            />

            {state?.errorCode && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {errorMessages[state.errorCode] ?? errorMessages.UNKNOWN}
              </div>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="group/btn mt-4 h-12 w-full gap-2 rounded-lg bg-primary text-sm font-bold uppercase tracking-wider text-primary-content shadow-[0_4px_20px_rgba(212,240,50,0.15)] transition-all hover:bg-primary hover:text-primary-content"
            >
              {isPending ? tForm("submitting") : tForm("submit")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
            </Button>

          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
