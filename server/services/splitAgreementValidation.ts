export function validateSplitAllocation(participants: unknown): string | null {
  if (!Array.isArray(participants) || participants.length === 0)
    return "At least one participant is required";
  const users = new Set<string>();
  const emails = new Set<string>();
  let total = 0;
  for (const p of participants) {
    if (!p || typeof p.userId !== "string" || !p.userId.trim() ||
        typeof p.name !== "string" || !p.name.trim() ||
        typeof p.role !== "string" || !p.role.trim() ||
        typeof p.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
      return "Each participant requires a user ID, name, role and valid email";
    const email = p.email.trim().toLowerCase();
    if (users.has(p.userId) || emails.has(email)) return "Duplicate participant";
    users.add(p.userId);
    emails.add(email);
    if (typeof p.splitPercentage !== "number" || !Number.isFinite(p.splitPercentage) ||
        p.splitPercentage < 0 || p.splitPercentage > 100)
      return "Split percentages must be finite numbers between 0 and 100";
    total += p.splitPercentage;
  }
  return Math.abs(total - 100) <= 0.000001 ? null : "Split percentages must total 100%";
}