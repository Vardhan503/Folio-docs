import { AccountMenu } from "@/components/account/AccountMenu";
import { buildAccountSummary } from "@/lib/account";
import { signOut } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/data/profiles";

export async function WorkspaceAccount() {
  const [user, profileResult] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
  ]);

  const profile = profileResult.ok ? profileResult.data : null;
  const account = buildAccountSummary(
    profile?.display_name,
    profile?.email ?? user.email,
  );

  return <AccountMenu account={account} signOutAction={signOut} />;
}
