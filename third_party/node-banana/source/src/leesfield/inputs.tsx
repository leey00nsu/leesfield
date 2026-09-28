"use client";
import {createContext,useContext,type ComponentType,type ComponentProps,type SelectHTMLAttributes,type InputHTMLAttributes,type ReactNode} from "react";
export type CanvasDialogProps={children:ReactNode;onClose:()=>void;title:string;componentName?:string;closeLabel?:string;className?:string;contentRef?:import("react").Ref<HTMLDivElement>;};
export type CanvasTabBarProps={value:string;onValueChange:(value:string)=>void;label:string;items:{value:string;label:string}[];};
export type CanvasButtonProps=ComponentProps<"button"> & {primary?:boolean};
type InputComponents={Button?:ComponentType<CanvasButtonProps>;Dialog?:ComponentType<CanvasDialogProps>;TabBar?:ComponentType<CanvasTabBarProps>;Select:ComponentType<SelectHTMLAttributes<HTMLSelectElement>>;Input:ComponentType<InputHTMLAttributes<HTMLInputElement>>;Textarea:ComponentType<ComponentProps<"textarea">>;Range:ComponentType<{value:number[];min:number;max:number;step:number;disabled?:boolean;labels:string[];onValueChange:(value:number[])=>void}>};
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
