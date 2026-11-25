import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  User,
  Users,
  Mic2,
  Building2,
  Disc,
  PenTool,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Play,
  BookOpen,
  Target,
  Lightbulb,
} from "lucide-react";

export type ArtistType =
  | "solo"
  | "band"
  | "producer"
  | "label"
  | "dj"
  | "songwriter";
export type CareerStage =
  | "emerging"
  | "developing"
  | "established"
  | "professional";

interface ArtistTypeRecommendationsProps {
  artistType: ArtistType;
  careerStage?: CareerStage;
  onActionClick?: (action: string, path: string) => void;
  showTutorials?: boolean;
}

interface FeatureHighlight {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  priority: number;
}

interface FirstAction {
  id: string;
  title: string;
  description: string;
  path: string;
  completed?: boolean;
  timeEstimate: string;
}

interface Tutorial {
  id: string;
  title: string;
  duration: string;
  level: "beginner" | "intermediate" | "advanced";
  thumbnail?: string;
}

const artistTypeIcons: Record<ArtistType, React.ElementType> = {
  solo: User,
  band: Users,
  producer: Mic2,
  label: Building2,
  dj: Disc,
  songwriter: PenTool,
};

const artistTypeLabels: Record<ArtistType, string> = {
  solo: "Solo Artist",
  band: "Band / Group",
  producer: "Producer",
  label: "Record Label",
  dj: "DJ",
  songwriter: "Songwriter",
};

const artistTypeDescriptions: Record<ArtistType, string> = {
  solo: "As a solo artist, you'll have tools to manage your releases, grow your fanbase, and track your career progress.",
  band: "Collaborate with your bandmates, manage shared projects, and coordinate your group's music career.",
  producer:
    "Sell beats, manage licensing, and connect with artists looking for production.",
  label:
    "Manage your artist roster, track royalties, and coordinate multiple releases.",
  dj: "Build your track library, promote events, and grow your following in the electronic music scene.",
  songwriter:
    "Track your songwriting royalties, submit to sync opportunities, and collaborate with artists.",
};

const featuresByArtistType: Record<ArtistType, FeatureHighlight[]> = {
  solo: [
    {
      id: "distribution",
      title: "Music Distribution",
      description: "Release to 150+ platforms",
      icon: Play,
      path: "/distribution",
      priority: 1,
    },
    {
      id: "social",
      title: "Social Media Manager",
      description: "Schedule posts across platforms",
      icon: Users,
      path: "/social",
      priority: 2,
    },
    {
      id: "analytics",
      title: "Analytics Dashboard",
      description: "Track your growth metrics",
      icon: Target,
      path: "/analytics",
      priority: 3,
    },
  ],
  band: [
    {
      id: "collaboration",
      title: "Team Collaboration",
      description: "Work together on projects",
      icon: Users,
      path: "/collaborations",
      priority: 1,
    },
    {
      id: "distribution",
      title: "Music Distribution",
      description: "Release to 150+ platforms",
      icon: Play,
      path: "/distribution",
      priority: 2,
    },
    {
      id: "splits",
      title: "Royalty Splits",
      description: "Fair revenue sharing",
      icon: Target,
      path: "/royalties",
      priority: 3,
    },
  ],
  producer: [
    {
      id: "marketplace",
      title: "Beat Marketplace",
      description: "Sell your beats online",
      icon: Mic2,
      path: "/marketplace",
      priority: 1,
    },
    {
      id: "studio",
      title: "Online Studio",
      description: "Create music in browser",
      icon: Play,
      path: "/studio",
      priority: 2,
    },
    {
      id: "licensing",
      title: "Licensing Manager",
      description: "Manage beat licenses",
      icon: Target,
      path: "/contracts",
      priority: 3,
    },
  ],
  label: [
    {
      id: "roster",
      title: "Artist Roster",
      description: "Manage your artists",
      icon: Building2,
      path: "/workspaces",
      priority: 1,
    },
    {
      id: "royalties",
      title: "Royalty Management",
      description: "Track all payments",
      icon: Target,
      path: "/royalties",
      priority: 2,
    },
    {
      id: "distribution",
      title: "Bulk Distribution",
      description: "Release multiple projects",
      icon: Play,
      path: "/distribution",
      priority: 3,
    },
  ],
  dj: [
    {
      id: "library",
      title: "Track Library",
      description: "Organize your music",
      icon: Disc,
      path: "/studio",
      priority: 1,
    },
    {
      id: "events",
      title: "Event Promotion",
      description: "Promote your gigs",
      icon: Users,
      path: "/social",
      priority: 2,
    },
    {
      id: "distribution",
      title: "Mix Distribution",
      description: "Share your sets",
      icon: Play,
      path: "/distribution",
      priority: 3,
    },
  ],
  songwriter: [
    {
      id: "sync",
      title: "Sync Opportunities",
      description: "Submit to TV/Film/Ads",
      icon: Play,
      path: "/distribution",
      priority: 1,
    },
    {
      id: "royalties",
      title: "Publishing Royalties",
      description: "Track your earnings",
      icon: Target,
      path: "/royalties",
      priority: 2,
    },
    {
      id: "collaborations",
      title: "Find Collaborators",
      description: "Connect with artists",
      icon: Users,
      path: "/collaborations",
      priority: 3,
    },
  ],
};

