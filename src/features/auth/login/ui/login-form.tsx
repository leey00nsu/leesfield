"use client";

import { startTransition, useActionState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginAction } from "@/features/auth/login/api/login-action";
import {
  createLoginSchema,
  type LoginFormValues,
} from "@/features/auth/login/model/login-schema";
import { Button } from "@/shared/ui/button";
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
    <Form {...form}>
      <form className="flex min-w-0 flex-col gap-3" onSubmit={onSubmit}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">{tForm("emailLabel")}</FormLabel>
              <FormControl>
                <Input
                  className="h-14 min-w-0 rounded-xl border-white/12 bg-[#111417] px-5 text-base text-white placeholder:text-gray-500 focus-visible:ring-primary/70"
                  placeholder={tForm("emailPlaceholder")}
                  autoComplete="username"
                  {...field}
                />
              </FormControl>
              <FormMessage className="pt-1 text-left text-xs text-red-300" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">{tForm("passwordLabel")}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  className="h-14 min-w-0 rounded-xl border-white/12 bg-[#111417] px-5 text-base text-white placeholder:text-gray-500 focus-visible:ring-primary/70"
                  placeholder={tForm("passwordPlaceholder")}
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage className="pt-1 text-left text-xs text-red-300" />
            </FormItem>
          )}
        />

        {state?.errorCode && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-xs leading-5 text-red-200">
            {errorMessages[state.errorCode] ?? errorMessages.UNKNOWN}
          </div>
        )}

        <Button
          type="submit"
          disabled={isPending}
          className="mt-2 h-14 w-full rounded-xl border border-white/10 bg-[#22262c] text-base font-bold text-white shadow-none transition-colors hover:bg-[#2b3037]"
        >
          {isPending ? tForm("submitting") : tForm("submit")}
        </Button>
      </form>
    </Form>
  );
}
