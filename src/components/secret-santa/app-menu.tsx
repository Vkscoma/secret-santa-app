"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { useSession, signOut } from "@/lib/auth-client";

const links = [
  ["Home", "/"],
  ["My wish lists", "/wishlists"],
  ["Add from your phone", "/help/add-from-phone"],
  ["History", "/history"],
  ["Settings", "/profile"],
] as const;

export function AppMenu() {
  const { data: session } = useSession();
  const router = useRouter();
  const name = session?.user?.name ?? "Santa’s helper";
  const initial = name.trim().charAt(0).toUpperCase() || "S";

  async function handleSignOut() {
    await signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:block"><ModeToggle /></div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-10 rounded-full p-0" aria-label="Open menu">
            <span className="grid size-9 place-items-center rounded-full border border-border bg-secondary text-sm font-bold text-pine dark:text-pine-foreground">{initial}</span>
            <Menu className="ml-0.5 size-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-2">
            <p className="text-sm font-bold">{name}</p>
            <p className="text-xs text-muted-foreground">{session?.user?.email ?? "A little holiday magic"}</p>
          </div>
          <DropdownMenuSeparator />
          {links.map(([label, href]) => (
            <DropdownMenuItem asChild key={href}><Link href={href}>{label}</Link></DropdownMenuItem>
          ))}
          {session?.user?.role === "admin" && (
            <DropdownMenuItem asChild><Link href="/admin">Admin</Link></DropdownMenuItem>
          )}
          {session?.user ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}><LogOut className="size-4" /> Sign out</DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/login"><UserRound className="size-4" /> Sign in</Link></DropdownMenuItem>
            </>
          )}
          <div className="flex items-center justify-between px-2 py-2 sm:hidden">
            <span className="text-sm">Appearance</span><ModeToggle />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
