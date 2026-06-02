/**
 * NPS SURVEY TRIGGER HOOK
 *
 * Determines when to show the in-app NPS survey.
 * Triggers after 30 days of account age, at most once every 90 days.
 * Stores dismissal/completion state in localStorage to avoid re-prompting.
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "nps_survey_state";
const DAYS_BEFORE_FIRST_SHOW = 30;
const DAYS_BETWEEN_SURVEYS = 90;

interface NPSSurveyState {
  lastShownAt: string | null;
  lastCompletedAt: string | null;
  dismissCount: number;
}

function getState(): NPSSurveyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as NPSSurveyState;
  } catch {}
  return { lastShownAt: null, lastCompletedAt: null, dismissCount: 0 };
}

function saveState(state: NPSSurveyState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function useNPSSurvey() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;

    const state = getState();
    const now = new Date();

    if (state.lastCompletedAt) {
      const completedAt = new Date(state.lastCompletedAt);
      const daysSinceComplete =
        (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceComplete < DAYS_BETWEEN_SURVEYS) return;
    }

    if (state.dismissCount >= 3) return;

    const accountCreated = user.createdAt
      ? new Date(user.createdAt as unknown as string)
      : null;
    if (!accountCreated) return;

    const accountAgeDays =
      (now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < DAYS_BEFORE_FIRST_SHOW) return;

    if (state.lastShownAt) {
      const shownAt = new Date(state.lastShownAt);
      const daysSinceShown =
        (now.getTime() - shownAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceShown < DAYS_BETWEEN_SURVEYS) return;
    }

    const delay = setTimeout(() => {
      saveState({ ...state, lastShownAt: now.toISOString() });
      setVisible(true);
    }, 15000);

    return () => clearTimeout(delay);
  }, [user]);

  const dismiss = () => {
    const state = getState();
    saveState({ ...state, dismissCount: state.dismissCount + 1 });
    setVisible(false);
  };

  const complete = () => {
    const state = getState();
    saveState({
      ...state,
      lastCompletedAt: new Date().toISOString(),
      dismissCount: 0,
    });
    setVisible(false);
  };

  return { visible, dismiss, complete };
}
