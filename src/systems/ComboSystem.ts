import { BALANCE } from '../config/balance';

/** Score + risk multiplier: the darker the screen when you kill, the bigger the reward. */
export class ComboSystem {
  score = 0;
  multiplier = 1;
  streak = 0;

  registerKill(lightValue: number) {
    this.streak++;
    this.multiplier = 1 + (1 - lightValue) * (BALANCE.maxRiskMultiplier - 1);
    const points = Math.round(BALANCE.killPoints * this.multiplier);
    this.score += points;
    return { points, multiplier: this.multiplier };
  }

  resetStreak() {
    this.streak = 0;
  }
}
