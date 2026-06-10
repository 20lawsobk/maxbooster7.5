/**
 * ESLint Rule: no-division-by-zero
 * Detects and prevents division-by-zero patterns in code
 * Catches: arr.reduce(...) / arr.length without guard
 */

module.exports = {
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
    return {
      BinaryExpression(node) {
        // Check if this is a division operation
        if (node.operator !== "/") return;

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
