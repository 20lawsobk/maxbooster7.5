import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  useCareerStageGuidance,
  CareerGuidance,
} from "@/hooks/useRecommendations";
import { useUserPreferences, CareerStage } from "@/hooks/useUserPreferences";
import { useLocation } from "wouter";
import {
  Compass,
  Target,
  CheckCircle,
  Circle,
  ExternalLink,
  ChevronRight,
  Star,
  Rocket,
  Crown,
  Award,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

const stageIcons: Record<CareerStage, React.ElementType> = {
  emerging: Star,
  developing: TrendingUp,
  established: Award,
  professional: Crown,
};

const stageColors: Record<CareerStage, string> = {
  emerging: "from-green-500 to-emerald-600",
  developing: "from-blue-500 to-indigo-600",
  established: "from-purple-500 to-violet-600",
  professional: "from-amber-500 to-orange-600",
};

const stageLabels: Record<CareerStage, string> = {
  emerging: "Emerging Artist",
  developing: "Developing Artist",
  established: "Established Artist",
  professional: "Professional Artist",
};

interface CareerStageGuidanceProps {
  showHeader?: boolean;
  expanded?: boolean;
}

export function CareerStageGuidance({
  showHeader = true,
  expanded = false,
}: CareerStageGuidanceProps) {
  const { guidance, isLoading } = useCareerStageGuidance();
  const { preferences } = useUserPreferences();
  const [, setLocation] = useLocation();

  if (isLoading || !guidance) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Compass className="h-5 w-5" />
              Career Guidance
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-4">
            <div className="h-12 bg-muted animate-pulse rounded-lg" />
            <div className="h-32 bg-muted animate-pulse rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const stage = guidance.stage;
  const StageIcon = stageIcons[stage];

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Compass className="h-5 w-5" />
              Career Guidance
            </CardTitle>
            <Badge
              className={`bg-gradient-to-r ${stageColors[stage]} text-white border-0`}
            >
              <StageIcon className="h-3 w-3 mr-1" />
              {stageLabels[stage]}
            </Badge>
          </div>
        </CardHeader>
      )}
      <CardContent className={showHeader ? "" : "pt-6"}>
        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Current Focus Areas
            </h4>
            <ul className="space-y-2">
              {guidance.currentFocus.map((focus, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <div
                    className={`h-2 w-2 rounded-full mt-1.5 bg-gradient-to-r ${stageColors[stage]}`}
                  />
                  {focus}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Rocket className="h-4 w-4 text-muted-foreground" />
              Next Milestones
            </h4>
            <ul className="space-y-2">
              {guidance.nextMilestones.map((milestone, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm p-2 rounded-lg bg-muted/50"
                >
                  <Circle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span>{milestone}</span>
                </li>
              ))}
            </ul>
          </div>

          {expanded && (
            <>
              <div>
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  Suggested Actions
                </h4>
                <ul className="space-y-2">
                  {guidance.suggestedActions.map((action, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <Circle className="h-3 w-3 text-muted-foreground" />
                        {action}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  Recommended Resources
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {guidance.resources.map((resource, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="justify-start h-auto py-2"
                      onClick={() => setLocation(resource.link)}
                    >
                      <span className="truncate">{resource.title}</span>
                      <ArrowRight className="h-3 w-3 ml-auto flex-shrink-0" />
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          {!expanded && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/career-coach")}
            >
              View Full Career Roadmap
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CareerStageIndicator() {
  const { guidance } = useCareerStageGuidance();

  if (!guidance) return null;

  const stage = guidance.stage;
  const StageIcon = stageIcons[stage];
  const stages: CareerStage[] = [
    "emerging",
    "developing",
    "established",
    "professional",
  ];
  const currentIndex = stages.indexOf(stage);
  const progressPercent = ((currentIndex + 1) / stages.length) * 100;

  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`p-2 rounded-full bg-gradient-to-r ${stageColors[stage]}`}
          >
            <StageIcon className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-medium text-sm">{stageLabels[stage]}</p>
            <p className="text-xs text-muted-foreground">Career Stage</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {currentIndex + 1}/{stages.length}
        </Badge>
      </div>
      <Progress value={progressPercent} className="h-2" />
      <div className="flex justify-between mt-2">
        {stages.map((s, i) => (
          <span
            key={s}
            className={`text-xs ${i <= currentIndex ? "text-foreground" : "text-muted-foreground"}`}
          >
            {s.charAt(0).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

export default CareerStageGuidance;
