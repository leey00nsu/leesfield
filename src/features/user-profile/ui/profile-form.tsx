import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

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
  const bioMax = values.bioMax ?? 200;
  const bioCount = values.bio.length;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-surface-dark">
      <div className="flex items-center justify-between border-b border-white/5 px-8 py-6">
        <h3 className="flex items-center gap-3 text-lg font-bold text-white">
          <span className="h-6 w-1 rounded-full bg-primary" />
          Personal Information
        </h3>
      </div>
      <div className="p-8">
        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <Label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
              First Name
            </Label>
            <Input
              defaultValue={values.firstName}
              placeholder={placeholders?.firstName}
              className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
          <div>
            <Label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
              Last Name
            </Label>
            <Input
              defaultValue={values.lastName}
              placeholder={placeholders?.lastName}
              className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        </div>
        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <Label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
              Email Address
            </Label>
            <Input
              type="email"
              defaultValue={values.email}
              placeholder={placeholders?.email}
              className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
          <div>
            <Label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
              Username
            </Label>
            <Input
              defaultValue={values.username}
              placeholder={placeholders?.username}
              className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        </div>
        <div>
          <Label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
            Bio
          </Label>
          <Textarea
            rows={4}
            defaultValue={values.bio}
            placeholder={placeholders?.bio}
            className="rounded-lg border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
          />
          <div className="mt-2 flex justify-end">
            <span className="text-[10px] font-mono text-gray-600">
              {bioCount}/{bioMax} CHARACTERS
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
