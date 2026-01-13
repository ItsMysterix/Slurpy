"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Menu, X, MoreVertical, Calendar, BookOpen, MessageCircle, BarChart3, LogOut, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FloatingLeaves } from "@/components/floating-leaves";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthClient, useUser } from "@/lib/auth-hooks";
import { getCheckoutUrl } from "@/lib/pay";
import { usePlan } from "@/lib/use-plan";

interface SlideDrawerProps {
  onSidebarToggle?: (isOpen: boolean) => void;
}

export default function SlideDrawer({ onSidebarToggle }: SlideDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthClient();
  const { user } = useUser();
  const { isPro, loading } = usePlan();

  // Supabase user helpers
  const avatarUrl: string | undefined = (() => {
    const m = (user?.user_metadata as any) || {};
    return m.avatar_url || m.picture || undefined;
  })();
  const displayName: string = (() => {
    const m = (user?.user_metadata as any) || {};
    const username = m.username || m.user_name;
    if (username && typeof username === "string") return username;
    const full = m.name || m.full_name;
    if (full && typeof full === "string") return full;
    const gn = m.given_name, fn = m.family_name;
    if (gn || fn) return [gn, fn].filter(Boolean).join(" ");
    const email = user?.email;
    if (email && typeof email === "string") return email.split("@")[0];
    return "User";
  })();

  // Stripe price ids (support alternate env names)
  const pricePro = (process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO || "");

  const navigationItems = [
    { id: "chats",     label: "Chats",            icon: MessageCircle, href: "/chat",     description: "AI conversations",     gradient: "from-sage-400 to-sage-500" },
    { id: "insights",  label: "Session Insights", icon: BarChart3,     href: "/insights", description: "Emotion analytics",     gradient: "from-clay-400 to-clay-500" },
    { id: "calendar",  label: "Calendar",         icon: Calendar,      href: "/calendar", description: "Track your patterns",   gradient: "from-sage-500 to-clay-400" },
    { id: "journal",   label: "Journal",          icon: BookOpen,      href: "/journal",  description: "Reflect your thoughts", gradient: "from-clay-400 to-sage-400" },
  ];

  const isActivePage = (href: string) => pathname === href;

  const toggleSidebar = () => {
    const next = !isOpen;
    setIsOpen(next);
    onSidebarToggle?.(next);
  };

  const goToPlans = () => router.push("/plans");

  // Refs for accessibility and focus management
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  // Body-scroll lock on mobile when the drawer is open. Restore overflow and focus on close.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined") return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobile) return;
    // store last focused element
    lastActiveElementRef.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
      try {
        lastActiveElementRef.current?.focus?.();
      } catch (e) {
        /* ignore */
      }
    };
  }, [isOpen]);

  // Escape handling + initial focus fallback when using FocusTrap
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener("keydown", onKey);
    // try to focus the close button (focus-trap will ensure focus remains inside)
    const timeout = setTimeout(() => {
      const panel = drawerRef.current;
      const closeBtn = panel?.querySelector("[data-close-button]") as HTMLElement | null;
      closeBtn?.focus?.();
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(timeout);
    };
  }, [isOpen]);

  return (
    <>
      <div
        className={[
          // desktop: left sidebar, mobile: only show narrow bar with hamburger
          "fixed inset-y-0 left-0 z-40 transition-all duration-300",
          "w-12",
          isOpen ? "md:w-64" : "md:w-16",
          "bg-gradient-to-b from-white/95 via-sage-25/90 to-clay-50/95",
          "dark:from-gray-950/95 dark:via-gray-900/90 dark:to-gray-950/95",
          "backdrop-blur-lg border-r border-sage-200/50 dark:border-gray-700/50",
          "flex flex-col shadow-lg overflow-hidden"
        ].join(" ")}
      >
        {/* Floaties (desktop only) */}
        <div className="hidden md:block">
          {isOpen && (
            <div className="absolute inset-0 pointer-events-none">
              <FloatingLeaves />
            </div>
          )}
        </div>

        {/* Top: Hamburger (visible on all sizes) */}
        <div className={`flex ${isOpen ? "justify-start" : "justify-center"} p-2 relative z-10 md:justify-start`}>
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="sm"
            className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 flex-shrink-0 w-12 h-12 rounded-xl hover:bg-sage-100/70 dark:hover:bg-gray-800/70 transition-colors"
            aria-label="Toggle menu"
            aria-expanded={isOpen}
          >
            <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
              {isOpen ? <X size={20} /> : <Menu size={20} />}
            </motion.div>
          </Button>
        </div>

        {/* mobile spacer (we'll render the full-screen drawer separately) */}
        <div className="md:hidden flex-1" />

        {/* ===== DESKTOP CONTENT ===== */}
        <div className="hidden md:flex md:flex-1 md:flex-col">
          {isOpen ? (
            <>
              {/* Expanded list */}
              <div className="px-4 mb-3 relative z-10">
                <div className="space-y-4">
                  {navigationItems.map((item, index) => {
                    const Icon = item.icon;
                    const active = isActivePage(item.href);
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.5 }}
                        whileHover={{ scale: 1.02, y: -2, transition: { duration: 0.2 } }}
                      >
                        <Link href={item.href}>
                          <div
                            className={[
                              "rounded-xl p-3 border transition-all duration-200 cursor-pointer hover:shadow-lg backdrop-blur-sm",
                              active
                                ? "bg-gradient-to-r from-sage-500/90 via-clay-500/90 to-sand-500/90 dark:from-sage-600/90 dark:via-clay-600/90 dark:to-sand-600/90 border-sage-400/80 dark:border-sage-500/80 shadow-md text-white"
                                : "bg-white/80 dark:bg-gray-800/90 border-sage-200/60 dark:border-gray-600/80 hover:bg-sage-100/90 dark:hover:bg-gray-700/90 hover:border-sage-300/80 dark:hover:border-gray-500/80"
                            ].join(" ")}
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-sm`}>
                                <Icon className="w-4 h-4 text-white" />
                              </div>
                              <span className={`font-sans text-sm font-medium ${active ? "text-white" : "text-clay-700 dark:text-sand-200"}`}>
                                {item.label}
                              </span>
                            </div>
                            <p className={`text-xs font-sans ml-11 ${active ? "text-white/90" : "text-clay-500 dark:text-sand-400"}`}>
                              {item.description}
                            </p>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}

                  {/* Pro CTA moved near bottom per request */}
                </div>
              </div>

              {/* push bottom section down */}
              <div className="flex-1" />

              {/* Go Pro above user (only if not Pro and not loading) */}
              {!loading && !isPro && (
                <div className="px-4 pb-2 relative z-10">
                  <button onClick={goToPlans} className="w-full rounded-xl p-3 border transition-all duration-200 backdrop-blur-sm bg-gradient-to-r from-yellow-500/90 via-amber-500/90 to-orange-500/90 text-white border-yellow-400/50 shadow-md text-left">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shadow-sm">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-sans text-sm font-semibold">Go Pro</span>
                        <span className="text-[11px] opacity-90">Deeper insights & full memory</span>
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {/* Bottom: User / Signout */}
              <div className="border-sage-200/50 dark:border-gray-700/50 p-4 flex items-center gap-3 min-h-[64px] border-t bg-gradient-to-r from-white/50 via-sage-50/30 to-sand-50/50 dark:from-gray-900/50 dark:via-gray-800/30 dark:to-gray-900/50 backdrop-blur-sm relative z-10">
                <Avatar className="w-8 h-8 shadow-md">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <AvatarFallback className="bg-gradient-to-br from-clay-400 via-sage-400 to-sand-400 dark:from-clay-500 dark:via-sage-500 dark:to-sand-500 text-white text-sm">
                      {String(displayName || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="text-clay-600 dark:text-sand-300 text-sm flex-1 font-sans transition-colors">
                  {displayName}
                </span>

                <Link href="/profile">
                  <Button variant="ghost" size="sm" className="text-clay-400 hover:text-clay-600 dark:text-sand-500 dark:hover:text-sand-300 p-2 hover:bg-sage-100/50 dark:hover:bg-gray-700/50 rounded-lg">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </Link>
              </div>

              <div className="px-4 pb-4 relative z-10">
                <Button
                  onClick={() => signOut()}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white justify-start font-sans text-sm rounded-xl shadow-md transition-all duration-200"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            // Collapsed desktop
            <div className="flex flex-1 flex-col">
              {/* top: nav icons */}
              <div className="flex flex-col items-center py-4 space-y-4 relative z-10">
                {navigationItems.map((item, index) => {
                  const Icon = item.icon;
                  const active = isActivePage(item.href);
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1, duration: 0.4 }}
                      whileHover={{ scale: 1.1, y: -5, transition: { duration: 0.2 } }}
                    >
                      <Link href={item.href}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={[
                            "w-11 h-11 rounded-xl transition-all duration-200",
                            active
                              ? "bg-gradient-to-br from-sage-500 via-clay-500 to-sand-500 text-white shadow-lg border border-sage-400/60"
                              : "bg-white/80 dark:bg-gray-800/90 text-clay-600 hover:text-clay-700 hover:bg-sage-100/80 dark:text-sand-300 dark:hover:text-sand-200 dark:hover:bg-gray-700/90 border border-sage-200/50 hover:border-sage-300/70"
                          ].join(" ")}
                          title={item.label}
                        >
                          <item.icon className="w-5 h-5 text-inherit" />
                        </Button>
                      </Link>
                    </motion.div>
                  );
                })}

                {/* Pro icon removed from the top cluster to place it above profile */}
              </div>

              {/* spacer to push bottom */}
              <div className="flex-1" />

              {/* bottom: Go Pro above avatar + avatar + logout */}
              <div className="flex flex-col items-center pb-4 space-y-3 relative z-10">
                {/* Go Pro above profile (only if not pro) */}
                {!loading && !isPro && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goToPlans}
                    className="w-11 h-11 rounded-xl transition-all duration-200 bg-gradient-to-br from-yellow-500 via-amber-500 to-orange-500 text-white shadow-lg border border-yellow-400/60"
                    title="Go Pro"
                  >
                    <Sparkles className="w-5 h-5" />
                  </Button>
                )}
                <Link href="/profile">
                  <Button variant="ghost" size="sm" className="p-0 rounded-full hover:scale-105 transition-transform hover:shadow-lg">
                    <Avatar className="w-10 h-10 shadow-md ring-2 ring-sage-200/50 dark:ring-gray-600/50">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <AvatarFallback className="bg-gradient-to-br from-clay-400 via-sage-400 to-sand-400 dark:from-clay-500 dark:via-sage-500 dark:to-sand-500 text-white text-sm">
                          {String(displayName || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </Button>
                </Link>

                <Button
                  size="sm"
                  onClick={() => signOut()}
                  className="w-11 h-9 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl p-0 shadow-md transition-all duration-200 hover:shadow-lg"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE: full-screen right-side drawer */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40"
            onClick={toggleSidebar}
          />

          {/* panel without FocusTrap to avoid errors */}
          <motion.div
            ref={drawerRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="absolute inset-y-0 right-0 w-full bg-gradient-to-b from-white/95 via-sage-25/90 to-clay-50/95 dark:from-gray-950/95 dark:via-gray-900/90 dark:to-gray-950/95 overflow-auto"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
          >
              <div className="p-4 pt-6">
                <div className="flex items-center justify-between">
                  <div />
                  <Button
                    onClick={toggleSidebar}
                    variant="ghost"
                    size="sm"
                    className="text-clay-600 dark:text-sand-300 p-2 w-12 h-12 rounded-xl"
                    aria-label="Close menu"
                    data-close-button
                  >
                    <X size={20} />
                  </Button>
                </div>

                <div className="mt-6 space-y-4">
                  {navigationItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActivePage(item.href);
                    return (
                      <Link key={item.id} href={item.href} onClick={() => setIsOpen(false)}>
                        <div
                          className={[
                            "rounded-xl p-4 border transition-all duration-200",
                            active
                              ? "bg-gradient-to-r from-sage-500/90 via-clay-500/90 to-sand-500/90 text-white"
                              : "bg-white/90 dark:bg-gray-900/90 border-sage-200/60 dark:border-gray-700/80"
                          ].join(" ")}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${item.gradient} flex items-center justify-center`}>
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex flex-col text-left">
                              <span className={`font-sans text-base font-medium ${active ? 'text-white' : 'text-clay-700 dark:text-sand-200'}`}>{item.label}</span>
                              <span className={`text-sm ${active ? 'text-white/90' : 'text-clay-500 dark:text-sand-400'}`}>{item.description}</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* bottom user + signout */}
                <div className="mt-8 border-t pt-6">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 shadow-md">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <AvatarFallback className="bg-gradient-to-br from-clay-400 via-sage-400 to-sand-400 text-white text-sm">
                          {String(displayName || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1">
                      <div className="text-clay-700 dark:text-sand-200 font-medium">{displayName}</div>
                      <div className="text-sm text-clay-500 dark:text-sand-400">{user?.email || ''}</div>
                    </div>
                    <Button onClick={() => signOut()} className="bg-red-500 text-white rounded-xl px-3 py-2">Sign out</Button>
                  </div>
                </div>
              </div>
            </motion.div>
        </div>
      )}
    </>
  );
}
