import { getDashboardData } from "./dashboard";
import { getKillSwitchStatus } from "./killSwitch";
import { loadSettings } from "./settings";
import { getShellData } from "./shell";

/** Everything the dashboard pages share: kill-switch state, settings, sidebar data, and the flags. */
export async function loadBoard() {
  const [ks, shell, settings] = await Promise.all([getKillSwitchStatus(), getShellData(), loadSettings()]);
  const data = await getDashboardData(ks.evaluation.windowStart);
  const festivalPct = Math.round(settings.rules.festivalUplift * 1000) / 10;
  return { ks, shell, settings, festivalPct, ...data };
}
