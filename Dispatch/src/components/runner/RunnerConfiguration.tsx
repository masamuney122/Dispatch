import { useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getMethodHexColor } from "../../constants/httpConstants";
import type { Environment } from "../../types/environment";
import type {
  CollectionRunnerState,
  RunnerConfiguration,
} from "../../types/runner";
import { collectionRequestsInRunOrder } from "../../utils/collectionRunOrder";
import { parseIterationDataFile } from "../../utils/iterationData";
import { OverlayScrollArea } from "../common/OverlayScrollArea";
import type { OrderedRunnerRequest, RunnerRequestSelection } from "../../types/runner";

interface RunnerConfigurationProps {
  runner: CollectionRunnerState;
  environments: Environment[];
  onChange: (configuration: RunnerConfiguration) => void;
  onStart: () => void;
  supportsCookiePersistence: boolean;
}

interface RunnerNumberInputProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  className: string;
}

const RunnerNumberInput: React.FC<RunnerNumberInputProps> = ({
  value,
  min,
  max,
  onChange,
  className,
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue = draft ?? String(value);

  const commit = () => {
    const parsed = Number(displayedValue);
    const normalized = displayedValue.trim() === ""
      ? value
      : Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, Math.trunc(parsed)))
      : value;
    setDraft(null);
    if (normalized !== value) onChange(normalized);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      value={displayedValue}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        if (nextDraft.trim() === "") return;

        const parsed = Number(nextDraft);
        if (Number.isInteger(parsed) && parsed >= min && parsed <= max) {
          onChange(parsed);
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={className}
    />
  );
};

