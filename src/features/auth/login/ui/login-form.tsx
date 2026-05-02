"use client";

import { startTransition, useActionState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginAction } from "@/features/auth/login/api/login-action";
import {
  createLoginSchema,
  type LoginFormValues,
} from "@/features/auth/login/model/login-schema";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppForm,
  AppFormControl,
  AppFormControllerField,
  AppFormItem,
  AppFormLabel,
  AppFormMessage,
} from "@/shared/ui/app-form";
import { AppInput } from "@/shared/ui/app-form-control";
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
    <AppForm {...form}>
      <form className="flex min-w-0 flex-col gap-3" onSubmit={onSubmit}>
        <AppFormControllerField
          control={form.control}
          name="email"
          render={({ field }) => (
            <AppFormItem>
              <AppFormLabel className="sr-only">{tForm("emailLabel")}</AppFormLabel>
              <AppFormControl>
                <AppInput
                  className="h-14 min-w-0 rounded-xl border-white/12 bg-[#111417] px-5 text-base text-white placeholder:text-gray-500 focus-visible:ring-primary/70"
                  placeholder={tForm("emailPlaceholder")}
                  autoComplete="username"
                  {...field}
                />
              </AppFormControl>
              <AppFormMessage className="pt-1 text-left text-xs text-red-300" />
            </AppFormItem>
          )}
        />

        <AppFormControllerField
          control={form.control}
          name="password"
          render={({ field }) => (
            <AppFormItem>
              <AppFormLabel className="sr-only">{tForm("passwordLabel")}</AppFormLabel>
              <AppFormControl>
                <AppInput
                  type="password"
                  className="h-14 min-w-0 rounded-xl border-white/12 bg-[#111417] px-5 text-base text-white placeholder:text-gray-500 focus-visible:ring-primary/70"
                  placeholder={tForm("passwordPlaceholder")}
                  autoComplete="current-password"
                  {...field}
                />
              </AppFormControl>
              <AppFormMessage className="pt-1 text-left text-xs text-red-300" />
            </AppFormItem>
          )}
        />

        {state?.errorCode && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-xs leading-5 text-red-200">
            {errorMessages[state.errorCode] ?? errorMessages.UNKNOWN}
          </div>
        )}

        <AppButton
          type="submit"
          disabled={isPending}
          className="mt-2 h-14 w-full rounded-xl border border-white/10 bg-[#22262c] text-base font-bold text-white shadow-none transition-colors hover:bg-[#2b3037]"
        >
          {isPending ? tForm("submitting") : tForm("submit")}
        </AppButton>
      </form>
    </AppForm>
  );
}
