class DAWAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isPlaying = false;
    this.samplePosition = 0;
    this.loopEnabled = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.peakLeft = 0;
    this.peakRight = 0;
    this.rmsLeft = 0;
    this.rmsRight = 0;
    this.meterUpdateCounter = 0;
    this.meterUpdateInterval = 128;

    this.port.onmessage = (event) => {
      const { type, data } = event.data;

      switch (type) {
        case "play":
          this.isPlaying = true;
          break;
        case "pause":
          this.isPlaying = false;
          break;
        case "stop":
          this.isPlaying = false;
          this.samplePosition = 0;
          break;
        case "seek":
          this.samplePosition = data.sample;
          break;
        case "setLoop":
          this.loopEnabled = data.enabled;
          this.loopStart = data.start;
          this.loopEnd = data.end;
          break;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input.length > 0) {
      const leftChannel = input[0];
      const rightChannel = input[1] || leftChannel;

      let sumSquaresLeft = 0;
      let sumSquaresRight = 0;
      let peakL = 0;
      let peakR = 0;

      for (let i = 0; i < leftChannel.length; i++) {
        const sampleL = leftChannel[i];
        const sampleR = rightChannel[i];

        sumSquaresLeft += sampleL * sampleL;
        sumSquaresRight += sampleR * sampleR;

        const absL = Math.abs(sampleL);
        const absR = Math.abs(sampleR);

        if (absL > peakL) peakL = absL;
        if (absR > peakR) peakR = absR;

        if (output[0]) output[0][i] = sampleL;
        if (output[1]) output[1][i] = sampleR;
      }

      const rmsL = Math.sqrt(sumSquaresLeft / leftChannel.length);
      const rmsR = Math.sqrt(sumSquaresRight / rightChannel.length);

      this.peakLeft = Math.max(this.peakLeft * 0.95, peakL);
      this.peakRight = Math.max(this.peakRight * 0.95, peakR);
      this.rmsLeft = rmsL * 0.3 + this.rmsLeft * 0.7;
      this.rmsRight = rmsR * 0.3 + this.rmsRight * 0.7;
    }

    if (this.isPlaying) {
      this.samplePosition += 128;

      if (this.loopEnabled && this.samplePosition >= this.loopEnd) {
        this.samplePosition = this.loopStart;
      }
    }

    this.meterUpdateCounter++;
    if (this.meterUpdateCounter >= this.meterUpdateInterval) {
      this.meterUpdateCounter = 0;

      this.port.postMessage({
        type: "metering",
        data: {
          position: this.samplePosition,
          time: this.samplePosition / sampleRate,
          isPlaying: this.isPlaying,
          peakLeft: this.peakLeft,
          peakRight: this.peakRight,
          rmsLeft: this.rmsLeft,
          rmsRight: this.rmsRight,
        },
      });

      this.peakLeft *= 0.9;
      this.peakRight *= 0.9;
    }

    return true;
  }
}

registerProcessor("daw-audio-processor", DAWAudioProcessor);
