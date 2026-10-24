function accel() {
  return {
    mode: "noaccel",
    "Gain / Velocity": true,
    inputOffset: 0,
    outputOffset: 0,
    acceleration: 0.005,
    decayRate: 0.1,
    gamma: 1,
    motivity: 1.5,
    exponentClassic: 2,
    scale: 1,
    exponentPower: 0.05,
    limit: 1.5,
    syncSpeed: 5,
    smooth: 0.5,
    "Cap / Jump": { x: 15, y: 1.5 },
    "Cap mode": "output",
    data: [],
  };
}

// RawAccel 1.7.1's own defaults: no curve, sensitivity 1, nothing directional.
export function defaultSettings() {
  return {
    "### Accel modes ###": "classic | jump | natural | synchronous | power | lut | noaccel",
    "### Cap modes ###": "in_out | input | output",
    version: "1.7.1",
    defaultDeviceConfig: {
      disable: false,
      "Use constant time interval based on polling rate": false,
      "DPI (normalizes input speed unit: counts/ms -> in/s)": 0,
      "Polling rate Hz (keep at 0 for automatic adjustment)": 0,
    },
    profiles: [
      {
        name: "default",
        "Stretches domain for horizontal vs vertical inputs": { x: 1, y: 1 },
        "Stretches accel range for horizontal vs vertical inputs": { x: 1, y: 1 },
        "Whole or horizontal accel parameters": accel(),
        "Vertical accel parameters": accel(),
        "Input speed calculation parameters": {
          "Whole/combined accel (set false for 'by component' mode)": true,
          lpNorm: 2,
          "Time in ms after which an input is weighted at half its original value.": 0,
          "Time in ms after which scale is weighted at half its original value.": 0,
          "Time in ms after which an output is weighted at half its original value.": 0,
        },
        "Output DPI": 1000,
        "Y/X output DPI ratio (vertical sens multiplier)": 1,
        "L/R output DPI ratio (left sens multiplier)": 1,
        "U/D output DPI ratio (up sens multiplier)": 1,
        "Degrees of rotation": 0,
        "Degrees of angle snapping": 0,
        "Input Speed Cap": 0,
      },
    ],
    devices: [],
  };
}
