"use client";
import {
  Children,
  Fragment,
  isValidElement,
  useState,
  useRef,
  type ComponentProps,
  type ReactNode,
  type ReactElement,
  type SelectHTMLAttributes,
  type InputHTMLAttributes,
  type ChangeEvent,
} from "react";
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeading,
  AppDialogTitle,
} from "./app-dialog";
import { Tabs, TabsList, TabsTrigger } from "./brand/tabs/tabs";
import { AppButton } from "./app-button";
import type {
  CanvasButtonProps,
  CanvasDialogProps,
  CanvasTabBarProps,
} from "@node-banana-runtime/inputs";
import { CanvasInputProvider } from "@node-banana-runtime/inputs";
import {
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
  AppSelectContent,
  AppSelectItem,
} from "./app-select";
import { AppTextarea } from "./app-form-control";
import { AppInput } from "./app-input";
import { AppRangeSlider } from "./app-range-slider";
import { Switch } from "./brand/switch/switch";

function optionsFrom(
  children: ReactNode,
): { value: string; label: ReactNode; disabled?: boolean }[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const element = child as ReactElement<{
      children?: ReactNode;
      value?: string | number;
      disabled?: boolean;
    }>;
    if (element.type === Fragment || element.type === "optgroup")
      return optionsFrom(element.props.children).map((option) => ({
        ...option,
        disabled: option.disabled || element.props.disabled,
      }));
    return element.type === "option"
      ? [
          {
            value: String(element.props.value ?? element.props.children ?? ""),
            label: element.props.children,
            disabled: element.props.disabled,
          },
        ]
      : [];
  });
}
function inputEvent<T extends HTMLInputElement | HTMLSelectElement>(
  target: T,
): ChangeEvent<T> {
  // The vendor callback contract reads the form target; the shared controls own DOM interaction.
  return {
    target,
    currentTarget: target,
    type: "change",
    preventDefault() {},
    stopPropagation() {},
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
    persist() {},
  } as ChangeEvent<T>;
}
function Select({
  value,
  defaultValue,
  children,
  className,
  onChange,
  disabled,
  id,
  title,
  "aria-label": ariaLabel,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const [local, setLocal] = useState(String(defaultValue ?? ""));
  const options = optionsFrom(children);
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <AppSelectRoot
      onOpenChange={(open) => {
        if (open)
          setContainer(
            trigger.current?.closest<HTMLElement>(
              '[data-canvas-dialog-content], [role="dialog"]',
            ) ?? null,
          );
      }}
      value={String(value ?? local)}
      disabled={disabled}
      onValueChange={(next) => {
        setLocal(next);
        const target = document.createElement("select");
        const option = document.createElement("option");
        option.value = next;
        target.add(option);
        target.value = next;
        onChange?.(inputEvent(target));
      }}
    >
      <AppSelectTrigger
        ref={trigger}
        id={id}
        title={title}
        aria-label={ariaLabel}
        triggerSize="sm"
        className={[
          "nodrag nopan min-w-0 normal-case tracking-normal",
          ...(className
            ?.split(/\s+/)
            .filter((token) => /^(?:w-|min-w-|max-w-|flex-)/.test(token)) ??
            []),
        ].join(" ")}
      >
        <AppSelectValue />
      </AppSelectTrigger>
      <AppSelectContent
        container={container ?? undefined}
        className="z-[10002]"
      >
        {options.map((option, index) => (
          <AppSelectItem
            key={option.value + index}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </AppSelectRoot>
  );
}
function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const {
    type,
    value,
    defaultValue,
    checked,
    defaultChecked,
    onChange,
    disabled,
    id,
    name,
    min,
    max,
    step,
    title,
  } = props;
  const [local, setLocal] = useState(defaultChecked ?? false);
  const [number, setNumber] = useState(Number(defaultValue ?? min ?? 0));
  const change = (value: string, checked = false) => {
    const target = document.createElement("input");
    target.value = value;
    target.checked = checked;
    onChange?.(inputEvent(target));
  };
  if (type === "checkbox")
    return (
      <Switch
        id={id}
        name={name}
        title={title}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-label"] ? "" : undefined}
        disabled={disabled}
        checked={checked ?? local}
        onCheckedChange={(next) => {
          setLocal(next);
          change(String(value ?? "on"), next);
        }}
        className="nodrag nopan shrink-0"
      />
    );
  if (type === "range")
    return (
      <AppRangeSlider
        value={[Number(value ?? number)]}
        min={Number(min ?? 0)}
        max={Number(max ?? 100)}
        step={step === "any" ? 0.01 : Number(step ?? 1)}
        disabled={disabled}
        labels={[props["aria-label"] ?? title ?? name ?? ""]}
        onValueChange={([next]) => {
          setNumber(next);
          change(String(next));
        }}
      />
    );
  return <AppInput {...props} />;
}
function Textarea(props: ComponentProps<"textarea">) {
  return <AppTextarea {...props} />;
}
function Dialog({
  children,
  onClose,
  title,
  className,
  contentRef,
  componentName,
}: CanvasDialogProps) {
  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AppDialogContent
        data-node-banana-component={componentName}
        ref={contentRef}
        surface="canvas"
        padding="none"
        showCloseButton={false}
        className={className}
      >
        <AppDialogHeading className="px-6 py-4 border-b">
          <AppDialogTitle>{title}</AppDialogTitle>
        </AppDialogHeading>
        {children}
      </AppDialogContent>
    </AppDialog>
  );
}
function TabBar({ value, onValueChange, label, items }: CanvasTabBarProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      data-horizontal=""
    >
      <TabsList activateOnFocus aria-label={label}>
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
function CanvasAction({ primary, className, ...props }: CanvasButtonProps) {
  return (
    <AppButton
      variant={primary ? "primary" : "surface"}
      className={className}
      {...props}
    />
  );
}
const components = {
  Button: CanvasAction,
  Select,
  Input,
  Textarea,
  Range: AppRangeSlider,
  Dialog,
  TabBar,
};
export function AppCanvasInputProvider({ children }: { children: ReactNode }) {
  return (
    <CanvasInputProvider value={components}>{children}</CanvasInputProvider>
  );
}