const firstActionsByArtistType: Record<ArtistType, FirstAction[]> = {
  solo: [
    {
      id: "profile",
      title: "Complete Your Profile",
      description: "Add bio and profile photo",
      path: "/settings",
      timeEstimate: "5 min",
    },
    {
      id: "connect-social",
      title: "Connect Social Accounts",
      description: "Link Instagram, TikTok, Twitter",
      path: "/settings?tab=connected-accounts",
      timeEstimate: "3 min",
    },
    {
      id: "upload-track",
      title: "Upload Your First Track",
      description: "Start your distribution journey",
      path: "/distribution",
      timeEstimate: "10 min",
    },
  ],
  band: [
    {
      id: "invite-members",
      title: "Invite Band Members",
      description: "Add your bandmates to collaborate",
      path: "/workspaces",
      timeEstimate: "5 min",
    },
    {
      id: "create-project",
      title: "Create a Project",
      description: "Start your first band project",
      path: "/projects",
      timeEstimate: "5 min",
    },
    {
      id: "set-splits",
      title: "Set Up Revenue Splits",
      description: "Configure fair royalty sharing",
      path: "/royalties",
      timeEstimate: "10 min",
    },
  ],
  producer: [
    {
      id: "storefront",
      title: "Set Up Your Storefront",
      description: "Create your beat selling page",
      path: "/storefront",
      timeEstimate: "15 min",
    },
    {
      id: "upload-beats",
      title: "Upload Your Beats",
      description: "List beats for sale",
      path: "/marketplace/sell",
      timeEstimate: "10 min",
    },
    {
      id: "set-pricing",
      title: "Configure Pricing",
      description: "Set license prices",
      path: "/settings?tab=pricing",
      timeEstimate: "5 min",
    },
  ],
  label: [
    {
      id: "add-artist",
      title: "Add Your First Artist",
      description: "Start building your roster",
      path: "/workspaces",
      timeEstimate: "5 min",
    },
    {
      id: "setup-contracts",
      title: "Set Up Contract Templates",
      description: "Create standard agreements",
      path: "/contracts",
      timeEstimate: "15 min",
    },
    {
      id: "connect-accounting",
      title: "Connect Accounting",
      description: "Set up royalty payments",
      path: "/settings?tab=billing",
      timeEstimate: "10 min",
    },
  ],
  dj: [
    {
      id: "build-library",
      title: "Build Your Library",
      description: "Organize your track collection",
      path: "/studio",
      timeEstimate: "15 min",
    },
    {
      id: "create-profile",
      title: "Create DJ Profile",
      description: "Showcase your style",
      path: "/settings",
      timeEstimate: "10 min",
    },
    {
      id: "upload-mix",
      title: "Upload a Mix",
      description: "Share your first set",
      path: "/distribution",
      timeEstimate: "10 min",
    },
  ],
  songwriter: [
    {
      id: "register-works",
      title: "Register Your Works",
      description: "Add your song catalog",
      path: "/projects",
      timeEstimate: "10 min",
    },
    {
      id: "set-publishing",
      title: "Configure Publishing",
      description: "Set up publishing info",
      path: "/royalties",
      timeEstimate: "10 min",
    },
    {
      id: "find-collaborators",
      title: "Browse Collaborators",
      description: "Connect with artists",
      path: "/collaborations",
      timeEstimate: "5 min",
    },
  ],
};

