import React, { useState, useEffect, createContext, useContext } from "react";
import * as LucideIcons from "lucide-react";

// Arc UI Components
import { Button } from "@/components/arc/button/button";
import { Rating } from "@/components/arc/rating/rating";
import { Switch } from "@/components/arc/switch/switch";
import { Progress } from "@/components/arc/progress/progress";
import { HoldToConfirm } from "@/components/arc/hold-to-confirm/hold-to-confirm";
import { SegmentedControl } from "@/components/arc/segmented-control/segmented-control";
import { ElasticSlider } from "@/components/arc/elastic-slider/elastic-slider";
import { Stepper } from "@/components/arc/stepper/stepper";
import { ExpandableText } from "@/components/arc/expandable-text/expandable-text";
import { InlineEdit } from "@/components/arc/inline-edit/inline-edit";

// -------------------------------------------------------------
// Schema Types
// -------------------------------------------------------------
export interface ActionDefinition {
  type: "set" | "toggle" | "increment" | "decrement" | "callLLM";
  target?: string;
  value?: any;
}

export interface UINode {
  type: string;
  state?: Record<string, any>;
  bind?: string;
  action?: ActionDefinition;
  layout?: {
    direction?: "row" | "column";
    gap?: "sm" | "md" | "lg";
    align?: "start" | "center" | "end";
    justify?: "start" | "center" | "between";
  };
  props?: Record<string, any> | null;
  children?: (UINode | null)[];
}

// -------------------------------------------------------------
// 1. Reactive State Context & Provider
// -------------------------------------------------------------
interface WidgetStateContextType {
  state: Record<string, any>;
  updateState: (key: string, value: any) => void;
  dispatchAction: (action?: ActionDefinition, fallbackActionId?: string) => void;
  interpolate: (str?: string) => string;
}

const WidgetStateContext = createContext<WidgetStateContextType | null>(null);

function WidgetStateProvider({
  node,
  onAction,
  children,
}: {
  node: UINode;
  onAction?: (actionId?: string, payload?: any) => void;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<Record<string, any>>(() => node.state || {});

  // Sync if new state keys stream in
  useEffect(() => {
    if (node.state && typeof node.state === "object") {
      setState((prev) => ({ ...node.state, ...prev }));
    }
  }, [node.state]);

  const updateState = (key: string, value: any) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const dispatchAction = (action?: ActionDefinition, fallbackActionId?: string) => {
    if (!action) {
      if (fallbackActionId) onAction?.(fallbackActionId, state);
      return;
    }

    const { type, target, value } = action;

    if (type === "callLLM") {
      onAction?.(target || fallbackActionId || "callLLM", state);
      return;
    }

    if (!target) return;

    setState((prev) => {
      const current = prev[target];
      let next = current;

      switch (type) {
        case "set":
          next = value;
          break;
        case "toggle":
          next = !current;
          break;
        case "increment":
          next = (Number(current) || 0) + (typeof value === "number" ? value : 1);
          break;
        case "decrement":
          next = (Number(current) || 0) - (typeof value === "number" ? value : 1);
          break;
      }

      return { ...prev, [target]: next };
    });
  };

  const interpolate = (template?: string): string => {
    if (!template || typeof template !== "string") return template || "";
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return state[key] !== undefined ? String(state[key]) : `{{${key}}}`;
    });
  };

  return (
    <WidgetStateContext.Provider
      value={{ state, updateState, dispatchAction, interpolate }}
    >
      {children}
    </WidgetStateContext.Provider>
  );
}

// -------------------------------------------------------------
// 2. Lucide Icon Resolver
// -------------------------------------------------------------
function DynamicIcon({
  name,
  className = "h-4 w-4 shrink-0",
}: {
  name?: string;
  className?: string;
}) {
  if (!name) return null;
  const pascalName = name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");

  const IconComponent =
    (LucideIcons as Record<string, any>)[pascalName] || LucideIcons.Sparkles;

  return <IconComponent className={className} />;
}

