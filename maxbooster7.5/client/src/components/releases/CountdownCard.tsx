import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, Music, ArrowRight, Rocket, Calendar } from "lucide-react";
import { useLocation } from "wouter";

interface CountdownCardProps {
  id: string;
  title: string;
  releaseDate: string;
  artworkUrl?: string | null;
  status: string;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  timeRemaining: {
    days: number;
    hours: number;
    minutes: number;
    isReleased: boolean;
  };
  presaveCount?: number;
  compact?: boolean;
}

export function CountdownCard({
  id,
  title,
  releaseDate,
  artworkUrl,
  status,
  progress,
  timeRemaining,
  presaveCount,
  compact = false,
}: CountdownCardProps) {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    setLocation(`/releases/countdown/${id}`);
  };

  if (compact) {
    return (
      <Card
        className="cursor-pointer hover:border-primary/50 transition-all"
        onClick={handleClick}
      >
        <CardContent className="p-4 flex items-center gap-4">
          {artworkUrl ? (
            <img src={artworkUrl} alt={title} className="w-12 h-12 rounded object-cover" />
          ) : (
            <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center">
              <Music className="h-6 w-6 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{title}</h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" />
              {timeRemaining.isReleased ? (
                <span className="text-green-500">Released!</span>
              ) : (
                <span>{timeRemaining.days}d {timeRemaining.hours}h</span>
              )}
            </div>
          </div>
          <Progress value={progress.percentage} className="w-20 h-2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden cursor-pointer hover:border-primary/50 transition-all group" onClick={handleClick}>
      <div className="relative h-32">
        {artworkUrl ? (
          <img src={artworkUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Music className="h-12 w-12 text-primary/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-white font-bold text-lg truncate">{title}</h3>
          <div className="flex items-center gap-1 text-white/80 text-sm">
            <Calendar className="h-3 w-3" />
            {new Date(releaseDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>
        {timeRemaining.isReleased && (
          <Badge className="absolute top-3 right-3 bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Live
          </Badge>
        )}
        {!timeRemaining.isReleased && status === "active" && (
          <Badge className="absolute top-3 right-3 bg-primary">
            <Rocket className="h-3 w-3 mr-1" />
            Active
          </Badge>
        )}
      </div>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            {timeRemaining.isReleased ? (
              <span className="font-medium text-green-500">Released!</span>
            ) : (
              <span className="font-medium">
                {timeRemaining.days}d {timeRemaining.hours}h {timeRemaining.minutes}m
              </span>
            )}
          </div>
          {presaveCount !== undefined && (
            <Badge variant="secondary">{presaveCount.toLocaleString()} pre-saves</Badge>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-muted-foreground">Checklist Progress</span>
            <span className="font-medium">
              {progress.completed}/{progress.total}
            </span>
          </div>
          <Progress value={progress.percentage} className="h-2" />
        </div>

        <Button variant="ghost" className="w-full group-hover:bg-primary/10 transition-colors">
          View Details
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default CountdownCard;
