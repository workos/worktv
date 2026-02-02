"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

interface UserMenuProps {
  user: {
    email: string;
    firstName?: string;
    lastName?: string;
    profilePictureUrl?: string;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const { signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = user.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : user.email;

  const initials = user.firstName
    ? `${user.firstName[0]}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : user.email[0].toUpperCase();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-sm font-medium text-white transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-900 light:focus:ring-offset-white"
        aria-label="User menu"
      >
        {user.profilePictureUrl ? (
          <img
            src={user.profilePictureUrl}
            alt={displayName}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          initials
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-xl light:border-zinc-200 light:bg-white"
        >
          <div className="border-b border-white/10 px-4 py-3 light:border-zinc-200">
            <p className="text-sm font-medium text-white light:text-zinc-900">
              {displayName}
            </p>
            <p className="truncate text-xs text-zinc-400 light:text-zinc-500">
              {user.email}
            </p>
          </div>
          <button
            onClick={() => {
              setIsOpen(false);
              signOut();
            }}
            className="flex w-full items-center px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10 light:text-zinc-700 light:hover:bg-zinc-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