const Checkbox: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled = false }) => (
  <label className={`flex items-start gap-2.5 text-xs ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer text-zinc-300"}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-0.5 h-3.5 w-3.5 accent-[#ff6c37]"
    />
    <span>{label}</span>
  </label>
);

const RunnerSequenceRow: React.FC<{
  selection: RunnerRequestSelection;
  item: OrderedRunnerRequest;
  index: number;
  onSelectedChange: (selected: boolean) => void;
}> = ({ selection, item, index, onSelectedChange }) => {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: selection.requestId });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="group grid min-h-9 grid-cols-[32px_30px_1fr_30px] items-center border-b border-[#2c2c2c] px-3 text-xs last:border-b-0 hover:bg-[#272727]"
    >
      <input
        type="checkbox"
        checked={selection.selected}
        onChange={(event) => onSelectedChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[#ff6c37]"
      />
      <span className="font-mono text-zinc-600">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-4">
        <span className="w-11 shrink-0 text-[11px] font-bold" style={{ color: getMethodHexColor(item.request.request.method) }}>
          {item.request.request.method}
        </span>
        <div className="min-w-0">
          <p className="truncate text-zinc-200">{item.request.name}</p>
          {item.folderPath.length > 0 && (
            <p className="truncate text-[10px] text-zinc-600">{item.folderPath.join(" › ")}</p>
          )}
        </div>
      </div>
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="cursor-grab touch-none rounded px-1.5 py-1 text-zinc-600 opacity-0 hover:bg-[#333] hover:text-zinc-300 group-hover:opacity-100 active:cursor-grabbing"
        aria-label={`Reorder ${item.request.name}`}
        {...attributes}
        {...listeners}
      >
        ≡
      </button>
    </div>
  );
};

export const RunnerConfigurationView: React.FC<RunnerConfigurationProps> = ({
  runner,
  environments,
  onChange,
  onStart,
  supportsCookiePersistence,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const { configuration } = runner;
  const requestsById = new Map(
    collectionRequestsInRunOrder(runner.collectionSnapshot, runner.scope).map((item) => [
      item.request.id,
      item,
    ]),
  );
  const selectedCount = configuration.requestSelection.filter(
    (item) => item.selected,
  ).length;
  const update = (updates: Partial<RunnerConfiguration>) =>
    onChange({ ...configuration, ...updates });

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = configuration.requestSelection.findIndex(
      (item) => item.requestId === event.active.id,
    );
    const to = configuration.requestSelection.findIndex(
      (item) => item.requestId === event.over?.id,
    );
    if (from < 0 || to < 0) return;
    update({ requestSelection: arrayMove(configuration.requestSelection, from, to) });
  };

  const handleDataFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = parseIterationDataFile(file.name, await file.text());
      setDataError(null);
      update({
        iterationData: rows,
        iterationDataFileName: file.name,
        iterations: rows.length || configuration.iterations,
      });
    } catch (error) {
      setDataError(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-[#202020] text-zinc-300">
      <section className="flex min-w-0 flex-[1.15] flex-col border-r border-[#353535]">
        <div className="border-b border-[#353535] px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Run sequence</h2>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
            <span>{selectedCount} of {configuration.requestSelection.length} selected</span>
            <button
              type="button"
              onClick={() => update({
                requestSelection: configuration.requestSelection.map((item) => ({ ...item, selected: true })),
              })}
              className="text-sky-400 hover:text-sky-300"
            >
              Select all
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => update({
                requestSelection: configuration.requestSelection.map((item) => ({ ...item, selected: false })),
              })}
              className="hover:text-zinc-300"
            >
              Clear
            </button>
          </div>
        </div>

        <OverlayScrollArea containerClassName="min-h-0 flex-1" axis="vertical" className="overflow-y-auto px-5 py-3">
          <div className="overflow-hidden rounded-lg border border-[#343434] bg-[#222222]">
            <div className="grid grid-cols-[32px_30px_1fr_30px] border-b border-[#343434] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              <span />
              <span>#</span>
              <div className="flex min-w-0 items-center gap-4">
                <span className="w-11 shrink-0">Method</span>
                <span>Request</span>
              </div>
              <span />
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={configuration.requestSelection.map((item) => item.requestId)} strategy={verticalListSortingStrategy}>
                {configuration.requestSelection.map((selection, index) => {
                  const item = requestsById.get(selection.requestId);
                  if (!item) return null;
                  return (
                    <RunnerSequenceRow
                      key={selection.requestId}
                      selection={selection}
                      item={item}
                      index={index}
                      onSelectedChange={(selected) => update({
                        requestSelection: configuration.requestSelection.map((candidate) =>
                          candidate.requestId === selection.requestId
                            ? { ...candidate, selected }
                            : candidate,
                        ),
                      })}
                    />
                  );
                })}
                {configuration.requestSelection.length === 0 && (
                  <p className="px-4 py-8 text-center text-xs text-zinc-600">
                    {runner.scope.type === "folder"
                      ? "This folder contains no requests."
                      : "This collection contains no requests."}
                  </p>
                )}
              </SortableContext>
            </DndContext>
          </div>
        </OverlayScrollArea>
      </section>

      <OverlayScrollArea containerClassName="min-h-0 flex-1" axis="vertical" className="overflow-y-auto">
        <section className="mx-auto w-full max-w-2xl px-7 py-5 text-xs">
          <h2 className="text-sm font-semibold text-zinc-100">Run type</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[#242424] p-1">
            {(["functional", "performance"] as const).map((runType) => (
              <button
                key={runType}
                type="button"
                onClick={() => update({ runType })}
                className={`rounded-md px-3 py-2 text-left transition-colors ${configuration.runType === runType ? "bg-[#363636] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <span className="block font-semibold capitalize">{runType}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">
                  {runType === "functional" ? "Validate requests and script tests" : "Measure response times under concurrent load"}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block font-semibold text-zinc-300">Environment</span>
              <select value={configuration.environmentId || ""} onChange={(event) => update({ environmentId: event.target.value || null })} className="h-9 w-full rounded-md border border-[#444] bg-[#222] px-3 text-zinc-200 outline-none focus:border-[#ff6c37]">
                <option value="">No environment</option>
                {environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
              </select>
            </label>

            {configuration.runType === "functional" ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block font-semibold text-zinc-300">Iterations</span>
                  <RunnerNumberInput value={configuration.iterations} min={1} max={1000} onChange={(iterations) => update({ iterations })} className="h-9 w-full rounded-md border border-[#444] bg-[#222] px-3 font-mono text-zinc-200 outline-none focus:border-[#ff6c37]" />
                </label>

                <div>
                  <span className="mb-1.5 block font-semibold text-zinc-300">Iteration data</span>
                  <input ref={inputRef} type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => void handleDataFile(event)} className="hidden" />
                  <button type="button" onClick={() => inputRef.current?.click()} className="h-9 w-full rounded-md border border-[#444] bg-[#222] px-3 text-left text-zinc-400 hover:border-[#555] hover:text-zinc-200">
                    {configuration.iterationDataFileName || "Select JSON or CSV file"}
                    {configuration.iterationData.length > 0 && <span className="float-right text-zinc-600">{configuration.iterationData.length} rows</span>}
                  </button>
                  {dataError && <p className="mt-1.5 text-[11px] text-red-400">{dataError}</p>}
                  {configuration.iterationDataFileName && <button type="button" onClick={() => update({ iterationData: [], iterationDataFileName: null })} className="mt-1.5 text-[11px] text-zinc-500 hover:text-red-400">Remove data file</button>}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1.5 block font-semibold text-zinc-300">Duration (seconds)</span>
                  <RunnerNumberInput value={configuration.performanceDurationSeconds} min={1} max={3600} onChange={(performanceDurationSeconds) => update({ performanceDurationSeconds })} className="h-9 w-full rounded-md border border-[#444] bg-[#222] px-3 font-mono text-zinc-200 outline-none focus:border-[#ff6c37]" />
                </label>
                <label>
                  <span className="mb-1.5 block font-semibold text-zinc-300">Virtual users</span>
                  <RunnerNumberInput value={configuration.virtualUsers} min={1} max={50} onChange={(virtualUsers) => update({ virtualUsers })} className="h-9 w-full rounded-md border border-[#444] bg-[#222] px-3 font-mono text-zinc-200 outline-none focus:border-[#ff6c37]" />
                </label>
                <label className="col-span-2">
                  <span className="mb-1.5 block font-semibold text-zinc-300">Load profile</span>
                  <select value={configuration.loadProfile} onChange={(event) => update({ loadProfile: event.target.value as RunnerConfiguration["loadProfile"] })} className="h-9 w-full rounded-md border border-[#444] bg-[#222] px-3 text-zinc-200 outline-none focus:border-[#ff6c37]">
                    <option value="fixed">Fixed load</option>
                    <option value="ramp-up">Ramp-up</option>
                  </select>
                </label>
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block font-semibold text-zinc-300">Delay between requests</span>
              <div className="flex h-9 overflow-hidden rounded-md border border-[#444] bg-[#222] focus-within:border-[#ff6c37]">
                <RunnerNumberInput value={configuration.delayMs} min={0} max={60000} onChange={(delayMs) => update({ delayMs })} className="min-w-0 flex-1 bg-transparent px-3 font-mono text-zinc-200 outline-none" />
                <span className="flex items-center border-l border-[#3a3a3a] px-3 text-zinc-500">ms</span>
              </div>
            </label>
          </div>

          <div className="mt-7 border-t border-[#343434] pt-5">
            <h2 className="mb-4 text-sm font-semibold text-zinc-100">Settings</h2>
            <div className="space-y-3">
              <Checkbox
                checked={
                  configuration.runType === "functional" &&
                  configuration.persistResponses
                }
                disabled={configuration.runType === "performance"}
                onChange={(persistResponses) => update({ persistResponses })}
                label={
                  configuration.runType === "performance"
                    ? "Responses are not persisted during performance runs"
                    : "Persist responses for this session"
                }
              />
              <Checkbox checked={configuration.disableLogs} onChange={(disableLogs) => update({ disableLogs })} label="Turn off script logs during run" />
              <Checkbox checked={configuration.stopOnError} onChange={(stopOnError) => update({ stopOnError })} label="Stop run if a request or script error occurs" />
              <Checkbox checked={configuration.keepVariableValues} disabled={configuration.runType === "performance"} onChange={(keepVariableValues) => update({ keepVariableValues })} label="Keep environment variable values" />
              <Checkbox checked={!configuration.useStoredCookies} onChange={(withoutCookies) => update({ useStoredCookies: !withoutCookies })} label="Run without using stored cookies" />
              <Checkbox checked={configuration.saveCookiesAfterRun} disabled={configuration.runType === "performance" || !supportsCookiePersistence} onChange={(saveCookiesAfterRun) => update({ saveCookiesAfterRun })} label={supportsCookiePersistence ? "Save cookies after collection run" : "Cookies are browser managed on the web"} />
            </div>
          </div>

          <button type="button" disabled={selectedCount === 0} onClick={onStart} className="mt-7 rounded-md bg-[#ff6c37] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ff7b4d] disabled:cursor-not-allowed disabled:opacity-40">
            Start run
          </button>
        </section>
      </OverlayScrollArea>
    </div>
  );
};
