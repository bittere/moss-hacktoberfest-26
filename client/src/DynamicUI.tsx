import React, { useState } from "react";

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

export interface UINode {
  type: string;
  layout?: {
    direction?: "row" | "column";
    gap?: "sm" | "md" | "lg";
    align?: "start" | "center" | "end";
    justify?: "start" | "center" | "between";
  };
  props?: Record<string, any>;
  children?: UINode[];
}

function DynamicInlineEdit({
  props,
  onAction,
}: {
  props: any;
  onAction?: (id?: string) => void;
}) {
  const initialValue = props.text ?? props.value ?? props.label ?? "Edit text";
  const [currentValue, setCurrentValue] = useState<string>(initialValue);

  return (
    <InlineEdit
      as="span"
      label={props.label || "Inline Field"}
      value={currentValue}
      onSave={(next: string) => {
        setCurrentValue(next);
        onAction?.(`${props.actionId || "edit"}:${next}`);
      }}
    />
  );
}

export function DynamicUI({
  node,
  onAction,
}: {
  node: UINode | null;
  onAction?: (id?: string) => void;
}) {
  if (!node) return null;

  const { type, props = {}, layout, children } = node;

  const renderChildren = () => {
    if (!children || !Array.isArray(children)) return null;
    return children.map((child, i) => (
      <DynamicUI key={i} node={child} onAction={onAction} />
    ));
  };

  switch (type) {
    // -------------------------------------------------------------
    // Stepper (Normalizes string[] -> { id, label }[] and maps currentStep)
    // -------------------------------------------------------------
    case "Stepper": {
      const rawSteps = props.steps || ["Step 1", "Step 2", "Step 3"];
      const formattedSteps = rawSteps.map((step: any, idx: number) => {
        if (typeof step === "string") {
          return { id: String(idx), label: step };
        }
        return {
          id: step.id ? String(step.id) : String(idx),
          label: step.label || step.title || `Step ${idx + 1}`,
          description: step.description,
        };
      });

      const currentIdx = Number(props.current ?? props.currentStep ?? 0);

      return (
        <div className="w-full py-1">
          <Stepper
            label={props.label || "Progress"}
            steps={formattedSteps}
            current={currentIdx}
            onStepSelect={(idx) => {
              if (props.actionId) onAction?.(`${props.actionId}:${idx}`);
            }}
          />
        </div>
      );
    }

    // -------------------------------------------------------------
    // Rating (Ensures required label and readOnly mode if no actionId)
    // -------------------------------------------------------------
    case "Rating":
      return (
        <div className="flex items-center gap-2">
          {props.label && <span className="text-sm font-medium">{props.label}</span>}
          <Rating
            label={props.label || "Rating"}
            defaultValue={Number(props.value ?? 0)}
            max={Number(props.max ?? 5)}
            readOnly={!props.actionId}
            onChange={(val) => {
              if (props.actionId) onAction?.(`${props.actionId}:${val}`);
            }}
          />
        </div>
      );

    // -------------------------------------------------------------
    // Progress
    // -------------------------------------------------------------
    case "Progress":
      return (
        <div className="w-full flex flex-col gap-1">
          {props.label && (
            <span className="text-xs text-muted-foreground">{props.label}</span>
          )}
          <Progress value={Number(props.value ?? 50)} max={Number(props.max ?? 100)} />
        </div>
      );

    // -------------------------------------------------------------
    // Button
    // -------------------------------------------------------------
    case "Button":
      return (
        <Button
          variant={props.variant || "primary"}
          onClick={() => onAction?.(props.actionId)}
        >
          {props.label || "Action"}
        </Button>
      );

    // -------------------------------------------------------------
    // Switch
    // -------------------------------------------------------------
    case "Switch":
      return (
        <div className="flex items-center justify-between w-full gap-2">
          {props.label && <span className="text-sm font-medium">{props.label}</span>}
          <Switch
            label={props.label || "Toggle"}
            defaultChecked={Boolean(props.checked)}
            onCheckedChange={(checked) => {
              if (props.actionId) onAction?.(`${props.actionId}:${checked}`);
            }}
          />
        </div>
      );

    // -------------------------------------------------------------
    // SegmentedControl
    // -------------------------------------------------------------
    case "SegmentedControl": {
      const rawOptions = props.options || ["Option 1", "Option 2"];
      const formattedOptions = rawOptions.map((opt: any) =>
        typeof opt === "string" ? { value: opt, label: opt } : opt
      );
      const defaultVal = formattedOptions[0]?.value || "";

      return (
        <div className="w-full flex justify-center py-1">
          <SegmentedControl
            options={formattedOptions}
            defaultValue={defaultVal}
            onValueChange={(val) => {
              if (props.actionId) onAction?.(`${props.actionId}:${val}`);
            }}
          />
        </div>
      );
    }

    // -------------------------------------------------------------
    // ElasticSlider
    // -------------------------------------------------------------
    case "ElasticSlider":
      return (
        <div className="w-full flex flex-col gap-1.5 py-1">
          <ElasticSlider
            label={props.label || "Slider"}
            defaultValue={Number(props.value ?? 50)}
            min={Number(props.min ?? 0)}
            max={Number(props.max ?? 100)}
            onValueChange={(val) => {
              if (props.actionId) onAction?.(`${props.actionId}:${val}`);
            }}
          />
        </div>
      );

    // -------------------------------------------------------------
    // HoldToConfirm
    // -------------------------------------------------------------
    case "HoldToConfirm":
      return (
        <HoldToConfirm
          label={props.label || "Hold to Confirm"}
          onConfirm={() => onAction?.(props.actionId || "confirmed")}
        />
      );

    // -------------------------------------------------------------
    // InlineEdit
    // -------------------------------------------------------------
    case "InlineEdit":
      return <DynamicInlineEdit props={props} onAction={onAction} />;

    // -------------------------------------------------------------
    // ExpandableText
    // -------------------------------------------------------------
    case "ExpandableText":
      return <ExpandableText text={props.text || props.label || ""} />;

    // -------------------------------------------------------------
    // Text
    // -------------------------------------------------------------
    case "Text":
      return <p className="text-sm text-foreground/90">{props.label || props.text}</p>;

    // -------------------------------------------------------------
    // Container
    // -------------------------------------------------------------
    case "Container":
    default: {
      const dir = layout?.direction === "row" ? "flex-row" : "flex-col";
      const gapMap: Record<string, string> = { sm: "gap-2", md: "gap-3.5", lg: "gap-5" };
      const gap = layout?.gap ? gapMap[layout.gap] : "gap-3";

      const alignMap: Record<string, string> = {
        start: "items-start",
        center: "items-center",
        end: "items-end",
      };
      const align = layout?.align ? alignMap[layout.align] : "";

      const justifyMap: Record<string, string> = {
        start: "justify-start",
        center: "justify-center",
        end: "justify-end",
        between: "justify-between",
      };
      const justify = layout?.justify ? justifyMap[layout.justify] : "";

      return (
        <div className={`arc-theme w-full flex ${dir} ${gap} ${align} ${justify}`} data-theme="dark">
          {props.label && <h4 className="text-sm font-semibold">{props.label}</h4>}
          {renderChildren()}
        </div>
      );
    }
  }
}