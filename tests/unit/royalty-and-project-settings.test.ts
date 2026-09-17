import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("royalty and studio settings API contracts", () => {
  it("unwraps the royalties platforms response before using array methods", () => {
    const source = readSource(
      "client/src/components/distribution/RoyaltyReconciliation.tsx",
    );

    expect(source).toContain(
      "select: (response: { platforms?: PlatformEarnings[] }) =>",
    );
    expect(source).toContain("response.platforms ?? []");
    expect(source).not.toContain(
      "useQuery<\n    PlatformEarnings[]\n  >({\n    queryKey: [\"/api/distribution/royalties/platforms\"",
    );
  });

  it("sends tempo, rejects failed saves, and only closes after success", () => {
    const source = readSource(
      "client/src/components/studio/ProjectSettingsDialog.tsx",
    );
    const mutationStart = source.indexOf("const saveMutation = useMutation");
    const submitStart = source.indexOf("const handleSubmit", mutationStart);
    const mutationSource = source.slice(mutationStart, submitStart);
    const submitSource = source.slice(submitStart);
    const successStart = mutationSource.indexOf("onSuccess:");
    const errorStart = mutationSource.indexOf("onError:");
    const successSource = mutationSource.slice(successStart, errorStart);

    expect(mutationSource).toContain("tempo: form.tempo");
    expect(mutationSource).not.toContain("bpm: form.tempo");
    expect(mutationSource).toContain("if (!response.ok)");
    expect(mutationSource).toContain("throw new Error(");
    expect(successSource).toContain("onOpenChange(false)");
    expect(successSource).toContain("onUpdate({");
    expect(submitSource.indexOf("saveMutation.mutate()")).toBeLessThan(
      submitSource.indexOf("onUpdate({"),
    );
  });
});