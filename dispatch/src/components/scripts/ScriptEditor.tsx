import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { tags } from "@lezer/highlight";

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

const dpCompletions: Completion[] = [
  { label: "dp.request.method", type: "property", detail: "Current HTTP method" },
  { label: "dp.request.url.toString", type: "function", apply: "dp.request.url.toString()", detail: "Postman-compatible" },
  { label: "dp.request.url.query.get", type: "function", apply: "dp.request.url.query.get(\"\")", detail: "Postman-compatible" },
  { label: "dp.request.url.query.upsert", type: "function", apply: "dp.request.url.query.upsert({ key: \"\", value: \"\" })", detail: "Postman-compatible" },
  { label: "dp.request.url.query.add", type: "function", apply: "dp.request.url.query.add({ key: \"\", value: \"\" })", detail: "Postman-compatible" },
  { label: "dp.request.url.query.remove", type: "function", apply: "dp.request.url.query.remove(\"\")", detail: "Postman-compatible" },
  { label: "dp.request.body.update", type: "function", apply: "dp.request.body.update({\n  mode: \"raw\",\n  raw: JSON.stringify({}),\n  options: { raw: { language: \"json\" } }\n})", detail: "Postman-compatible" },
  { label: "dp.request.headers.get", type: "function", apply: "dp.request.headers.get(\"\")" },
  { label: "dp.request.headers.upsert", type: "function", apply: "dp.request.headers.upsert({ key: \"\", value: \"\" })", detail: "Postman-compatible" },
  { label: "dp.request.headers.add", type: "function", apply: "dp.request.headers.add({ key: \"\", value: \"\" })", detail: "Postman-compatible" },
  { label: "dp.request.headers.remove", type: "function", apply: "dp.request.headers.remove(\"\")" },
  { label: "dp.request.headers.set", type: "function", apply: "dp.request.headers.set(\"\", \"\")", detail: "Dispatch shorthand" },
  { label: "dp.response.status", type: "property", detail: "Post-response only" },
  { label: "dp.response.code", type: "property", detail: "Postman-compatible · post-response only" },
  { label: "dp.response.to.have.status", type: "function", apply: "dp.response.to.have.status(200)", detail: "Postman-compatible" },
  { label: "dp.response.text", type: "function", apply: "dp.response.text()", detail: "Post-response only" },
  { label: "dp.response.json", type: "function", apply: "dp.response.json()", detail: "Post-response only" },
  { label: "dp.variables.get", type: "function", apply: "dp.variables.get(\"\")" },
  { label: "dp.variables.replaceIn", type: "function", apply: "dp.variables.replaceIn(\"{{variable}}\")" },
  { label: "dp.environment.set", type: "function", apply: "dp.environment.set(\"\", \"\")", detail: "Persists to active environment" },
  { label: "dp.environment.unset", type: "function", apply: "dp.environment.unset(\"\")", detail: "Persists to active environment" },
  { label: "dp.test", type: "function", apply: "dp.test(\"test name\", () => {\n  \n})" },
  { label: "dp.expect", type: "function", apply: "dp.expect()" },
  { label: "dp.expect(...).to.equal", type: "function", apply: "dp.expect().to.equal()", detail: "Postman-compatible" },
  { label: "dp.expect(...).to.eql", type: "function", apply: "dp.expect().to.eql()", detail: "Postman-compatible" },
  { label: "dp.expect(...).to.have.property", type: "function", apply: "dp.expect().to.have.property(\"\")", detail: "Postman-compatible" },
  { label: "console.log", type: "function", apply: "console.log()" },
];

const completions: Completion[] = [
  ...dpCompletions,
  ...dpCompletions
    .filter((completion) => completion.label.startsWith("dp."))
    .map((completion) => ({
      ...completion,
      label: completion.label.replace(/^dp\./, "pm."),
      apply:
        typeof completion.apply === "string"
          ? completion.apply.replaceAll("dp.", "pm.")
          : completion.apply,
      detail: "Postman namespace alias",
    })),
];

