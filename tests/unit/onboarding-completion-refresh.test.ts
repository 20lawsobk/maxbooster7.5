import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(), props: {} as Record<string, () => Promise<void>> }));
vi.mock("wouter", () => ({ useLocation: () => ["/onboarding", state.navigate] }));
vi.mock("@/hooks/useRequireAuth", () => ({ useRequireAuth: () => ({ user: { id: "owner", onboardingCompleted: false }, isLoading: false }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/onboarding/OnboardingWizard", () => ({ default: (props: Record<string, () => Promise<void>>) => { state.props = props; return null; } }));
import Onboarding from "../../client/src/pages/Onboarding";

it.each(["onComplete", "onSkip"])("refreshes account and onboarding state before %s navigates", async action => {
  state.navigate.mockReset(); state.invalidate.mockReset();
  let release: () => void = () => {};
  state.invalidate.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
  renderToStaticMarkup(React.createElement(Onboarding));
  const completing = state.props[action]();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.invalidate.mock.calls.map(call => call[0].queryKey[0])).toEqual(["/api/auth/me", "/api/auth/onboarding-status"]);
  release(); await completing;
  expect(state.navigate).toHaveBeenCalledWith("/dashboard");
});
