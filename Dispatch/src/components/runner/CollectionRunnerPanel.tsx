import type { Environment } from "../../types/environment";
import type { CollectionRunnerState, RunnerConfiguration } from "../../types/runner";
import { RunnerConfigurationView } from "./RunnerConfiguration";
import { RunnerResults } from "./RunnerResults";
import type { ConsoleEvent } from "../../types/console";

interface CollectionRunnerPanelProps {
  runner: CollectionRunnerState;
  environments: Environment[];
  onChangeConfiguration: (configuration: RunnerConfiguration) => void;
  onStart: () => void;
  onStop: () => void;
  onNewRun: () => void;
  supportsCookiePersistence: boolean;
  consoleEvents: ConsoleEvent[];
}

export const CollectionRunnerPanel: React.FC<CollectionRunnerPanelProps> = ({
  runner,
  environments,
  onChangeConfiguration,
  onStart,
  onStop,
  onNewRun,
  supportsCookiePersistence,
  consoleEvents,
}) => {
  if (runner.status === "draft") {
    return (
      <RunnerConfigurationView
        runner={runner}
        environments={environments}
        onChange={onChangeConfiguration}
        onStart={onStart}
        supportsCookiePersistence={supportsCookiePersistence}
      />
    );
  }

  const environmentName =
    environments.find((item) => item.id === runner.configuration.environmentId)?.name ||
    "No environment";
  return (
    <RunnerResults
      runner={runner}
      environmentName={environmentName}
      onRerun={onStart}
      onNewRun={onNewRun}
      onStop={onStop}
      consoleEvents={consoleEvents}
    />
  );
};
