import { AppInput, AppLabel, AppTextarea } from "@/shared/ui/app-form-control";
import { useTranslations } from "next-intl";

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  bio: string;
  bioMax?: number;
}

export interface ProfileFormPlaceholders {
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
  bio?: string;
}

interface ProfileFormProps {
  values: ProfileFormValues;
  placeholders?: ProfileFormPlaceholders;
}

export function ProfileForm({ values, placeholders }: ProfileFormProps) {
  const tForm = useTranslations("profile.form");
  const tPlaceholders = useTranslations("profile.form.placeholders");
  const bioMax = values.bioMax ?? 200;
  const bioCount = values.bio.length;
  const resolvedPlaceholders = {
    firstName: placeholders?.firstName ?? tPlaceholders("notSet"),
    lastName: placeholders?.lastName ?? tPlaceholders("notSet"),
    email: placeholders?.email ?? tPlaceholders("email"),
    username: placeholders?.username ?? tPlaceholders("username"),
    bio: placeholders?.bio ?? tPlaceholders("bio"),
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-surface-dark">
      <div className="flex items-center justify-between border-b border-white/5 px-8 py-6">
        <h3 className="flex items-center gap-3 text-lg font-bold text-white">
          <span className="h-6 w-1 rounded-full bg-primary" />
          {tForm("title")}
        </h3>
      </div>
      <div className="p-8">
        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <AppLabel className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
              {tForm("firstName")}
            </AppLabel>
            <AppInput
              defaultValue={values.firstName}
              placeholder={resolvedPlaceholders.firstName}
              className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
          <div>
            <AppLabel className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
              {tForm("lastName")}
            </AppLabel>
            <AppInput
              defaultValue={values.lastName}
              placeholder={resolvedPlaceholders.lastName}
              className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        </div>
        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <AppLabel className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
              {tForm("email")}
            </AppLabel>
            <AppInput
              type="email"
              defaultValue={values.email}
              placeholder={resolvedPlaceholders.email}
              className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
          <div>
            <AppLabel className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
              {tForm("username")}
            </AppLabel>
            <AppInput
              defaultValue={values.username}
              placeholder={resolvedPlaceholders.username}
              className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        </div>
        <div>
          <AppLabel className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
            {tForm("bio")}
          </AppLabel>
          <AppTextarea
            rows={4}
            defaultValue={values.bio}
            placeholder={resolvedPlaceholders.bio}
            className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
          />
          <div className="mt-2 flex justify-end">
            <span className="text-[10px] font-mono text-gray-600">
              {tForm("characters", { count: bioCount, max: bioMax })}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
