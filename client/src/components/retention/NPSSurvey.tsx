/**
 * NPS SURVEY COMPONENT
 *
 * Appears as a non-intrusive banner after 30 days of usage.
 * Industry standard: NPS 50+ correlates with 20% lower churn.
 * Collects score (0-10) and optional comment, submits to /api/retention/nps.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface NPSSurveyProps {
  triggerContext?: string;
  onDismiss: () => void;
  onSubmit: () => void;
}

export function NPSSurvey({
  triggerContext = "30_day",
  onDismiss,
  onSubmit,
}: NPSSurveyProps) {
  const [step, setStep] = useState<"score" | "comment" | "thanks">("score");
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  const mutation = useMutation({
    mutationFn: (data: {
      score: number;
      comment?: string;
      triggerContext: string;
    }) => apiRequest("POST", "/api/retention/nps", data),
    onSuccess: () => {
      setStep("thanks");
      setTimeout(onSubmit, 2500);
    },
  });

  const handleScoreSelect = (val: number) => {
    setScore(val);
    setStep("comment");
  };

  const handleSubmit = () => {
    if (score === null) return;
    mutation.mutate({
      score,
      comment: comment.trim() || undefined,
      triggerContext,
    });
  };

  const scoreLabel = (s: number) => {
    if (s >= 9) return "Extremely likely";
    if (s >= 7) return "Somewhat likely";
    if (s >= 5) return "Neutral";
    return "Not likely";
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Quick question
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss survey"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {step === "score" && (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                How likely are you to recommend Max Booster to a fellow artist
                or producer?
              </p>
              <div className="flex items-center gap-1 justify-between mb-2">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                  <button
                    key={val}
                    onClick={() => handleScoreSelect(val)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all border ${
                      val <= 6
                        ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                        : val <= 8
                          ? "border-yellow-200 text-yellow-600 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-950"
                          : "border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Not at all likely</span>
                <span>Extremely likely</span>
              </div>
            </>
          )}

          {step === "comment" && score !== null && (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                You selected{" "}
                <span className="font-bold text-purple-600">{score}/10</span> —{" "}
                {scoreLabel(score)}.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {score >= 9
                  ? "That's amazing! What do you love most about Max Booster?"
                  : score >= 7
                    ? "Thanks! What could we do to make it even better?"
                    : "We're sorry to hear that. What's not working for you?"}
              </p>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your thoughts (optional)"
                className="resize-none text-sm"
                rows={3}
                maxLength={2000}
              />
              <div className="flex gap-2 mt-3">
                <Button
                  onClick={handleSubmit}
                  disabled={mutation.isPending}
                  size="sm"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {mutation.isPending ? "Sending…" : "Submit feedback"}
                </Button>
                <Button variant="ghost" size="sm" onClick={onDismiss}>
                  Skip
                </Button>
              </div>
            </>
          )}

          {step === "thanks" && (
            <div className="text-center py-2">
              <p className="text-2xl mb-1">🙏</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Thank you for your feedback!
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Your response helps us build a better platform for artists.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
