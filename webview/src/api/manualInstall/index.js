/**
 * Platform-aware "do it by hand" guide for the LOCAL-mode engine.
 *
 * Every value a technical user needs — the pinned uv version, the pinned
 * CPython, the terminal to run in, the engine directory — comes from the
 * python status payload (`local_engine.state.current_status()`), so this copy
 * can never drift from `local_engine/runtime-manifest.json`. The commands
 * mirror `local_engine/bootstrap.py` stage for stage: the official uv
 * installer from the manifest's `releases_base`, `uv python install` for the
 * pinned CPython, and `uv sync --frozen` against `local_engine/uv.lock`.
 *
 * Pure data builder (no React, no store) so it is trivially testable.
 */

export const MANUAL_SUPPORTED_PLATFORMS = [
  "windows-amd64",
  "linux-x86_64",
  "linux-aarch64",
  "darwin-aarch64",
];

const PLACEHOLDER_ADDON_DIR = "<AnkiBrain add-on folder>";

const FALLBACK_UV_VERSION = "0.12.3";
const FALLBACK_PYTHON_VERSION = "3.11";

// status.engine_root is "<addon>/user_files/local_engine": dropping the last
// two path segments yields the add-on folder, preserving the separator style
// the payload reported (Windows vs POSIX). Returns null when the path does not
// have that shape, so the caller falls back to the placeholder instead of
// printing a wrong directory.
function addonDirFromEngineRoot(engineRoot) {
  if (!engineRoot) return null;
  const trimmed = String(engineRoot).replace(/[\\/]+$/, "");
  const last = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (last <= 0) return null;
  const before = Math.max(
    trimmed.lastIndexOf("\\", last - 1),
    trimmed.lastIndexOf("/", last - 1)
  );
  if (before <= 0) return null;
  return trimmed.slice(0, before);
}

export function manualInstallGuide({
  platformKey,
  engineRoot,
  uvVersion,
  pythonVersion,
} = {}) {
  const isWindows = (platformKey || "").startsWith("windows-");
  const uv = uvVersion || FALLBACK_UV_VERSION;
  const py = pythonVersion || FALLBACK_PYTHON_VERSION;
  const addonDir = addonDirFromEngineRoot(engineRoot) || PLACEHOLDER_ADDON_DIR;
  const engineDir = addonDir + (isWindows ? "\\local_engine" : "/local_engine");
  const venvDir =
    addonDir +
    (isWindows ? "\\user_files\\local_engine\\venv" : "/user_files/local_engine/venv");

  return {
    platformKey,
    supported: MANUAL_SUPPORTED_PLATFORMS.includes(platformKey),
    addonDir,
    steps: [
      {
        title: `Install uv ${uv}`,
        detail:
          "uv is the installer AnkiBrain uses. Restart your terminal afterwards so uv is on PATH.",
        code: isWindows
          ? `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/${uv}/install.ps1 | iex"`
          : `curl -LsSf https://astral.sh/uv/${uv}/install.sh | sh`,
      },
      {
        title: `Install Python ${py}`,
        detail:
          "A self-contained Python build is downloaded; no system Python is needed.",
        code: `uv python install ${py}`,
      },
      {
        title: "Install the engine packages",
        detail:
          "From the add-on's local_engine folder, rebuild the environment from the pinned uv.lock.",
        code: isWindows
          ? `cd "${engineDir}"\n$env:UV_PROJECT_ENVIRONMENT = "${venvDir}"\nuv sync --frozen`
          : `cd "${engineDir}"\nUV_PROJECT_ENVIRONMENT="${venvDir}" uv sync --frozen`,
      },
    ],
  };
}
