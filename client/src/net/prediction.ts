import type { InputCmd } from './input_cmd';
import type { StateSnapshot } from './protocol';
import { SIM_CONFIG, type SimConfig } from '../sim/config';

export type PredictionInput = Pick<InputCmd, 'moveX' | 'moveY' | 'sprint'>;

export interface PredictionSim {
  step: (input: PredictionInput, dt: number) => void;
  getState: () => { x: number; y: number };
  setState: (x: number, y: number) => void;
  reset: () => void;
  setConfig: (config: SimConfig) => void;
}

export interface PredictedState {
  x: number;
  y: number;
  lastProcessedInputSeq: number;
}

const DEFAULT_TICK_RATE = 60;
const MAX_HISTORY = 120;

const clampAxis = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
};

const toNumber = (value: number) => (Number.isFinite(value) ? value : 0);

export const createJsPredictionSim = (config: SimConfig = SIM_CONFIG): PredictionSim => {
  let state = { x: 0, y: 0 };
  const currentConfig = { ...SIM_CONFIG };

  const setConfig = (next: SimConfig) => {
    if (Number.isFinite(next.moveSpeed) && next.moveSpeed > 0) {
      currentConfig.moveSpeed = next.moveSpeed;
    }
    if (Number.isFinite(next.sprintMultiplier) && next.sprintMultiplier > 0) {
      currentConfig.sprintMultiplier = next.sprintMultiplier;
    }
  };

  const step = (input: PredictionInput, dt: number) => {
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }
    const moveX = clampAxis(input.moveX);
    const moveY = clampAxis(input.moveY);
    let speed = currentConfig.moveSpeed;
    if (input.sprint) {
      speed *= currentConfig.sprintMultiplier;
    }
    state.x += moveX * speed * dt;
    state.y += moveY * speed * dt;
  };

  const setState = (x: number, y: number) => {
    state.x = toNumber(x);
    state.y = toNumber(y);
  };

  const getState = () => ({ ...state });

  const reset = () => {
    state = { x: 0, y: 0 };
  };

  setConfig(config);

  return { step, getState, setState, reset, setConfig };
};

export class ClientPrediction {
  private state: PredictedState = { x: 0, y: 0, lastProcessedInputSeq: -1 };
  private tickRate = DEFAULT_TICK_RATE;
  private history: InputCmd[] = [];
  private lastInputSeq = 0;
  private active = false;
  private sim: PredictionSim;
  private simConfig: SimConfig = SIM_CONFIG;

  constructor(sim?: PredictionSim) {
    this.sim = sim ?? createJsPredictionSim(this.simConfig);
    this.sim.setConfig(this.simConfig);
  }

  setTickRate(tickRate: number) {
    if (Number.isFinite(tickRate) && tickRate > 0) {
      this.tickRate = tickRate;
    } else {
      this.tickRate = DEFAULT_TICK_RATE;
    }
  }

  isActive() {
    return this.active;
  }

  getState(): PredictedState {
    return { ...this.state };
  }

  setSim(sim: PredictionSim) {
    this.sim = sim;
    this.sim.setConfig(this.simConfig);
    this.sim.setState(this.state.x, this.state.y);
  }

  recordInput(cmd: InputCmd) {
    if (!Number.isFinite(cmd.inputSeq) || cmd.inputSeq <= this.lastInputSeq) {
      return;
    }
    this.active = true;
    this.lastInputSeq = cmd.inputSeq;
    this.history.push(cmd);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    this.applyInput(cmd);
  }

  reconcile(snapshot: StateSnapshot) {
    this.sim.setState(snapshot.posX, snapshot.posY);
    this.state.lastProcessedInputSeq = snapshot.lastProcessedInputSeq;

    if (this.history.length > 0) {
      this.history = this.history.filter((entry) => entry.inputSeq > snapshot.lastProcessedInputSeq);
      for (const entry of this.history) {
        this.applyInput(entry);
      }
    }

    this.syncState();
  }

  private applyInput(cmd: InputCmd) {
    const dt = 1 / this.tickRate;
    this.sim.step(cmd, dt);
    this.syncState();
  }

  private syncState() {
    const next = this.sim.getState();
    this.state.x = next.x;
    this.state.y = next.y;
  }
}
