import type {
  AssistantPhasePayload,
  AssistantProcessTimelineItem,
  MessageThinking,
  ThinkingStepPayload,
} from "../types";

import { StopIcon } from "./StopIcon";

export function StockPickAssistantLabel() {
  return (
    <div className="flex items-center gap-2 pl-0.5">
      <div className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-600 text-[11px]">
        📈
      </div>
      <span className="text-xs font-medium text-slate-600">StockPick AI</span>
    </div>
  );
}

function mergeThoughtBody(step: ThinkingStepPayload): string {
  const nar = step.assistantNarrative?.trim() ?? "";
  const rea = step.reasoning?.trim() ?? "";
  if (!nar) return rea;
  if (!rea) return nar;
  if (nar === rea) return nar;
  if (rea.startsWith(nar) || nar.startsWith(rea)) return rea.length >= nar.length ? rea : nar;
  if (rea.includes(nar) && rea.length > nar.length) return rea;
  if (nar.includes(rea) && nar.length > rea.length) return nar;
  return `${nar}\n\n${rea}`;
}

// tampil split kalau dua field beneran beda. kalau overlap, satu blok aja
function thoughtDisplayParts(step: ThinkingStepPayload): {
  showSplit: boolean;
  reasoningPart: string;
  narrativePart: string;
  mergedFallback: string;
} {
  const rea = step.reasoning?.trim() ?? "";
  const nar = step.assistantNarrative?.trim() ?? "";
  const merged = mergeThoughtBody(step);
  if (!rea || !nar || rea === nar) {
    return { showSplit: false, reasoningPart: "", narrativePart: "", mergedFallback: merged };
  }
  if (rea.includes(nar) || nar.includes(rea)) {
    return { showSplit: false, reasoningPart: "", narrativePart: "", mergedFallback: merged };
  }
  return { showSplit: true, reasoningPart: rea, narrativePart: nar, mergedFallback: merged };
}

type ThoughtStepBlockProps = {
  step: ThinkingStepPayload;
  stepIndex: number;
  defaultOpen?: boolean;
  compact?: boolean;
};

const MCP_SERVER_LINE = "mcp/stockbit-screener";

export function ThoughtStepBlock({
  step,
  stepIndex,
  defaultOpen = false,
  compact = false,
}: ThoughtStepBlockProps) {
  const { showSplit, reasoningPart, narrativePart, mergedFallback } = thoughtDisplayParts(step);
  const hasBody = mergedFallback.length > 0;
  const toolNames: string[] =
    step.followingTools && step.followingTools.length > 0
      ? step.followingTools
      : step.followingTool
        ? [step.followingTool]
        : [];

  return (
    <details
      open={defaultOpen}
      className={
        compact
          ? "group rounded-lg border border-slate-500/12 bg-slate-900/40 [&_summary::-webkit-details-marker]:hidden"
          : "group mb-2 rounded-lg border border-slate-500/15 bg-slate-950/80 [&_summary::-webkit-details-marker]:hidden"
      }
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-2 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-400">
        <span className="text-slate-600 transition-transform group-open:rotate-90">▸</span>
        <span className="tabular-nums text-emerald-600/90">Model turn · {step.seconds.toFixed(2)}s</span>
        {toolNames.length > 0 ? (
          <span className="text-[10px] text-slate-700">
            then {toolNames.length} tool{toolNames.length > 1 ? " (sequential)" : ""}
          </span>
        ) : (
          <span className="text-[10px] text-slate-700">step {stepIndex + 1}</span>
        )}
      </summary>
      <div className="border-t border-slate-500/10 px-2.5 pb-2.5 pt-1">
        {toolNames.length > 0 ? (
          <div className="mb-2.5 space-y-2.5 border-b border-slate-500/10 pb-2.5">
            {toolNames.map((name) => (
              <div key={name} className="min-w-0">
                <div className="break-all font-mono text-[10px] text-slate-500">{name}</div>
                <div className="text-[10px] text-slate-700">{MCP_SERVER_LINE}</div>
              </div>
            ))}
          </div>
        ) : null}
        {showSplit ? (
          <div className="space-y-2.5">
            <div>
              <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-slate-600">
                Reasoning (internal)
              </div>
              <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950/60 p-2 text-[11px] leading-relaxed text-slate-500">
                {reasoningPart}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-emerald-600/80">
                {toolNames.length > 0 ? "Respons model · menuju pemanggilan tool" : "Konten model"}
              </div>
              <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md border border-emerald-500/10 bg-emerald-950/20 p-2 text-[11px] leading-relaxed text-slate-300">
                {narrativePart}
              </pre>
            </div>
          </div>
        ) : hasBody ? (
          <div>
            <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-slate-600">
              {toolNames.length > 0 ? "Ringkasan putaran (reasoning + narasi)" : "Keluaran model"}
            </div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-400">
              {mergedFallback}
            </pre>
          </div>
        ) : (
          <p className="text-[10px] text-slate-600 italic">(tanpa narasi / reasoning dari model)</p>
        )}
      </div>
    </details>
  );
}