const dpCompletionSource = (context: CompletionContext) => {
  const before = context.matchBefore(/[\w.]*/);
  if (!before || (!context.explicit && before.from === before.to)) return null;
  if (!before.text.startsWith("dp") && !before.text.startsWith("pm") && !before.text.startsWith("console")) return null;
  return { from: before.from, options: completions };
};

const dispatchHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword],
    color: "var(--dispatch-script-keyword)",
  },
  {
    tag: [tags.operator, tags.updateOperator, tags.logicOperator, tags.compareOperator],
    color: "var(--dispatch-script-operator)",
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: "var(--dispatch-script-string)",
  },
  {
    tag: [tags.number, tags.integer, tags.float],
    color: "var(--dispatch-script-number)",
  },
  {
    tag: [tags.bool, tags.null],
    color: "var(--dispatch-script-literal)",
  },
  {
    tag: [tags.variableName, tags.self],
    color: "var(--dispatch-script-text)",
  },
  {
    tag: [tags.definition(tags.variableName), tags.className, tags.typeName],
    color: "var(--dispatch-script-definition)",
  },
  {
    tag: tags.propertyName,
    color: "var(--dispatch-script-property)",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--dispatch-script-function)",
  },
  {
    tag: [tags.comment, tags.docComment],
    color: "var(--dispatch-script-comment)",
    fontStyle: "italic",
  },
  {
    tag: [tags.regexp, tags.escape],
    color: "var(--dispatch-script-regexp)",
  },
  {
    tag: [tags.punctuation, tags.bracket, tags.separator],
    color: "var(--dispatch-script-punctuation)",
  },
  {
    tag: tags.invalid,
    color: "var(--dispatch-script-invalid)",
    textDecoration: "underline wavy",
  },
]);

const dispatchTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--dispatch-script-text)",
    fontSize: "13px",
  },
  ".cm-scroller": {
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    lineHeight: "22px",
    overflow: "auto",
  },
  ".cm-content": { padding: "4px 0 16px" },
  ".cm-line": { padding: "0 12px" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "#858585",
    borderRight: "1px solid rgba(64, 64, 64, 0.5)",
    minWidth: "28px",
    width: "28px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "27px",
    padding: "0 6px 0 0",
    textAlign: "right",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.025)" },
  ".cm-cursor": { borderLeftColor: "#38bdf8" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(91, 105, 130, 0.22)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--dispatch-script-popup)",
    border: "1px solid var(--dispatch-script-popup-border)",
    color: "var(--dispatch-script-popup-text)",
  },
  ".cm-tooltip-autocomplete": {
    borderRadius: "6px",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.32)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": {
    maxHeight: "230px",
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    scrollbarColor: "var(--dispatch-script-popup-border) transparent",
    scrollbarWidth: "thin",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    alignItems: "center",
    color: "var(--dispatch-script-popup-text)",
    display: "flex",
    minHeight: "26px",
    padding: "3px 9px",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--dispatch-script-popup-selected)",
    color: "var(--dispatch-script-popup-selected-text)",
  },
  ".cm-completionIcon": {
    color: "var(--dispatch-script-function)",
    opacity: "0.8",
  },
  ".cm-completionLabel": {
    color: "inherit",
  },
  ".cm-completionMatchedText": {
    color: "var(--dispatch-script-function)",
    textDecoration: "none",
  },
  ".cm-completionDetail": {
    color: "var(--dispatch-script-popup-muted)",
    fontStyle: "italic",
    marginLeft: "10px",
  },
});

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ value, onChange, ariaLabel }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: "",
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        javascript(),
        syntaxHighlighting(dispatchHighlightStyle),
        autocompletion({ override: [dpCompletionSource], activateOnTyping: true }),
        dispatchTheme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={hostRef} className="dispatch-script-editor h-full min-h-0" />;
};
