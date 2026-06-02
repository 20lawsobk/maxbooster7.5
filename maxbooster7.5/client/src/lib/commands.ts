export {
  getCommandRegistry,
  resetCommandRegistry,
  DEFAULT_COMMANDS,
  type Command,
  type CommandGroup,
  type CommandHistoryEntry,
  type CommandRegistry,
} from "./commands/CommandRegistry";

export {
  getShortcutManager,
  resetShortcutManager,
  DEFAULT_SHORTCUTS,
  type ShortcutManager,
} from "./shortcuts/ShortcutManager";

export {
  type ShortcutDefinition,
  type ShortcutConfig,
  type ShortcutContext,
  type ShortcutCategory,
  type ShortcutModifier,
  type ShortcutEvent,
  type ShortcutConflict,
  type PlatformModifiers,
  getPlatformModifiers,
  formatShortcutKeys,
  parseShortcutString,
  matchesShortcut,
} from "./shortcuts/types";

import { Command } from "./commands/CommandRegistry";

export const STUDIO_COMMANDS: Command[] = [
  {
    id: "studio.play",
    name: "Play",
    description: "Start playback",
    category: "transport",
    keywords: ["start", "playback"],
    shortcut: { key: " " },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-play"));
    },
    context: ["studio"],
  },
  {
    id: "studio.stop",
    name: "Stop",
    description: "Stop playback",
    category: "transport",
    keywords: ["halt", "pause"],
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-stop"));
    },
    context: ["studio"],
  },
  {
    id: "studio.record",
    name: "Record",
    description: "Toggle recording",
    category: "transport",
    keywords: ["arm", "recording"],
    shortcut: { key: "r" },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-record"));
    },
    context: ["studio"],
  },
  {
    id: "studio.loop",
    name: "Toggle Loop",
    description: "Enable/disable loop playback",
    category: "transport",
    keywords: ["repeat", "cycle"],
    shortcut: { key: "l" },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-loop"));
    },
    context: ["studio"],
  },
  {
    id: "studio.metronome",
    name: "Toggle Metronome",
    description: "Enable/disable metronome",
    category: "transport",
    keywords: ["click", "beat"],
    shortcut: { key: "m" },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-metronome"));
    },
    context: ["studio"],
  },
  {
    id: "studio.add-track",
    name: "Add Track",
    description: "Add a new track",
    category: "actions",
    keywords: ["create", "new", "track"],
    shortcut: { key: "t", modifiers: ["cmd"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-add-track"));
    },
    context: ["studio"],
  },
  {
    id: "studio.mixer",
    name: "Show Mixer",
    description: "Open the mixer panel",
    category: "view",
    keywords: ["mix", "console"],
    shortcut: { key: "m", modifiers: ["cmd"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-show-mixer"));
    },
    context: ["studio"],
  },
  {
    id: "studio.browser",
    name: "Show Browser",
    description: "Open the browser panel",
    category: "view",
    keywords: ["samples", "files"],
    shortcut: { key: "b", modifiers: ["cmd"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-show-browser"));
    },
    context: ["studio"],
  },
  {
    id: "studio.export",
    name: "Export Project",
    description: "Export current project",
    category: "file",
    keywords: ["bounce", "render", "save"],
    shortcut: { key: "e", modifiers: ["cmd", "shift"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-export"));
    },
    context: ["studio"],
  },
  {
    id: "studio.zoom-in",
    name: "Zoom In",
    description: "Zoom in on timeline",
    category: "view",
    keywords: ["magnify", "closer"],
    shortcut: { key: "=" },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-zoom-in"));
    },
    context: ["studio"],
  },
  {
    id: "studio.zoom-out",
    name: "Zoom Out",
    description: "Zoom out on timeline",
    category: "view",
    keywords: ["smaller", "farther"],
    shortcut: { key: "-" },
    action: () => {
      window.dispatchEvent(new CustomEvent("studio-zoom-out"));
    },
    context: ["studio"],
  },
];

export const SOCIAL_COMMANDS: Command[] = [
  {
    id: "social.new-post",
    name: "New Post",
    description: "Create a new social media post",
    category: "actions",
    keywords: ["create", "publish"],
    shortcut: { key: "n" },
    action: () => {
      window.dispatchEvent(new CustomEvent("social-new-post"));
    },
    context: ["social"],
  },
  {
    id: "social.schedule",
    name: "Schedule Post",
    description: "Schedule a post for later",
    category: "actions",
    keywords: ["later", "queue", "plan"],
    shortcut: { key: "s" },
    action: () => {
      window.dispatchEvent(new CustomEvent("social-schedule"));
    },
    context: ["social"],
  },
  {
    id: "social.calendar",
    name: "View Calendar",
    description: "Open content calendar",
    category: "navigation",
    keywords: ["planner", "dates"],
    shortcut: { key: "c" },
    action: () => {
      window.dispatchEvent(new CustomEvent("social-calendar"));
    },
    context: ["social"],
  },
  {
    id: "social.analytics",
    name: "Social Analytics",
    description: "View social media analytics",
    category: "navigation",
    keywords: ["stats", "metrics", "performance"],
    shortcut: { key: "a" },
    action: () => {
      window.dispatchEvent(new CustomEvent("social-analytics"));
    },
    context: ["social"],
  },
  {
    id: "social.inbox",
    name: "Unified Inbox",
    description: "Open unified social inbox",
    category: "navigation",
    keywords: ["messages", "dms", "comments"],
    shortcut: { key: "i" },
    action: () => {
      window.dispatchEvent(new CustomEvent("social-inbox"));
    },
    context: ["social"],
  },
  {
    id: "social.connect-platform",
    name: "Connect Platform",
    description: "Connect a new social platform",
    category: "actions",
    keywords: ["add", "link", "account"],
    action: () => {
      window.dispatchEvent(new CustomEvent("social-connect"));
    },
    context: ["social"],
  },
  {
    id: "social.preview",
    name: "Preview Post",
    description: "Preview current post before publishing",
    category: "actions",
    keywords: ["preview", "view", "check"],
    shortcut: { key: "p" },
    action: () => {
      window.dispatchEvent(new CustomEvent("social-preview"));
    },
    context: ["social"],
  },
];

export const DISTRIBUTION_COMMANDS: Command[] = [
  {
    id: "distribution.new-release",
    name: "New Release",
    description: "Create a new release",
    category: "actions",
    keywords: ["create", "publish", "album", "single"],
    shortcut: { key: "n" },
    action: () => {
      window.location.href = "/distribution";
    },
    context: ["distribution"],
  },
  {
    id: "distribution.status",
    name: "Release Status",
    description: "Check release status",
    category: "navigation",
    keywords: ["progress", "tracking"],
    action: () => {
      window.dispatchEvent(new CustomEvent("distribution-status"));
    },
    context: ["distribution"],
  },
  {
    id: "distribution.metadata",
    name: "Edit Metadata",
    description: "Edit release metadata",
    category: "actions",
    keywords: ["info", "details", "edit"],
    shortcut: { key: "e" },
    action: () => {
      window.dispatchEvent(new CustomEvent("distribution-edit-metadata"));
    },
    context: ["distribution"],
  },
  {
    id: "distribution.artwork",
    name: "Upload Artwork",
    description: "Upload release artwork",
    category: "actions",
    keywords: ["cover", "image", "art"],
    action: () => {
      window.dispatchEvent(new CustomEvent("distribution-upload-artwork"));
    },
    context: ["distribution"],
  },
  {
    id: "distribution.submit",
    name: "Submit Release",
    description: "Submit release for distribution",
    category: "actions",
    keywords: ["publish", "send", "confirm"],
    shortcut: { key: "Enter", modifiers: ["cmd"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("distribution-submit"));
    },
    context: ["distribution"],
  },
];

export const MARKETPLACE_COMMANDS: Command[] = [
  {
    id: "marketplace.search",
    name: "Search Beats",
    description: "Search for beats and samples",
    category: "search",
    keywords: ["find", "beats", "samples", "browse"],
    shortcut: { key: "f", modifiers: ["cmd"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("marketplace-search"));
    },
    context: ["marketplace"],
  },
  {
    id: "marketplace.upload",
    name: "Upload Beat",
    description: "Upload a beat to sell",
    category: "actions",
    keywords: ["sell", "list", "add"],
    shortcut: { key: "u" },
    action: () => {
      window.dispatchEvent(new CustomEvent("marketplace-upload"));
    },
    context: ["marketplace"],
  },
  {
    id: "marketplace.my-beats",
    name: "My Listings",
    description: "View your listed beats",
    category: "navigation",
    keywords: ["my", "listings", "beats"],
    action: () => {
      window.dispatchEvent(new CustomEvent("marketplace-my-beats"));
    },
    context: ["marketplace"],
  },
  {
    id: "marketplace.cart",
    name: "View Cart",
    description: "Open shopping cart",
    category: "navigation",
    keywords: ["cart", "checkout", "buy"],
    shortcut: { key: "c" },
    action: () => {
      window.dispatchEvent(new CustomEvent("marketplace-view-cart"));
    },
    context: ["marketplace"],
  },
  {
    id: "marketplace.favorites",
    name: "View Favorites",
    description: "View saved favorites",
    category: "navigation",
    keywords: ["favorites", "saved", "liked"],
    shortcut: { key: "f" },
    action: () => {
      window.dispatchEvent(new CustomEvent("marketplace-favorites"));
    },
    context: ["marketplace"],
  },
  {
    id: "marketplace.filters",
    name: "Toggle Filters",
    description: "Show/hide search filters",
    category: "view",
    keywords: ["filter", "genre", "bpm", "key"],
    action: () => {
      window.dispatchEvent(new CustomEvent("marketplace-toggle-filters"));
    },
    context: ["marketplace"],
  },
];

export const DASHBOARD_COMMANDS: Command[] = [
  {
    id: "dashboard.quick-stats",
    name: "Quick Stats",
    description: "View performance overview",
    category: "view",
    keywords: ["stats", "overview", "summary"],
    shortcut: { key: "s" },
    action: () => {
      window.dispatchEvent(new CustomEvent("dashboard-show-stats"));
    },
    context: ["dashboard"],
  },
  {
    id: "dashboard.refresh",
    name: "Refresh Data",
    description: "Refresh dashboard data",
    category: "actions",
    keywords: ["refresh", "reload", "update"],
    shortcut: { key: "r", modifiers: ["cmd"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("dashboard-refresh"));
    },
    context: ["dashboard"],
  },
  {
    id: "dashboard.notifications",
    name: "Notifications",
    description: "View notifications",
    category: "navigation",
    keywords: ["alerts", "messages", "inbox"],
    shortcut: { key: "n" },
    action: () => {
      window.dispatchEvent(new CustomEvent("open-notifications"));
    },
    context: ["dashboard"],
  },
  {
    id: "dashboard.new-project",
    name: "New Project",
    description: "Create a new project",
    category: "actions",
    keywords: ["create", "new", "start"],
    shortcut: { key: "n", modifiers: ["cmd"] },
    action: () => {
      window.location.href = "/studio";
    },
    context: ["dashboard"],
  },
  {
    id: "dashboard.upload",
    name: "Upload",
    description: "Upload a file",
    category: "actions",
    keywords: ["upload", "import", "add"],
    shortcut: { key: "u" },
    action: () => {
      window.dispatchEvent(new CustomEvent("open-upload-dialog"));
    },
    context: ["dashboard"],
  },
];

export const ANALYTICS_COMMANDS: Command[] = [
  {
    id: "analytics.date-range",
    name: "Change Date Range",
    description: "Select analytics date range",
    category: "actions",
    keywords: ["date", "period", "range", "time"],
    shortcut: { key: "d" },
    action: () => {
      window.dispatchEvent(new CustomEvent("analytics-date-range"));
    },
    context: ["analytics"],
  },
  {
    id: "analytics.export",
    name: "Export Report",
    description: "Export analytics report",
    category: "actions",
    keywords: ["export", "download", "pdf", "csv"],
    shortcut: { key: "e" },
    action: () => {
      window.dispatchEvent(new CustomEvent("analytics-export"));
    },
    context: ["analytics"],
  },
  {
    id: "analytics.compare",
    name: "Compare Periods",
    description: "Compare different time periods",
    category: "view",
    keywords: ["compare", "versus", "vs"],
    action: () => {
      window.dispatchEvent(new CustomEvent("analytics-compare"));
    },
    context: ["analytics"],
  },
  {
    id: "analytics.refresh",
    name: "Refresh Data",
    description: "Refresh analytics data",
    category: "actions",
    keywords: ["refresh", "reload", "update"],
    shortcut: { key: "r" },
    action: () => {
      window.dispatchEvent(new CustomEvent("analytics-refresh"));
    },
    context: ["analytics"],
  },
];

export const NAVIGATION_COMMANDS: Command[] = [
  {
    id: "nav.dashboard",
    name: "Go to Dashboard",
    description: "Navigate to dashboard",
    category: "navigation",
    keywords: ["home", "main", "overview"],
    shortcut: { key: "h", modifiers: ["alt"] },
    action: () => {
      window.location.href = "/dashboard";
    },
    context: ["global"],
  },
  {
    id: "nav.studio",
    name: "Go to Studio",
    description: "Open the music studio",
    category: "navigation",
    keywords: ["daw", "music", "create", "record"],
    shortcut: { key: "s", modifiers: ["alt"] },
    action: () => {
      window.location.href = "/studio";
    },
    context: ["global"],
  },
  {
    id: "nav.projects",
    name: "Go to Projects",
    description: "View all projects",
    category: "navigation",
    keywords: ["songs", "tracks", "library"],
    shortcut: { key: "p", modifiers: ["alt"] },
    action: () => {
      window.location.href = "/projects";
    },
    context: ["global"],
  },
  {
    id: "nav.analytics",
    name: "Go to Analytics",
    description: "View streaming analytics",
    category: "navigation",
    keywords: ["stats", "metrics", "streams"],
    shortcut: { key: "a", modifiers: ["alt"] },
    action: () => {
      window.location.href = "/analytics";
    },
    context: ["global"],
  },
  {
    id: "nav.distribution",
    name: "Go to Distribution",
    description: "Manage releases",
    category: "navigation",
    keywords: ["release", "publish", "dsp"],
    shortcut: { key: "d", modifiers: ["alt"] },
    action: () => {
      window.location.href = "/distribution";
    },
    context: ["global"],
  },
  {
    id: "nav.social",
    name: "Go to Social Media",
    description: "Manage social media",
    category: "navigation",
    keywords: ["post", "twitter", "instagram"],
    action: () => {
      window.location.href = "/social-media";
    },
    context: ["global"],
  },
  {
    id: "nav.marketplace",
    name: "Go to Marketplace",
    description: "Browse beats",
    category: "navigation",
    keywords: ["beats", "samples", "shop"],
    shortcut: { key: "m", modifiers: ["alt"] },
    action: () => {
      window.location.href = "/marketplace";
    },
    context: ["global"],
  },
  {
    id: "nav.royalties",
    name: "Go to Royalties",
    description: "View earnings",
    category: "navigation",
    keywords: ["earnings", "money", "payments"],
    shortcut: { key: "r", modifiers: ["alt"] },
    action: () => {
      window.location.href = "/royalties";
    },
    context: ["global"],
  },
  {
    id: "nav.settings",
    name: "Go to Settings",
    description: "Open settings",
    category: "navigation",
    keywords: ["preferences", "account", "config"],
    shortcut: { key: ",", modifiers: ["cmd"] },
    action: () => {
      window.location.href = "/settings";
    },
    context: ["global"],
  },
];

export const GLOBAL_ACTION_COMMANDS: Command[] = [
  {
    id: "action.new-project",
    name: "New Project",
    description: "Create a new music project",
    category: "actions",
    keywords: ["create", "start", "song"],
    shortcut: { key: "n", modifiers: ["cmd"] },
    action: () => {
      window.location.href = "/studio";
    },
    context: ["global"],
  },
  {
    id: "action.upload",
    name: "Upload File",
    description: "Upload audio or files",
    category: "actions",
    keywords: ["import", "add", "audio"],
    shortcut: { key: "u", modifiers: ["cmd"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("open-upload-dialog"));
    },
    context: ["global"],
  },
  {
    id: "action.search",
    name: "Search",
    description: "Global search",
    category: "search",
    keywords: ["find", "search", "lookup"],
    shortcut: { key: "f", modifiers: ["cmd"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("open-global-search"));
    },
    context: ["global"],
  },
  {
    id: "action.toggle-theme",
    name: "Toggle Theme",
    description: "Switch dark/light mode",
    category: "settings",
    keywords: ["dark", "light", "mode"],
    action: () => {
      window.dispatchEvent(new CustomEvent("toggle-theme"));
    },
    context: ["global"],
  },
  {
    id: "action.shortcuts-help",
    name: "Keyboard Shortcuts",
    description: "View all shortcuts",
    category: "help",
    keywords: ["help", "keys", "hotkeys"],
    shortcut: { key: "/", modifiers: ["cmd"] },
    action: () => {
      window.dispatchEvent(new CustomEvent("open-shortcuts-guide"));
    },
    context: ["global"],
  },
];

export const ALL_COMMANDS: Command[] = [
  ...NAVIGATION_COMMANDS,
  ...GLOBAL_ACTION_COMMANDS,
  ...STUDIO_COMMANDS,
  ...SOCIAL_COMMANDS,
  ...DISTRIBUTION_COMMANDS,
  ...MARKETPLACE_COMMANDS,
  ...DASHBOARD_COMMANDS,
  ...ANALYTICS_COMMANDS,
];

export function getCommandsByCategory(category: string): Command[] {
  return ALL_COMMANDS.filter((cmd) => cmd.category === category);
}

export function getCommandsByContext(context: string): Command[] {
  return ALL_COMMANDS.filter((cmd) => {
    if (!cmd.context) return true;
    return cmd.context.includes(context) || cmd.context.includes("global");
  });
}
