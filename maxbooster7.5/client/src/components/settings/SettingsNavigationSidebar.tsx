import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User,
  Lock,
  Bell,
  Palette,
  Shield,
  Eye,
  CreditCard,
  Link as LinkIcon,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

export type SettingsSection =
  | "profile"
  | "account"
  | "notifications"
  | "preferences"
  | "security"
  | "privacy"
  | "billing"
  | "platforms";

interface NavigationItem {
  id: SettingsSection;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: {
    text: string;
    variant: "default" | "destructive" | "secondary" | "outline";
  };
}

interface SettingsNavigationSidebarProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  securityScore?: number;
  hasSecurityIssues?: boolean;
  hasPendingChanges?: boolean;
  connectedAccountsCount?: number;
}

export function SettingsNavigationSidebar({
  activeSection,
  onSectionChange,
  securityScore = 0,
  hasSecurityIssues = false,
  hasPendingChanges = false,
  connectedAccountsCount = 0,
}: SettingsNavigationSidebarProps) {
  const navigationItems: NavigationItem[] = [
    {
      id: "profile",
      label: "Profile",
      description: "Your public profile information",
      icon: <User className="h-4 w-4" />,
    },
    {
      id: "account",
      label: "Account",
      description: "Login and authentication",
      icon: <Lock className="h-4 w-4" />,
    },
    {
      id: "security",
      label: "Security",
      description: "Protect your account",
      icon: <Shield className="h-4 w-4" />,
      badge: hasSecurityIssues
        ? { text: "Action Needed", variant: "destructive" as const }
        : securityScore < 60
          ? { text: `${securityScore}%`, variant: "secondary" as const }
          : undefined,
    },
    {
      id: "notifications",
      label: "Notifications",
      description: "Email and push preferences",
      icon: <Bell className="h-4 w-4" />,
    },
    {
      id: "privacy",
      label: "Privacy",
      description: "Visibility and data controls",
      icon: <Eye className="h-4 w-4" />,
    },
    {
      id: "preferences",
      label: "Preferences",
      description: "Theme and studio defaults",
      icon: <Palette className="h-4 w-4" />,
    },
    {
      id: "billing",
      label: "Billing",
      description: "Subscription and payments",
      icon: <CreditCard className="h-4 w-4" />,
      badge: hasPendingChanges
        ? { text: "Update Required", variant: "destructive" as const }
        : undefined,
    },
    {
      id: "platforms",
      label: "Connected Accounts",
      description: "Linked services and platforms",
      icon: <LinkIcon className="h-4 w-4" />,
      badge:
        connectedAccountsCount > 0
          ? { text: `${connectedAccountsCount}`, variant: "secondary" as const }
          : undefined,
    },
  ];

  return (
    <aside className="w-64 flex-shrink-0">
      <div className="sticky top-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Manage your account preferences
          </p>
        </div>

        <ScrollArea className="h-[calc(100vh-200px)]">
          <nav className="space-y-1">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg text-left transition-all",
                  activeSection === item.id
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "hover:bg-muted/50 border border-transparent",
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "p-2 rounded-lg",
                      activeSection === item.id
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.label}</span>
                      {item.badge && (
                        <Badge
                          variant={item.badge.variant}
                          className="text-xs px-1.5 py-0 h-5"
                        >
                          {item.badge.variant === "destructive" && (
                            <AlertTriangle className="h-3 w-3 mr-1" />
                          )}
                          {item.badge.text}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform",
                    activeSection === item.id
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                />
              </button>
            ))}
          </nav>
        </ScrollArea>
      </div>
    </aside>
  );
}

export default SettingsNavigationSidebar;
