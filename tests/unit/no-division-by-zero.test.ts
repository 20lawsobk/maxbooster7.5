import { Linter, type Rule } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "../../eslint-rules/no-division-by-zero.js";

const linter = new Linter();
function errors(code: string) {
  return linter.verify(code, [{
    languageOptions: { ecmaVersion: 2024, sourceType: "module" },
    plugins: { safety: { rules: { division: rule as Rule.RuleModule } } },
    rules: { "safety/division": "error" },
  }]);
}

describe("division zero guards", () => {
  it.each([
    'const average = scores.length > 0 ? `${(scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(0)}%` : "Not available";',
    "const average = 0 < scores.length ? sum / scores.length : 0;",
    "const average = count > 0 ? sum / count : 0;",
    "const average = sum / (scores.length || 1);",
  ])("accepts an explicit positive guard: %s", code => {
    expect(errors(code)).toEqual([]);
  });

  it.each([
    "const average = sum / scores.length;",
    "const average = other.length > 0 ? sum / scores.length : 0;",
    "const average = scores.length > 0 ? 0 : sum / scores.length;",
    "const average = scores.length >= 0 ? sum / scores.length : 0;",
    "const average = scores.length < 0 ? sum / scores.length : 0;",
    "const average = scores.length > 0 ? () => sum / scores.length : null;",
    "const average = count > 0 ? 0 : sum / count;",
    "const average = count > 0 ? (count = 0, sum / count) : 0;",
    "const average = count > 0 ? (count--, sum / count) : 0;",
  ])("keeps unsafe divisions blocked: %s", code => {
    expect(errors(code)).toHaveLength(1);
    expect(errors(code)[0].ruleId).toBe("safety/division");
  });
});
