import { AppShell } from "@/components/layout/AppShell";

export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return <AppShell workspaceName="Personal workspace">{children}</AppShell>;
}
