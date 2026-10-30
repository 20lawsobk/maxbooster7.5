export type ToolostApiEnvironment = "production" | "sandbox";

export function getToolostApiEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ToolostApiEnvironment {
  const selected = env.TOOLOST_ENVIRONMENT?.trim();
  if (!selected) return "production";
  if (selected === "sandbox" || selected === "production") return selected;
  throw new Error(
    "TOOLOST_ENVIRONMENT must be either 'sandbox' or 'production'.",
  );
}
