import { UserProfileWidget } from "@/widgets/user-profile/ui/user-profile-widget";

type UserProfileScreenProps = {
  adminEmail: string;
};

export function UserProfileScreen({ adminEmail }: UserProfileScreenProps) {
  return <UserProfileWidget adminEmail={adminEmail} />;
}