function formatJson(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ToolCallBlock({
  name,
  status,
  error,
  arguments: args,
  result,
}: {
  name: string;
  status: "running" | "done" | "error";
  error?: string;
  arguments?: Record<string, unknown>;
  result?: string;
}) {
  const hasArgs = args != null && Object.keys(args).length > 0;
  const argsStr = hasArgs ? JSON.stringify(args) : null;
  const argsPretty = hasArgs ? formatJson(args as Record<string, unknown>) : null;
  const hasResult = result !== undefined && result.length > 0;
  // auto-expand pas running biar user bisa liat progress
  const defaultOpen = status === "running";

  return (
    <details
      open={defaultOpen}
      className="group w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-violet-500/15 bg-violet-950/15 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors hover:bg-violet-950/25">
        <span className="shrink-0 text-[10px] text-violet-400/70 transition-transform group-open:rotate-90">
          ▸
        </span>
        <span className="shrink-0">
          {status === "running" ? (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-400" />
          ) : status === "error" ? (
            <span className="text-[10px] text-amber-500">✗</span>
          ) : (
            <span className="text-[10px] text-emerald-500/90">✓</span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-violet-300/90">
          {name}
        </span>
        <span className="shrink-0 rounded-md border border-slate-500/15 bg-slate-900/60 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
          mcp/stockbit-screener
        </span>
      </summary>
      <div className="min-w-0 space-y-1 border-t border-violet-500/10 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed">
        {error ? (
          <div className="break-words text-amber-500/80">Error: {error}</div>
        ) : null}
        {argsStr ? (
          <details className="group/inner min-w-0 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 rounded px-0.5 py-0.5 text-slate-500 transition-colors hover:text-slate-300">
              <span className="shrink-0 text-slate-700 transition-transform group-open/inner:rotate-90">
                &gt;
              </span>
              <span className="shrink-0 text-slate-600">Arguments:</span>
              <span className="min-w-0 flex-1 truncate text-slate-500 group-open/inner:hidden">
                {argsStr}
              </span>
            </summary>
            <pre
              className="mt-1 max-h-48 w-full max-w-full overflow-auto rounded-md bg-slate-950/80 p-2 text-[10px] leading-relaxed text-slate-400"
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}
            >
              {argsPretty ?? argsStr}
            </pre>
          </details>
        ) : null}
        {hasResult ? (
          <details className="group/inner min-w-0 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 rounded px-0.5 py-0.5 text-slate-500 transition-colors hover:text-slate-300">
              <span className="shrink-0 text-slate-700 transition-transform group-open/inner:rotate-90">
                &gt;
              </span>
              <span className="shrink-0 text-slate-600">Result:</span>
              <span className="min-w-0 flex-1 truncate text-slate-500 group-open/inner:hidden">
                {result}
              </span>
            </summary>
            <pre
              className="mt-1 max-h-64 w-full max-w-full overflow-auto rounded-md bg-slate-950/80 p-2 text-[10px] leading-relaxed text-slate-400"
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}
            >
              {result}
            </pre>
          </details>
        ) : null}
        {status === "running" && !argsStr && !hasResult ? (
          <div className="text-slate-600">Menjalankan…</div>
        ) : null}
      </div>
    </details>
  );
}

export function ProcessTimelineList({
  items,
  compactThoughts = false,
  className = "",
}: {
  items: AssistantProcessTimelineItem[];
  compactThoughts?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {items.map((item) => {
        if (item.kind === "thought") {
          return (
            <ThoughtStepBlock
              key={item.id}
              step={item.step}
              stepIndex={item.thoughtIndex}
              compact={compactThoughts}
            />
          );
        }
        return (
          <ToolCallBlock
            key={item.id}
            name={item.name}
            status={item.status}
            error={item.error}
            arguments={item.arguments}
            result={item.result}
          />
        );
      })}
    </div>
  );
}

// bangun payload thinking yg di-embed ke pesan asisten, dipakai kalau server
// tidak kirim metadata via SSE
export function timelineToMessageThinking(
  items: AssistantProcessTimelineItem[],
  deltaBuffer: string,
  wallSeconds: number
): MessageThinking | null {
  const steps: ThinkingStepPayload[] = [];
  const tools: MessageThinking["tools"] = [];
  let maxStepSec = 0;
  for (const item of items) {
    if (item.kind === "thought") {
      steps.push(item.step);
      maxStepSec = Math.max(maxStepSec, item.step.seconds);
    } else {
      tools.push({
        name: item.name,
        ok: item.status === "done",
        ...(item.error ? { error: item.error } : {}),
        ...(item.arguments ? { arguments: item.arguments } : {}),
        ...(item.result ? { result: item.result } : {}),
      });
    }
  }
  const delta = deltaBuffer.trim();
  const reasoningParts: string[] = [];
  for (const st of steps) {
    const body = mergeThoughtBody(st);
    if (body) reasoningParts.push(body);
  }
  if (delta) reasoningParts.push(delta);
  const reasoning = reasoningParts.join("\n\n");
  if (steps.length === 0 && tools.length === 0 && !reasoning) return null;
  const seconds = Math.max(wallSeconds, maxStepSec, 0.01);
  return {
    seconds,
    reasoning,
    tools,
    ...(steps.length > 0 ? { steps } : {}),
  };
}

export function buildPersistedTimeline(thinking: MessageThinking): AssistantProcessTimelineItem[] {
  const steps = thinking.steps;
  const tools = thinking.tools ?? [];
  if (!steps?.length) return [];

  const out: AssistantProcessTimelineItem[] = [];
  let ti = 0;
  for (let si = 0; si < steps.length; si++) {
    const st = steps[si]!;
    out.push({
      kind: "thought",
      id: `persist-th-${si}`,
      step: st,
      thoughtIndex: si,
    });
    if (st.followingTool && ti < tools.length) {
      const n = Math.max(1, st.followingTools?.length ?? 1);
      for (let k = 0; k < n && ti < tools.length; k++) {
        const t = tools[ti]!;
        out.push({
          kind: "tool",
          id: `persist-tl-${ti}`,
          name: t.name,
          status: t.ok ? "done" : "error",
          ...(t.error ? { error: t.error } : {}),
          ...(t.arguments && Object.keys(t.arguments).length > 0 ? { arguments: t.arguments } : {}),
          ...(t.result && t.result.length > 0 ? { result: t.result } : {}),
        });
        ti++;
      }
    }
  }
  while (ti < tools.length) {
    const t = tools[ti]!;
    out.push({
      kind: "tool",
      id: `persist-tl-extra-${ti}`,
      name: t.name,
      status: t.ok ? "done" : "error",
      ...(t.error ? { error: t.error } : {}),
      ...(t.arguments && Object.keys(t.arguments).length > 0 ? { arguments: t.arguments } : {}),
      ...(t.result && t.result.length > 0 ? { result: t.result } : {}),
    });
    ti++;
  }
  return out;
}

type ThinkingCollapsibleProps = {
  thinking: MessageThinking;
  defaultOpen?: boolean;
};

export function ThinkingCollapsible({ thinking, defaultOpen = false }: ThinkingCollapsibleProps) {
  const steps = thinking.steps ?? [];
  const reasoning = thinking.reasoning?.trim() ?? "";
  const tools = thinking.tools ?? [];

  if (steps.length > 0) {
    const timeline = buildPersistedTimeline(thinking);
    return (
      <details
        open={defaultOpen}
        className="group mb-3 rounded-xl border border-slate-500/15 bg-slate-950/80 [&_summary::-webkit-details-marker]:hidden"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-400">
          <span className="text-slate-600 transition-transform group-open:rotate-90">▸</span>
          <span>Model flow · {thinking.seconds.toFixed(2)}s total</span>
        </summary>
        <div className="border-t border-slate-500/10 px-3 pb-3 pt-2">
          <AssistantProcessChatRows
            items={timeline}
            perRowAssistantLabel={false}
            collapseAllThoughtSteps
          />
        </div>
      </details>
    );
  }

  const hasReasoning = reasoning.length > 0;
  const hasTools = tools.length > 0;
  const subtitle =
    !hasReasoning && !hasTools ? " · model tidak mengeluarkan blok reasoning" : "";

  return (
    <details
      open={defaultOpen}
      className="group mb-3 rounded-xl border border-slate-500/15 bg-slate-950/80 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-400">
        <span className="text-slate-600 transition-transform group-open:rotate-90">▸</span>
        <span>
          Thinking for {thinking.seconds.toFixed(2)}s
          {subtitle}
        </span>
      </summary>
      <div className="border-t border-slate-500/10 px-3 pb-3 pt-1 text-[12px] leading-relaxed text-slate-500">
        {hasTools ? (
          <div className="mb-2.5">
            <div className="mb-1 font-medium text-slate-600">Tool</div>
            <ul className="space-y-2">
              {tools.map((t, i) => (
                <li key={`${t.name}-${i}`} className="rounded-lg border border-slate-500/10 bg-slate-900/40 p-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px]">
                    <span className={t.ok ? "text-emerald-600/90" : "text-amber-600/90"}>
                      {t.ok ? "✓" : "✗"} {t.name}
                    </span>
                    {t.error ? <span className="text-amber-500/80">({t.error})</span> : null}
                  </div>
                  {t.arguments && Object.keys(t.arguments).length > 0 ? (
                    <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-500">
                      {formatJson(t.arguments)}
                    </pre>
                  ) : null}
                  {t.result && t.result.length > 0 ? (
                    <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-500">
                      {t.result}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {hasReasoning ? (
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-900/60 p-2.5 text-[11px] text-slate-400">
            {reasoning}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

type AssistantProcessChatRowsProps = {
  items: AssistantProcessTimelineItem[];
  streamingReasoning?: string;
  // setelah tool end, chunk berikutnya dari model = narasi pasca-tool
  streamingNarrativeAfterTool?: boolean;
  // dari SSE assistant_phase: langkah + tool batch
  phaseInfo?: AssistantPhasePayload | null;
  showWaitingPulse?: boolean;
  elapsedSec?: number;
  // false = label sudah dipakai di bubble asisten (pesan tersimpan)
  perRowAssistantLabel?: boolean;
  // dari DB: semua thought collapsed
  collapseAllThoughtSteps?: boolean;
  onStop?: () => void;
};

// satu entri timeline = satu blok di alur chat
export function AssistantProcessChatRows({
  items,
  streamingReasoning = "",
  streamingNarrativeAfterTool = false,
  phaseInfo = null,
  showWaitingPulse = false,
  elapsedSec,
  perRowAssistantLabel = true,
  collapseAllThoughtSteps = false,
  onStop,
}: AssistantProcessChatRowsProps) {
  const live = streamingReasoning.trim();
  const showLive = live.length > 0;
  const phaseLabel = phaseInfo?.label?.trim() ?? "";

  const showSingleLabel =
    perRowAssistantLabel && (items.length > 0 || showLive || showWaitingPulse);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {showSingleLabel ? <StockPickAssistantLabel /> : null}

      {elapsedSec != null && elapsedSec > 0 && (items.length > 0 || showLive || showWaitingPulse) ? (
        <div className="pl-0.5 text-[10px] tabular-nums text-slate-600">
          Running <span className="font-mono text-emerald-600/80">{elapsedSec.toFixed(1)}</span>s
        </div>
      ) : null}

      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <div key={item.id} className="flex w-full min-w-0 max-w-full flex-col gap-1.5">
            {item.kind === "thought" ? (
              <ThoughtStepBlock
                step={item.step}
                stepIndex={item.thoughtIndex}
                compact={false}
                defaultOpen={collapseAllThoughtSteps ? false : isLast}
              />
            ) : (
              <ToolCallBlock
                name={item.name}
                status={item.status}
                error={item.error}
                arguments={item.arguments}
                result={item.result}
              />
            )}
          </div>
        );
      })}

      {showLive ? (
        <div className="flex w-full min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className={
                "text-[9px] font-medium uppercase tracking-wide " +
                (streamingNarrativeAfterTool ? "text-emerald-600/90" : "text-slate-600")
              }
            >
              {streamingNarrativeAfterTool
                ? "Respons model (setelah hasil tool)"
                : "Alur berpikir model (streaming)"}
            </div>
            {onStop ? (
              <button
                type="button"
                onClick={onStop}
                title="Hentikan respons"
                aria-label="Hentikan respons"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-500/25 bg-slate-800/80 text-slate-200 transition-colors hover:bg-slate-700/90"
              >
                <StopIcon className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <pre
            className={
              "max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg p-2.5 text-[11px] leading-relaxed " +
              (streamingNarrativeAfterTool
                ? "border border-emerald-500/20 bg-emerald-950/25 text-slate-200"
                : "border border-slate-500/12 bg-slate-950/80 text-slate-400")
            }
          >
            {streamingReasoning}
            <span
              className="inline-block w-0.5 animate-pulse bg-emerald-500/80"
              style={{ height: "0.85em", marginLeft: 1 }}
            />
          </pre>
        </div>
      ) : null}

      {showWaitingPulse ? (
        <div className="flex w-full min-w-0 flex-col gap-1.5">
          <div className="text-[9px] font-medium uppercase tracking-wide text-slate-600">
            {phaseInfo != null
              ? `Menunggu model · langkah ${phaseInfo.step + 1}`
              : "Menunggu model"}
          </div>
          <div className="flex flex-col gap-2.5 rounded-lg border border-slate-500/12 bg-slate-950/50 px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0 flex-1 text-[11px] leading-snug text-slate-400">
                {phaseLabel || "Memproses respons — belum ada chunk dari model."}
              </span>
              {onStop ? (
                <button
                  type="button"
                  onClick={onStop}
                  title="Hentikan respons"
                  aria-label="Hentikan respons"
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-500/25 bg-slate-800/80 text-slate-200 transition-colors hover:bg-slate-700/90"
                >
                  <StopIcon className="h-3 w-3" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-emerald-500/70"
                      style={{
                        animation: "chat-typing-dot 1.2s ease-in-out infinite",
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
