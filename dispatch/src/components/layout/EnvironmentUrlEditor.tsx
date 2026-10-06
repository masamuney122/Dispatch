import {
  autocompletion,
  completionKeymap,
  completionStatus,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  hoverTooltip,
  keymap,
  placeholder,
  tooltips,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

interface EnvironmentVariableEditorProps {
  value: string;
  variables: Record<string, string>;
  placeholder?: string;
  ariaLabel: string;
  variant?: "url" | "table" | "control" | "body";
  multiline?: boolean;
  sensitive?: boolean;
  onChange: (value: string) => void;
  onEnter?: () => void;
}

interface EnvironmentUrlEditorProps {
  value: string;
  variables: Record<string, string>;
  loading: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
}

const variablePattern = /\{\{([^{}]+)\}\}/g;

function variableDecorations(view: EditorView): DecorationSet {
  const decorations = [];
  const text = view.state.doc.toString();
  let match: RegExpExecArray | null;

  variablePattern.lastIndex = 0;
  while ((match = variablePattern.exec(text))) {
    decorations.push(
      Decoration.mark({ class: "cm-environment-variable" }).range(
        match.index,
        match.index + match[0].length,
      ),
    );
  }

  return Decoration.set(decorations, true);
}

const environmentVariableHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = variableDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = variableDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function variableAtPosition(text: string, position: number) {
  variablePattern.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = variablePattern.exec(text))) {
    const from = match.index;
    const to = from + match[0].length;
    if (position >= from && position <= to) {
      return { from, to, name: match[1].trim() };
    }
  }

  return null;
}

const variableEditorTheme = EditorView.theme({
  "&": {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--dispatch-url-text)",
    fontSize: "14px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    scrollbarWidth: "none",
  },
  ".cm-scroller::-webkit-scrollbar": { display: "none" },
  ".cm-content": {
    caretColor: "var(--dispatch-url-caret)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--dispatch-url-caret)" },
  ".cm-placeholder": {
    color: "var(--dispatch-url-placeholder)",
    fontStyle: "normal",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--dispatch-url-selection) !important",
  },
});

const singleLineTheme = EditorView.theme({
  ".cm-scroller": {
    display: "flex",
    alignItems: "center",
    overflowX: "auto",
    overflowY: "hidden",
  },
  ".cm-content": {
    alignSelf: "center",
    minHeight: "auto",
    minWidth: "max-content",
    whiteSpace: "pre",
  },
});

const multilineTheme = EditorView.theme({
  ".cm-scroller": { overflow: "auto" },
  ".cm-content": {
    minHeight: "100%",
    padding: "12px 16px",
    whiteSpace: "pre",
  },
});

export function EnvironmentVariableEditor({
  value,
  variables,
  placeholder: placeholderText = "",
  ariaLabel,
  variant = "control",
  multiline = false,
  sensitive = false,
  onChange,
  onEnter,
}: EnvironmentVariableEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const variablesRef = useRef(variables);
  const onChangeRef = useRef(onChange);
  const onEnterRef = useRef(onEnter);
  const applyingExternalValueRef = useRef(false);
  const initialValueRef = useRef(value);

  useEffect(() => {
    variablesRef.current = variables;
  }, [variables]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onEnterRef.current = onEnter;
  }, [onEnter]);

  useEffect(() => {
    if (!hostRef.current) return;

    const variableCompletions = (context: CompletionContext) => {
      const before = context.matchBefore(/\{\{[^{}]*$/);
      if (!before) return null;

      return {
        from: before.from + 2,
        options: Object.entries(variablesRef.current)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, variableValue]) => ({
            label: name,
            type: "variable",
            detail: variableValue,
            apply: `${name}}}`,
          })),
        validFor: /^[^{}]*$/,
      };
    };

    const variableTooltip = hoverTooltip((view, position) => {
      const variable = variableAtPosition(view.state.doc.toString(), position);
      if (!variable) return null;

      const currentVariables = variablesRef.current;
      const defined = Object.prototype.hasOwnProperty.call(
        currentVariables,
        variable.name,
      );

      return {
        pos: variable.from,
        end: variable.to,
        above: true,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "dispatch-variable-tooltip";

          const name = document.createElement("div");
          name.className = "dispatch-variable-tooltip-name";
          name.textContent = variable.name;

          const variableValue = document.createElement("div");
          variableValue.className = "dispatch-variable-tooltip-value";
          variableValue.textContent = defined
            ? currentVariables[variable.name] || "(empty value)"
            : "Not defined in the active environment";

          dom.append(name, variableValue);
          return { dom };
        },
      };
    });

    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        history(),
        keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap]),
        autocompletion({
          override: [variableCompletions],
          activateOnTyping: true,
          icons: true,
          maxRenderedOptions: 12,
        }),
        environmentVariableHighlighter,
        variableTooltip,
        // Keep tooltip DOM inside the editor tree. Mounting a container directly
        // under document.body lets CodeMirror overlays participate in the page's
        // scrollable overflow and can make the desktop shell itself scroll.
        tooltips({ position: "fixed" }),
        placeholder(placeholderText),
        variableEditorTheme,
        multiline ? multilineTheme : singleLineTheme,
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          spellcheck: "false",
        }),
        EditorView.domEventHandlers({
          keydown(event, view) {
            if (
              multiline ||
              event.key !== "Enter" ||
              completionStatus(view.state)
            ) {
              return false;
            }

            event.preventDefault();
            onEnterRef.current?.();
            return true;
          },
          paste(event, view) {
            if (multiline) return false;
            const pastedText = event.clipboardData?.getData("text");
            if (!pastedText || !/[\r\n]/.test(pastedText)) return false;

            event.preventDefault();
            view.dispatch(
              view.state.replaceSelection(pastedText.replace(/[\r\n]+/g, "")),
            );
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applyingExternalValueRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel, multiline, placeholderText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;

    applyingExternalValueRef.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    applyingExternalValueRef.current = false;
  }, [value]);

  const masksLiteralValue = sensitive && value.length > 0 && !value.includes("{{");

  return (
    <div
      ref={hostRef}
      className={`dispatch-url-editor dispatch-variable-editor dispatch-variable-editor-${variant} min-w-0`}
      data-mask-value={masksLiteralValue || undefined}
    />
  );
}

export function EnvironmentUrlEditor({
  value,
  variables,
  loading,
  onChange,
  onSend,
}: EnvironmentUrlEditorProps) {
  return (
    <EnvironmentVariableEditor
      value={value}
      variables={variables}
      ariaLabel="Request URL"
      variant="url"
      placeholder="Enter URL or paste text"
      onChange={onChange}
      onEnter={() => {
        if (!loading) onSend();
      }}
    />
  );
}
