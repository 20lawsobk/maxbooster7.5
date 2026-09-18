import { describe, expect, it } from "vitest";
import { parseMaxCoreMidiNotes } from "../studioGeneration.js";

describe("studio MaxCore MIDI serialization", () => {
  it("converts a genuine standard MIDI note to the legacy DTO", () => {
    const track = Buffer.from([
      0x00, 0x90, 60, 100,
      0x83, 0x60, 0x80, 60, 0,
      0x00, 0xff, 0x2f, 0x00,
    ]);
    const midi = Buffer.alloc(14 + 8 + track.length);
    midi.write("MThd", 0);
    midi.writeUInt32BE(6, 4);
    midi.writeUInt16BE(0, 8);
    midi.writeUInt16BE(1, 10);
    midi.writeUInt16BE(480, 12);
    midi.write("MTrk", 14);
    midi.writeUInt32BE(track.length, 18);
    track.copy(midi, 22);

    expect(
      parseMaxCoreMidiNotes(
        midi.buffer.slice(midi.byteOffset, midi.byteOffset + midi.byteLength),
      ),
    ).toEqual([{ note: 0, octave: 4, duration: 1, velocity: 100 }]);
  });
});