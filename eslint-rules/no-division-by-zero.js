/**
 * ESLint Rule: no-division-by-zero
 * Detects and prevents division-by-zero patterns in code
 * Catches: arr.reduce(...) / arr.length without guard
 */

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Detect potential division-by-zero operations",
      category: "Possible Errors",
      recommended: true,
    },
    fixable: "code",
    schema: [],
  },

  create(context) {
    function canChangeGuardedValue(expression) {
      if (["AssignmentExpression", "UpdateExpression", "AwaitExpression", "YieldExpression"].includes(expression.type)) return true;
      return (context.sourceCode.visitorKeys[expression.type] || []).some(key => {
        const value = expression[key];
        return Array.isArray(value)
          ? value.some(child => child && canChangeGuardedValue(child))
          : value && canChangeGuardedValue(value);
      });
    }
    // Recognize the positive branch of an explicit zero guard. Do not infer
    // safety from an unrelated condition, the opposite branch, or an outer
    // closure (which may execute after the guarded value has changed).
    function hasPositiveGuard(node) {
      const sourceCode = context.sourceCode;
      const divisor = sourceCode.getText(node.right);
      for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
        if (/Function/.test(parent.type)) return false;
        if (parent.type !== "ConditionalExpression" || parent.consequent !== child) continue;
        if (canChangeGuardedValue(parent.consequent)) continue;
        const test = parent.test;
        if (test.type !== "BinaryExpression") continue;
        const zero = expression => expression.type === "Literal" && expression.value === 0;
        if ((test.operator === ">" && zero(test.right) && sourceCode.getText(test.left) === divisor) ||
            (test.operator === "<" && zero(test.left) && sourceCode.getText(test.right) === divisor)) return true;
      }
      return false;
    }
    return {
      BinaryExpression(node) {
        // Check if this is a division operation
        if (node.operator !== "/") return;
        if (hasPositiveGuard(node)) return;

        const sourceCode = context.sourceCode;
        const rightText = sourceCode.getText(node.right);

        // Pattern 1: division by .length without guard
        if (
          rightText.includes(".length") &&
          !rightText.includes("||") &&
          !rightText.includes("?")
        ) {
          context.report({
            node,
            message:
              "Potential division by zero: {{ right }} could be 0. Use {{ right }} || 1 or add a guard.",
            data: { right: rightText },
            fix(fixer) {
              return fixer.replaceText(node.right, `(${rightText} || 1)`);
            },
          });
        }

        // Pattern 2: division by variable without null/zero check
        if (
          node.right.type === "Identifier" &&
          !rightText.includes("||") &&
          !rightText.includes("?")
        ) {
          // Only warn for common divisor names (count, length, size, denominator, etc.)
          const commonDivisorNames = [
            "count",
            "length",
            "size",
            "denominator",
            "total",
            "sum",
            "weight",
          ];
          if (commonDivisorNames.some((name) => rightText.includes(name))) {
            context.report({
              node,
              message:
                "Potential division by zero: {{ right }} should be guarded. Use {{ right }} || 1 or add a check.",
              data: { right: rightText },
            });
          }
        }
      },
    };
  },
};
