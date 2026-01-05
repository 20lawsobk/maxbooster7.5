import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Circle,
  Calendar,
  ListTodo,
  Clock,
  AlertCircle,
  Sparkles,
  Plus,
} from "lucide-react";

interface Task {
  id: string;
  task: string;
  dueDate: string | null;
  completedAt: string | null;
  category: string | null;
  order: number;
}

interface ReleaseChecklistProps {
  countdownId: string;
  tasks: Task[];
  isLoading?: boolean;
  onAddTask?: () => void;
}

const categoryLabels: Record<string, { label: string; color: string }> = {
  "4_weeks": { label: "4 Weeks Out", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  "3_weeks": { label: "3 Weeks Out", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  "2_weeks": { label: "2 Weeks Out", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  "1_week": { label: "1 Week Out", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  release_day: { label: "Release Day", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  post_release: { label: "Post Release", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
};

export function ReleaseChecklist({ countdownId, tasks, isLoading, onAddTask }: ReleaseChecklistProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/countdowns/${countdownId}/tasks/${taskId}`, {
        completed,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/countdowns/${countdownId}`] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const completedCount = tasks.filter((t) => t.completedAt).length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const groupedTasks = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const category = task.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(task);
    return acc;
  }, {});

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const isDueSoon = (dueDate: string | null) => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const now = new Date();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    return due > now && due.getTime() - now.getTime() < threeDays;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-primary" />
            <CardTitle>Pre-Release Checklist</CardTitle>
          </div>
          {onAddTask && (
            <Button variant="outline" size="sm" onClick={onAddTask}>
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>
          )}
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {completedCount} of {totalCount} tasks completed
            </span>
            <span className="text-sm font-medium text-primary">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(groupedTasks).map(([category, categoryTasks]) => {
          const categoryInfo = categoryLabels[category] || { label: category, color: "bg-gray-500/10 text-gray-500" };
          return (
            <div key={category} className="space-y-3">
              <Badge variant="outline" className={categoryInfo.color}>
                {categoryInfo.label}
              </Badge>
              <div className="space-y-2 pl-2">
                {categoryTasks.map((task) => {
                  const overdue = !task.completedAt && isOverdue(task.dueDate);
                  const dueSoon = !task.completedAt && !overdue && isDueSoon(task.dueDate);

                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                        task.completedAt
                          ? "bg-green-500/5 border border-green-500/10"
                          : overdue
                          ? "bg-red-500/5 border border-red-500/20"
                          : dueSoon
                          ? "bg-orange-500/5 border border-orange-500/20"
                          : "bg-muted/30 border border-transparent hover:border-primary/10"
                      }`}
                    >
                      <Checkbox
                        id={task.id}
                        checked={!!task.completedAt}
                        onCheckedChange={(checked) =>
                          toggleTaskMutation.mutate({ taskId: task.id, completed: checked as boolean })
                        }
                        disabled={toggleTaskMutation.isPending}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={task.id}
                          className={`text-sm cursor-pointer ${task.completedAt ? "line-through text-muted-foreground" : ""}`}
                        >
                          {task.task}
                        </label>
                        {task.dueDate && (
                          <div className="flex items-center gap-1 mt-1">
                            {overdue ? (
                              <AlertCircle className="h-3 w-3 text-red-500" />
                            ) : dueSoon ? (
                              <Clock className="h-3 w-3 text-orange-500" />
                            ) : (
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span
                              className={`text-xs ${
                                overdue ? "text-red-500" : dueSoon ? "text-orange-500" : "text-muted-foreground"
                              }`}
                            >
                              {new Date(task.dueDate).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                              {overdue && " (Overdue)"}
                              {dueSoon && " (Due Soon)"}
                            </span>
                          </div>
                        )}
                      </div>
                      {task.completedAt && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {tasks.length === 0 && (
          <div className="text-center py-8">
            <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No tasks yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Generate a pre-release checklist to get started
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReleaseChecklist;
