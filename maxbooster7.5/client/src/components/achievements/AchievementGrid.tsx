import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Filter, TrendingUp, Award } from "lucide-react";
import { AchievementBadge } from "./AchievementBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Achievement {
  id: string;
  name: string;
  description: string | null;
  category: string;
  iconUrl: string | null;
  points: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  progress: number;
  unlocked: boolean;
  unlockedAt: Date | null;
}

const categories = [
  { id: "all", label: "All", icon: Trophy },
  { id: "streaming", label: "Streaming", icon: TrendingUp },
  { id: "sales", label: "Sales", icon: Award },
  { id: "social", label: "Social", icon: Trophy },
  { id: "streak", label: "Streaks", icon: Trophy },
  { id: "milestone", label: "Milestones", icon: Trophy },
];

export function AchievementGrid() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [showOnlyLocked, setShowOnlyLocked] = useState(false);

  const { data: achievements, isLoading } = useQuery<Achievement[]>({
    queryKey: ["/api/achievements/user"],
  });

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 sm:grid-cols-6 md:grid-cols-8">
            {[...Array(12)].map((_, i) => (
              <Skeleton key={i} className="w-16 h-16 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const filteredAchievements = achievements?.filter((a) => {
    if (activeCategory !== "all" && a.category !== activeCategory) return false;
    if (showOnlyLocked && a.unlocked) return false;
    return true;
  });

  const unlockedCount = achievements?.filter((a) => a.unlocked).length || 0;
  const totalCount = achievements?.length || 0;
  const totalPoints = achievements
    ?.filter((a) => a.unlocked)
    .reduce((sum, a) => sum + a.points, 0) || 0;

  const groupedByTier = {
    platinum: filteredAchievements?.filter((a) => a.tier === "platinum") || [],
    gold: filteredAchievements?.filter((a) => a.tier === "gold") || [],
    silver: filteredAchievements?.filter((a) => a.tier === "silver") || [],
    bronze: filteredAchievements?.filter((a) => a.tier === "bronze") || [],
  };

  return (
    <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Achievements
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-500">
                {totalPoints} pts
              </Badge>
              <span className="text-muted-foreground">
                {unlockedCount}/{totalCount} unlocked
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOnlyLocked(!showOnlyLocked)}
              className={cn(showOnlyLocked && "bg-primary/10")}
            >
              <Filter className="w-4 h-4 mr-1" />
              {showOnlyLocked ? "All" : "Locked Only"}
            </Button>
          </div>
        </div>
        <Progress
          value={(unlockedCount / Math.max(totalCount, 1)) * 100}
          className="h-2"
        />
      </CardHeader>
      <CardContent>
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            {categories.map((cat) => (
              <TabsTrigger key={cat.id} value={cat.id} className="gap-1">
                <cat.icon className="w-3 h-3" />
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeCategory} className="space-y-6">
            {Object.entries(groupedByTier).map(([tier, tierAchievements]) => {
              if (tierAchievements.length === 0) return null;
              
              return (
                <motion.div
                  key={tier}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3 className="text-sm font-semibold mb-3 capitalize flex items-center gap-2">
                    <span
                      className={cn(
                        "w-3 h-3 rounded-full",
                        tier === "platinum" && "bg-cyan-400",
                        tier === "gold" && "bg-yellow-400",
                        tier === "silver" && "bg-gray-400",
                        tier === "bronze" && "bg-orange-600"
                      )}
                    />
                    {tier} Tier
                    <span className="text-muted-foreground font-normal">
                      ({tierAchievements.filter((a) => a.unlocked).length}/
                      {tierAchievements.length})
                    </span>
                  </h3>
                  <div className="grid grid-cols-4 gap-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                    {tierAchievements.map((achievement) => (
                      <AchievementBadge
                        key={achievement.id}
                        name={achievement.name}
                        description={achievement.description}
                        iconUrl={achievement.iconUrl}
                        tier={achievement.tier}
                        category={achievement.category}
                        points={achievement.points}
                        progress={achievement.progress}
                        unlocked={achievement.unlocked}
                        unlockedAt={achievement.unlockedAt}
                      />
                    ))}
                  </div>
                </motion.div>
              );
            })}

            {filteredAchievements?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No achievements found in this category</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
