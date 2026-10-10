import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { ManualInstallModal } from "./ManualInstallModal";

// The guide is pure data + Chakra markup: no store, no bridge. These cases pin
// the platform branch (PowerShell vs POSIX), the version interpolation from the
// status payload, the two-segment add-on path strip, and the unsupported /
// missing-path degradations.
function renderGuide(props) {
  return render(
    <ChakraProvider>
      <ManualInstallModal isOpen onClose={() => {}} {...props} />
    </ChakraProvider>
  );
}

test("windows-amd64 guide uses the PowerShell installer and the pinned versions", () => {
  renderGuide({
    platformKey: "windows-amd64",
    uvVersion: "0.12.3",
    pythonVersion: "3.11.15",
    engineRoot: "C:\\AnkiBrain\\user_files\\local_engine",
  });

  expect(
    screen.getByText(/astral\.sh\/uv\/0\.12\.3\/install\.ps1/)
  ).toBeInTheDocument();
  expect(screen.getByText(/uv python install 3\.11\.15/)).toBeInTheDocument();
  expect(screen.getByText(/uv sync --frozen/)).toBeInTheDocument();
  // engine_root has two path segments dropped: <addon>/user_files/local_engine
  // -> <addon>/local_engine.
  expect(screen.getByText(/C:\\AnkiBrain\\local_engine/)).toBeInTheDocument();
});

test("darwin-aarch64 guide uses the POSIX installer", () => {
  renderGuide({
    platformKey: "darwin-aarch64",
    uvVersion: "0.12.3",
    pythonVersion: "3.11.15",
    engineRoot: "/Users/x/AnkiBrain/user_files/local_engine",
  });

  expect(
    screen.getByText(/astral\.sh\/uv\/0\.12\.3\/install\.sh/)
  ).toBeInTheDocument();
  expect(screen.queryByText(/install\.ps1/)).toBeNull();
});

test("unsupported platform shows the reason and no commands", () => {
  renderGuide({
    platformKey: "darwin-x86_64",
    reason: "Intel Macs are not supported for Local mode.",
  });

  expect(
    screen.getByText("Intel Macs are not supported for Local mode.")
  ).toBeInTheDocument();
  expect(screen.queryByText(/install\.sh/)).toBeNull();
  expect(screen.queryByText(/uv sync/)).toBeNull();
});

test("missing engineRoot falls back to the add-on path placeholder", () => {
  renderGuide({ platformKey: "windows-amd64", uvVersion: "0.12.3" });

  expect(
    screen.getAllByText(/<AnkiBrain add-on folder>/).length
  ).toBeGreaterThan(0);
});
