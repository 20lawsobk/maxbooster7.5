import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { collaborationNotesFieldName } from "../../client/src/hooks/useCollaborationDocument";

describe("collaboration notes fields", () => {
  it("keeps notes isolated by room and generation", () => {
    const document = new Y.Doc();
    const firstRoom = document.getText(
      collaborationNotesFieldName("room-a", 1),
    );
    const secondRoom = document.getText(
      collaborationNotesFieldName("room-b", 1),
    );
    const reopenedRoom = document.getText(
      collaborationNotesFieldName("room-a", 2),
    );

    firstRoom.insert(0, "private to room-a generation 1");

    expect(secondRoom.toString()).toBe("");
    expect(reopenedRoom.toString()).toBe("");
    expect(firstRoom.toString()).toBe("private to room-a generation 1");

    document.destroy();
  });

  it("rejects invalid room generations", () => {
    expect(() => collaborationNotesFieldName("", 1)).toThrow();
    expect(() => collaborationNotesFieldName("room-a", 0)).toThrow();
    expect(() => collaborationNotesFieldName("room-a", 1.5)).toThrow();
  });
});