const tutorialsByArtistType: Record<ArtistType, Tutorial[]> = {
  solo: [
    {
      id: "getting-started",
      title: "Getting Started as a Solo Artist",
      duration: "5 min",
      level: "beginner",
    },
    {
      id: "first-release",
      title: "Your First Release",
      duration: "10 min",
      level: "beginner",
    },
    {
      id: "growing-fanbase",
      title: "Growing Your Fanbase",
      duration: "15 min",
      level: "intermediate",
    },
  ],
  band: [
    {
      id: "team-setup",
      title: "Setting Up Your Band",
      duration: "8 min",
      level: "beginner",
    },
    {
      id: "collaboration-tips",
      title: "Effective Collaboration",
      duration: "12 min",
      level: "intermediate",
    },
    {
      id: "revenue-sharing",
      title: "Managing Revenue Splits",
      duration: "10 min",
      level: "intermediate",
    },
  ],
  producer: [
    {
      id: "selling-beats",
      title: "Selling Beats Online",
      duration: "10 min",
      level: "beginner",
    },
    {
      id: "licensing-101",
      title: "Beat Licensing 101",
      duration: "15 min",
      level: "beginner",
    },
    {
      id: "marketing-beats",
      title: "Marketing Your Beats",
      duration: "12 min",
      level: "intermediate",
    },
  ],
  label: [
    {
      id: "label-setup",
      title: "Setting Up Your Label",
      duration: "15 min",
      level: "beginner",
    },
    {
      id: "artist-management",
      title: "Managing Artists",
      duration: "12 min",
      level: "intermediate",
    },
    {
      id: "distribution-strategy",
      title: "Distribution Strategy",
      duration: "10 min",
      level: "advanced",
    },
  ],
  dj: [
    {
      id: "dj-profile",
      title: "Building Your DJ Brand",
      duration: "10 min",
      level: "beginner",
    },
    {
      id: "event-promotion",
      title: "Promoting Your Events",
      duration: "12 min",
      level: "intermediate",
    },
    {
      id: "mix-distribution",
      title: "Distributing Your Mixes",
      duration: "8 min",
      level: "beginner",
    },
  ],
  songwriter: [
    {
      id: "publishing-basics",
      title: "Music Publishing Basics",
      duration: "12 min",
      level: "beginner",
    },
    {
      id: "sync-opportunities",
      title: "Getting Sync Placements",
      duration: "15 min",
      level: "intermediate",
    },
    {
      id: "co-writing",
      title: "Co-Writing Best Practices",
      duration: "10 min",
      level: "intermediate",
    },
  ],
};

export function ArtistTypeRecommendations({
  artistType,
  careerStage = "emerging",
  onActionClick,
  showTutorials = true,
}: ArtistTypeRecommendationsProps) {
  const ArtistIcon = artistTypeIcons[artistType];
  const features =
    featuresByArtistType[artistType] || featuresByArtistType.solo;
  const firstActions =
    firstActionsByArtistType[artistType] || firstActionsByArtistType.solo;
  const tutorials =
    tutorialsByArtistType[artistType] || tutorialsByArtistType.solo;

  const handleAction = (action: string, path: string) => {
    if (onActionClick) {
      onActionClick(action, path);
    }
  };

  const completedActions = firstActions.filter((a) => a.completed).length;
  const progressPercentage = (completedActions / (firstActions.length || 1)) * 100;

  return (
    <div className="space-y-6">
      <Card className="border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-white dark:bg-gray-900 shadow-md">
              <ArtistIcon className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                {artistTypeLabels[artistType]}
                <Badge variant="outline" className="ml-2">
                  {careerStage}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {artistTypeDescriptions[artistType]}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {features.map((feature) => (
          <Card
            key={feature.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => handleAction(feature.id, feature.path)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                  <feature.icon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    {feature.title}
                    <Sparkles className="h-3 w-3 text-yellow-500" />
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {feature.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-green-600" />
            First Steps
          </CardTitle>
          <div className="flex items-center gap-3 mt-2">
            <Progress value={progressPercentage} className="flex-1" />
            <span className="text-sm text-muted-foreground">
              {completedActions}/{firstActions.length} completed
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {firstActions.map((action) => (
              <div
                key={action.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  action.completed
                    ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                    : "hover:bg-muted/50"
                }`}
                onClick={() => handleAction(action.id, action.path)}
              >
                <div
                  className={`p-1.5 rounded-full ${
                    action.completed
                      ? "bg-green-100 dark:bg-green-900"
                      : "bg-muted"
                  }`}
                >
                  {action.completed ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Lightbulb className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <h5
                    className={`font-medium text-sm ${action.completed ? "line-through text-muted-foreground" : ""}`}
                  >
                    {action.title}
                  </h5>
                  <p className="text-xs text-muted-foreground">
                    {action.description}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {action.timeEstimate}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {showTutorials && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5 text-blue-600" />
              Recommended Tutorials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tutorials.map((tutorial) => (
                <Card
                  key={tutorial.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="aspect-video bg-muted rounded-lg mb-3 flex items-center justify-center">
                      <Play className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h5 className="font-medium text-sm">{tutorial.title}</h5>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {tutorial.duration}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          tutorial.level === "beginner"
                            ? "border-green-500 text-green-600"
                            : tutorial.level === "intermediate"
                              ? "border-yellow-500 text-yellow-600"
                              : "border-red-500 text-red-600"
                        }`}
                      >
                        {tutorial.level}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ArtistTypeRecommendations;
