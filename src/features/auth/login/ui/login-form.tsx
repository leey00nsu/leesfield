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
import { AppInput } from "@/shared/ui/app-input";
import { useTranslations } from "next-intl";
import { sanitizeLoginReturnTo } from "@/features/auth/lib/login-redirect";

const initialState = {
  errorCode: undefined,
};

type LoginFormProps = {
  returnTo?: string;
};

export function LoginForm({ returnTo = "/" }: LoginFormProps) {
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
    formData.set("returnTo", sanitizeLoginReturnTo(returnTo));
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
                  surface="auth"
                  inputSize="lg"
                  className="min-w-0"
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
                  surface="auth"
                  inputSize="lg"
                  className="min-w-0"
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
          variant="auth"
          size="toolbar"
          className="mt-2 w-full rounded-xl text-base font-bold"
        >
          {isPending ? tForm("submitting") : tForm("submit")}
        </AppButton>
      </form>
    </AppForm>
  );
}