// -------------------------------------------------------------
// 3. Node Renderer
// -------------------------------------------------------------
function NodeRenderer({ node }: { node: UINode }) {
  const { state, updateState, dispatchAction, interpolate } =
    useContext(WidgetStateContext)!;

  const props = node.props && typeof node.props === "object" ? node.props : {};
  const layout = node.layout && typeof node.layout === "object" ? node.layout : {};
  const children = Array.isArray(node.children) ? node.children : [];
  const type = node.type || "Container";

  const renderChildren = (isRow: boolean) => {
    if (!children.length) return null;

    return children
      .filter((child): child is UINode => child !== null && typeof child === "object")
      .map((child, i) => {
        const isExpansive =
          child.type === "Container" ||
          child.type === "Progress" ||
          child.type === "ElasticSlider";

        return (
          <div
            key={i}
            className={
              isRow
                ? isExpansive
                  ? "flex-1 min-w-0 flex flex-col"
                  : "shrink-0 flex items-center"
                : "w-full"
            }
          >
            <NodeRenderer node={child} />
          </div>
        );
      });
  };

  switch (type) {
    // ---------------------------------------------------------
    // Primitives & Layout
    // ---------------------------------------------------------
    case "WidgetHeader":
      return (
        <div className="w-full flex items-center justify-between gap-3 pb-2.5 mb-1 border-b border-border/40">
          <div className="flex items-center gap-2.5 min-w-0">
            {props.iconName && (
              <div className="p-1.5 rounded-lg bg-muted text-foreground">
                <DynamicIcon name={props.iconName} className="h-4 w-4" />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              {props.title && (
                <h3 className="text-sm font-semibold text-foreground truncate leading-tight">
                  {interpolate(props.title)}
                </h3>
              )}
              {props.subtitle && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {interpolate(props.subtitle)}
                </p>
              )}
            </div>
          </div>
          {props.label && (
            <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border/40">
              {interpolate(props.label)}
            </span>
          )}
        </div>
      );

    case "Badge": {
      const variantClassMap: Record<string, string> = {
        primary: "bg-primary text-primary-foreground border-transparent",
        secondary: "bg-secondary text-secondary-foreground border-border/40",
        destructive: "bg-destructive text-destructive-foreground border-transparent",
        outline: "bg-transparent text-foreground border-border/60",
      };
      const badgeVariant =
        variantClassMap[props.variant || "secondary"] || variantClassMap.secondary;

      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${badgeVariant}`}
        >
          {props.iconName && <DynamicIcon name={props.iconName} className="h-3 w-3" />}
          {interpolate(props.label || props.text)}
        </span>
      );
    }

    case "Icon":
      return (
        <DynamicIcon
          name={props.iconName || props.label}
          className="h-4 w-4 text-foreground/80 shrink-0"
        />
      );

    case "Divider":
      return <hr className="w-full border-t border-border/40 my-1" />;

    case "Text": {
      const textVariantMap: Record<string, string> = {
        primary: "text-sm font-semibold text-foreground",
        secondary: "text-xs text-muted-foreground",
        destructive: "text-sm font-medium text-destructive",
        outline: "text-xs font-mono text-muted-foreground",
      };
      const textClass = textVariantMap[props.variant || ""] || "text-sm text-foreground/90";

      // If both label and dynamic text are provided (e.g. label: "Current Value", text: "{{count}}")
      if (props.label && props.text) {
        return (
          <div className="flex flex-col items-center justify-center my-1 text-center">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {interpolate(props.label)}
            </span>
            <span className="text-3xl font-bold tracking-tight text-foreground mt-0.5">
              {interpolate(props.text)}
            </span>
          </div>
        );
      }

      // Fallback if only label OR text is passed
      return <p className={textClass}>{interpolate(props.label || props.text)}</p>;
    }

    // ---------------------------------------------------------
    // Interactive Components
    // ---------------------------------------------------------
    case "Button": {
      const buttonVariantMap: Record<string, string> = {
        primary: "!bg-primary !text-primary-foreground hover:!bg-primary/90",
        secondary:
          "!bg-secondary !text-secondary-foreground !border !border-border/60 hover:!bg-secondary/80",
        destructive: "!bg-destructive !text-destructive-foreground hover:!bg-destructive/90",
        outline: "!bg-transparent !text-foreground !border !border-border hover:!bg-muted",
      };
      const buttonVariant = props.variant || "primary";

      return (
        <Button
          variant={buttonVariant}
          className={buttonVariantMap[buttonVariant] || buttonVariantMap.primary}
          onClick={() => dispatchAction(node.action, props.actionId)}
        >
          {props.iconName && <DynamicIcon name={props.iconName} className="mr-1.5 h-3.5 w-3.5" />}
          {interpolate(props.label || "Action")}
        </Button>
      );
    }

    case "HoldToConfirm":
      return (
        <HoldToConfirm
          label={interpolate(props.label || "Hold to Confirm")}
          onConfirm={() => dispatchAction(node.action, props.actionId || "confirmed")}
        />
      );

    case "Switch": {
      const isChecked = node.bind
        ? Boolean(state[node.bind] ?? props.checked)
        : Boolean(props.checked);

      return (
        <div className="flex items-center justify-between w-full gap-2">
          {props.label && (
            <span className="text-sm font-medium">{interpolate(props.label)}</span>
          )}
          <Switch
            label={props.label || "Toggle"}
            checked={isChecked}
            onCheckedChange={(checked) => {
              if (node.bind) updateState(node.bind, checked);
              dispatchAction(node.action, props.actionId);
            }}
          />
        </div>
      );
    }

    case "ElasticSlider": {
      const sliderVal = node.bind
        ? Number(state[node.bind] ?? props.value ?? 0)
        : Number(props.value ?? 50);

      return (
        <div className="w-full flex flex-col gap-1.5 py-1">
          <ElasticSlider
            label={interpolate(props.label || "Slider")}
            value={sliderVal}
            min={Number(props.min ?? 0)}
            max={Number(props.max ?? 100)}
            onValueChange={(val) => {
              if (node.bind) updateState(node.bind, val);
              dispatchAction(node.action, props.actionId);
            }}
          />
        </div>
      );
    }

    case "SegmentedControl": {
      const rawOptions = Array.isArray(props.options) ? props.options : ["Option 1", "Option 2"];
      const formattedOptions = rawOptions.filter(Boolean).map((opt: any) =>
        typeof opt === "string"
          ? { value: opt, label: interpolate(opt) }
          : { ...opt, label: interpolate(opt.label) }
      );

      const currentVal = node.bind
        ? state[node.bind] ?? formattedOptions[0]?.value ?? ""
        : formattedOptions[0]?.value ?? "";

      return (
        <div className="w-full py-1">
          <SegmentedControl
            className="w-full flex [&_button]:flex-1 [&_button]:justify-center"
            options={formattedOptions}
            value={currentVal}
            onValueChange={(val) => {
              if (node.bind) updateState(node.bind, val);
              dispatchAction(node.action, props.actionId);
            }}
          />
        </div>
      );
    }

    case "Rating": {
      const ratingVal = node.bind
        ? Number(state[node.bind] ?? props.value ?? 0)
        : Number(props.value ?? 0);

      return (
        <div className="flex items-center gap-2">
          {props.label && (
            <span className="text-sm font-medium">{interpolate(props.label)}</span>
          )}
          <Rating
            label={props.label || "Rating"}
            value={ratingVal}
            max={Number(props.max ?? 5)}
            readOnly={!node.bind && !props.actionId && !node.action}
            onChange={(val) => {
              if (node.bind) updateState(node.bind, val);
              dispatchAction(node.action, props.actionId);
            }}
          />
        </div>
      );
    }

    case "Progress": {
      const progressVal = node.bind
        ? Number(state[node.bind] ?? props.value ?? 0)
        : Number(props.value ?? 50);

      return (
        <div className="w-full flex flex-col gap-1">
          {props.label && (
            <span className="text-xs text-muted-foreground">
              {interpolate(props.label)}
            </span>
          )}
          <Progress value={progressVal} max={Number(props.max ?? 100)} />
        </div>
      );
    }

    case "InlineEdit": {
      const editValue = node.bind
        ? String(state[node.bind] ?? props.text ?? props.value ?? "")
        : String(props.text ?? props.value ?? "");

      return (
        <InlineEdit
          as="span"
          label={props.label || "Inline Field"}
          value={editValue}
          onSave={(next: string) => {
            if (node.bind) updateState(node.bind, next);
            dispatchAction(node.action, props.actionId);
          }}
        />
      );
    }

    case "Stepper": {
      const rawSteps = Array.isArray(props.steps) ? props.steps : ["Step 1", "Step 2", "Step 3"];
      const formattedSteps = rawSteps.filter(Boolean).map((step: any, idx: number) => {
        if (typeof step === "string") {
          return { id: String(idx), label: interpolate(step) };
        }
        return {
          id: step.id ? String(step.id) : String(idx),
          label: interpolate(step.label || step.title || `Step ${idx + 1}`),
          description: step.description ? interpolate(step.description) : undefined,
        };
      });

      const currentStep = node.bind
        ? Number(state[node.bind] ?? props.current ?? props.currentStep ?? 0)
        : Number(props.current ?? props.currentStep ?? 0);

      return (
        <div className="w-full py-1">
          <Stepper
            label={props.label || "Progress"}
            steps={formattedSteps}
            current={currentStep}
            onStepSelect={(idx) => {
              if (node.bind) updateState(node.bind, idx);
              dispatchAction(node.action, props.actionId);
            }}
          />
        </div>
      );
    }

    case "ExpandableText":
      return <ExpandableText text={interpolate(props.text || props.label || "")} />;

    // ---------------------------------------------------------
    // Container
    // ---------------------------------------------------------
    case "Container":
    default: {
      const isRow = layout.direction === "row";
      const dir = isRow ? "flex-row" : "flex-col";
      const gapMap: Record<string, string> = { sm: "gap-2", md: "gap-3.5", lg: "gap-5" };
      const gap = layout.gap ? gapMap[layout.gap] : "gap-3";

      const alignMap: Record<string, string> = {
        start: "items-start",
        center: "items-center",
        end: "items-end",
      };
      const align = layout.align ? alignMap[layout.align] : "";

      const justifyMap: Record<string, string> = {
        start: "justify-start",
        center: "justify-center",
        end: "justify-end",
        between: "justify-between",
      };
      const justify = layout.justify ? justifyMap[layout.justify] : "";

      return (
        <div className={`w-full flex ${dir} ${gap} ${align} ${justify}`}>
          {props?.label && (
            <h4 className="text-sm font-semibold">{interpolate(props.label)}</h4>
          )}
          {renderChildren(isRow)}
        </div>
      );
    }
  }
}

// -------------------------------------------------------------
// 4. Root DynamicUI Export
// -------------------------------------------------------------
export function DynamicUI({
  node,
  onAction,
}: {
  node: UINode | null;
  onAction?: (actionId?: string, payload?: any) => void;
}) {
  const existingContext = useContext(WidgetStateContext);

  if (!node || typeof node !== "object") return null;

  // If already inside a provider, render node directly
  if (existingContext) {
    return <NodeRenderer node={node} />;
  }

  // Root boundary: wrap with its own isolated WidgetStateProvider
  return (
    <WidgetStateProvider node={node} onAction={onAction}>
      <NodeRenderer node={node} />
    </WidgetStateProvider>
  );
}