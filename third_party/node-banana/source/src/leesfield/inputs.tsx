"use client";
import {createContext,useContext,type ComponentType,type ComponentProps,type SelectHTMLAttributes,type InputHTMLAttributes,type ReactNode} from "react";
export type CanvasDialogProps={children:ReactNode;onClose:()=>void;title:string;componentName?:string;closeLabel?:string;className?:string;contentRef?:import("react").Ref<HTMLDivElement>;};
export type CanvasTabBarProps={value:string;onValueChange:(value:string)=>void;label:string;items:{value:string;label:string}[];};
export type CanvasButtonProps=ComponentProps<"button"> & {primary?:boolean};
export type CanvasFilterToolbarProps={search:string;onSearchChange:(value:string)=>void;searchLabel:string;filters:ReactNode;filterCount:number;onResetFilters:()=>void;children?:ReactNode};
export type CanvasModelListProps={items:readonly {id:string;name:string;modelId?:string;provider:string;type:"image"|"video"|"audio"|"llm";modalities:string[]}[];recentIds?:readonly string[];onSelect:(id:string)=>void;selectedId?:string|null;disabled?:boolean;loading:boolean;error:string|null;onRetry?:()=>void;onClear?:()=>void;children:ReactNode};
type InputComponents={ModelList?:ComponentType<CanvasModelListProps>;FilterToolbar?:ComponentType<CanvasFilterToolbarProps>;Badge?:ComponentType<{children:ReactNode}>;Button?:ComponentType<CanvasButtonProps>;Dialog?:ComponentType<CanvasDialogProps>;TabBar?:ComponentType<CanvasTabBarProps>;Select:ComponentType<SelectHTMLAttributes<HTMLSelectElement>>;Input:ComponentType<InputHTMLAttributes<HTMLInputElement>>;Textarea:ComponentType<ComponentProps<"textarea">>;Range:ComponentType<{value:number[];min:number;max:number;step:number;disabled?:boolean;labels:string[];onValueChange:(value:number[])=>void}>};
const fallback:InputComponents={Select:props=><select {...props}/>,Input:props=><input {...props}/>,Textarea:props=><textarea {...props}/>,Range:({value,labels,onValueChange,...props})=><div>{value.map((item,index)=><input key={index} type="range" aria-label={labels[index]} value={item} {...props} onChange={event=>onValueChange(value.map((current,at)=>at===index?Number(event.target.value):current))}/>)}</div>};
const Context=createContext(fallback);
export function CanvasInputProvider({value,children}:{value:InputComponents;children:ReactNode}){return <Context.Provider value={value}>{children}</Context.Provider>}
export function CanvasSelect(props:SelectHTMLAttributes<HTMLSelectElement>){const {Select}=useContext(Context);return <Select {...props}/>}
export function CanvasInput(props:InputHTMLAttributes<HTMLInputElement>){const {Input}=useContext(Context);return <Input {...props}/>}
export function CanvasTextarea(props:ComponentProps<"textarea">){const {Textarea}=useContext(Context);return <Textarea {...props}/>}
export function CanvasRange(props:ComponentProps<InputComponents["Range"]>){const {Range}=useContext(Context);return <Range {...props}/>}

export function CanvasDialog(props:CanvasDialogProps){const {Dialog}=useContext(Context);return Dialog?<Dialog {...props}/>:<div role="dialog" aria-label={props.title} data-node-banana-component={props.componentName} ref={props.contentRef} className={props.className}><button aria-label={props.closeLabel ?? "Close"} onClick={props.onClose}>×</button>{props.children}</div>}
export function CanvasTabBar(props:CanvasTabBarProps){const {TabBar}=useContext(Context);return TabBar?<TabBar {...props}/>:<div role="tablist" aria-label={props.label}>{props.items.map(item=><button key={item.value} role="tab" aria-selected={props.value===item.value} onClick={()=>props.onValueChange(item.value)}>{item.label}</button>)}</div>}

export function CanvasButton(props:CanvasButtonProps){const {Button}=useContext(Context);const {primary,...rest}=props;return Button?<Button {...props}/>:<button {...rest}/> }

export function CanvasFilterToolbar(props:CanvasFilterToolbarProps){const {FilterToolbar}=useContext(Context);return FilterToolbar?<FilterToolbar {...props}/>:<div className="flex flex-wrap gap-3"><CanvasInput aria-label={props.searchLabel} placeholder={props.searchLabel} value={props.search} onChange={event=>props.onSearchChange(event.target.value)}/>{props.filters}{props.children}</div>}
export function CanvasBadge({children}:{children:ReactNode}){const {Badge}=useContext(Context);return Badge?<Badge>{children}</Badge>:<span className="rounded bg-neutral-500/20 px-2 py-1 text-xs">{children}</span>}

export function CanvasModelList(props:CanvasModelListProps){const {ModelList}=useContext(Context);return ModelList?<ModelList {...props}/>:<>{props.children}</>}
