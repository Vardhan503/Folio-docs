import { Suspense } from "react";
import { WorkspaceAccount } from "@/app/(workspace)/_components/WorkspaceAccount";
import { AccountMenuSkeleton } from "@/components/account/AccountMenu";
import { AppShell } from "@/components/layout/AppShell";

export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      workspaceName="Personal workspace"
      account={
        <Suspense fallback={<AccountMenuSkeleton />}>
          <WorkspaceAccount />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
