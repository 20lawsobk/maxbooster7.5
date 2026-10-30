import { useLocation, Link } from "wouter";
import { LayoutDashboard, Disc, ShoppingBag, Share2, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  onMoreClick: () => void;
}

const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Studio", path: "/studio", icon: Disc },
  { label: "Market", path: "/marketplace", icon: ShoppingBag },
  { label: "Social", path: "/social-media", icon: Share2 },
];

export function MobileBottomNav({ onMoreClick }: MobileBottomNavProps) {
  const [location] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            location === item.path || location.startsWith(item.path + "/");

          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors",
                isActive ? "text-primary" : "text-gray-500 dark:text-gray-400",
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "scale-110")} />
              <span className="text-[10px] font-medium leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-gray-500 dark:text-gray-400 transition-colors"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}
