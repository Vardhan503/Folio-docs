import { FileText, Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const primaryNavItems: NavItem[] = [
  { href: "/", label: "My Documents", icon: FileText },
  { href: "/shared", label: "Shared With Me", icon: Users },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getPageTitle(pathname: string): string {
  const match = primaryNavItems.find((item) =>
    isNavItemActive(pathname, item.href),
  );
  return match?.label ?? "Folio";
}
