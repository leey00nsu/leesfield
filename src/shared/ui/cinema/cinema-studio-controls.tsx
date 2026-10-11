"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { Camera, ChevronDown, ChevronUp, Clapperboard, Palette, RotateCcw } from "lucide-react";
import { cinemaOptionName, cinemaOptions, type CinemaCategory, type CinemaOption } from "@/shared/cinema/cinema-catalog";
import { cinemaPresetConflict, defaultCinemaSettings, hasCinemaGuidance, parseCinemaSettings, type CinemaMedia, type CinemaSettings } from "@/shared/cinema/cinema-contract";
import { AppButton } from "@/shared/ui/app-button";
import { AppDialog, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogDescription, AppDialogHeader, AppDialogTitle, AppDialogTrigger } from "@/shared/ui/app-dialog";
import { AppCloseButton } from "@/shared/ui/app-close-button";
import { AppPromptMessage } from "@/shared/ui/app-prompt-message";
import { cinemaShootingGuide } from "@/shared/cinema/cinema-shooting-guide";
import { CinemaImage } from "./cinema-image";
import { CinemaCoverflow } from "./cinema-coverflow";
import { CinemaPhotoPreview } from "./cinema-photo-preview";
import styles from "./cinema-studio-controls.module.css";

type Group = "shooting" | "visual" | "narrative";
type Props = {
  media: CinemaMedia;
  settings: unknown;
  onChange: (settings: CinemaSettings) => void;
  disabled?: boolean;
  supportsPrompt?: boolean;
  presetKey?: string;
  initialGroup?: Group;
};

function SelectionWheel({ category, value, disabled, onChange }: {
  category: "camera" | "lens" | "composition" | "aperture"; value: string; disabled: boolean; onChange: (id: string) => void;
}) {
  const t = useTranslations("cinema");
  const locale = useLocale();
  const reducedMotion = useReducedMotion();
  const guideId = useId();
  const options = cinemaOptions(category);
  const index = options.findIndex(option => option.id === value);
  const root = useRef<HTMLDivElement>(null);
  const step = (offset: number) => { if (!disabled) onChange(options[Math.max(0, Math.min(options.length - 1, index + offset))].id); };
  const wheelState = useRef({ index, disabled, options, onChange });
  useEffect(() => { wheelState.current = { index, disabled, options, onChange }; });
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!element.contains(document.activeElement) || wheelState.current.disabled || Math.abs(event.deltaY) < 8) return;
      event.preventDefault();
      const current = wheelState.current;
      const next = Math.max(0, Math.min(current.options.length - 1, current.index + Math.sign(event.deltaY)));
      if (next !== current.index) current.onChange(current.options[next].id);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);
  const selected = options[index];
  const name = (item: CinemaOption) => locale === "ko" ? item.ko : item.name;
  const hardware = category === "camera" || category === "lens";
  return <div ref={root} className={styles.wheel}>
    <button type="button" className={styles.step} disabled={disabled || index === 0} aria-label={t("previousCategory", { category: t(category) })} onClick={() => step(-1)}><ChevronUp size={16} /></button>
    <div className={styles.wheelTrack}>
      <div role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label={t(category)} aria-describedby={guideId} aria-valuemin={0} aria-valuemax={options.length - 1} aria-valuenow={index} aria-valuetext={name(selected)} aria-disabled={disabled}
        className={`${styles.selectedOval} ${category === "camera" || category === "lens" ? styles.hardware : styles.numeric}`}
        onKeyDown={event => {
          if (disabled || event.nativeEvent.isComposing) return;
          if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (event.key === "Home") onChange(options[0].id);
            else if (event.key === "End") onChange(options.at(-1)!.id);
            else step(event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1);
          }
        }}>
        <motion.div className={styles.wheelContents} aria-hidden="true" initial={false}
          animate={{ y: `${-index * 100}%` }} transition={{ duration: reducedMotion ? 0 : .38, ease: [.22, 1, .36, 1] }}>
          {options.map((item, i) => <div key={item.id} className={styles.wheelItem} style={{ top: `${i * 100}%` }}>
            {hardware && item.id !== "auto" ? <><CinemaImage option={item} /><span className={styles.ovalName}>{name(item)}</span></>
              : <span className={styles.valueOverlay}>{item.id === "auto" ? <span>Auto</span> : category === "composition" ? <span className={styles.shotName}>{name(item)}</span> : <><small>f/</small><strong>{item.name.replace("f/", "")}</strong></>}</span>}
          </div>)}
        </motion.div>
      </div>
    </div>
    <button type="button" className={styles.step} disabled={disabled || index === options.length - 1} aria-label={t("nextCategory", { category: t(category) })} onClick={() => step(1)}><ChevronDown size={16} /></button>
    <span className={styles.category}>{t(category)}</span><span className="sr-only" aria-live="polite">{name(selected)}</span>
    <p id={guideId} className={styles.selectionGuide}>{cinemaShootingGuide(category, value, locale)}</p>
  </div>;
}

function PhotoGrid({ category, value, disabled, onChange }: {
  category: CinemaCategory; value: string; disabled: boolean; onChange: (id: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("cinema");
  return <div className={styles.photoGrid} role="group" aria-label={t(category)}>
    {cinemaOptions(category).map(option => <button key={option.id} type="button" disabled={disabled} aria-pressed={option.id === value} className={styles.photoCard} onClick={() => onChange(option.id)}>
      <div className={styles.cardImage}><CinemaImage option={option} />{option.id === "auto" && <span className={styles.autoLabel}>Auto</span>}</div>
      {option.swatches && <div className={styles.swatches} aria-hidden="true">{option.swatches.map(color => <span key={color} style={{ background: color }} />)}</div>}
      <span className={styles.cardName}>{locale === "ko" ? option.ko : option.name}</span>
    </button>)}
  </div>;
}

export function CinemaStudioControls({ media, settings: raw, onChange, disabled = false, supportsPrompt = true, presetKey, initialGroup }: Props) {
  const t = useTranslations("cinema");
  const locale = useLocale();
  const instanceId = useId();
  const [group, setGroup] = useState<Group>(initialGroup ?? "shooting");
  const [open, setOpen] = useState(initialGroup !== undefined);
  const [shootingTab, setShootingTab] = useState<"setup" | "movement">("setup");
  const [visualTab, setVisualTab] = useState<"palette" | "lighting" | "artStyle">("palette");
  const [narrativeTab, setNarrativeTab] = useState<"genre" | "rhythm">("genre");
  let settings: CinemaSettings;
  let unsupported = false;
  try { settings = parseCinemaSettings(raw, media); } catch { unsupported = true; settings = defaultCinemaSettings(); }
  const blocked = disabled || unsupported || !supportsPrompt;
  const conflict = cinemaPresetConflict(settings, presetKey);
  const patch = (key: CinemaCategory, id: string) => { if (!blocked) onChange({ ...settings, [key]: id }); };
  const summary = (categories: CinemaCategory[]) => categories.filter(category => settings[category] !== "auto").map(category => cinemaOptionName(category, settings[category], locale)).join(" · ") || t("auto");
  const selectedGroup = group;
  const tabList = selectedGroup === "shooting" ? media === "video" ? ["setup", "movement"] as const : ["setup"] as const : selectedGroup === "visual" ? ["palette", "lighting", "artStyle"] as const : ["genre", "rhythm"] as const;
  const selectedTab = selectedGroup === "shooting" ? shootingTab : selectedGroup === "visual" ? visualTab : narrativeTab;
  const selectTab = (tab: string) => {
    if (selectedGroup === "shooting") setShootingTab(tab as typeof shootingTab);
    else if (selectedGroup === "visual") setVisualTab(tab as typeof visualTab);
    else setNarrativeTab(tab as typeof narrativeTab);
  };
  return <AppDialog open={open} onOpenChange={setOpen}>
    <div className={`${styles.controls} nodrag nopan nowheel`} data-cinema-controls="">
      <div className={styles.triggers}>
        {(media === "video" ? ["narrative", "visual", "shooting"] : ["visual", "shooting"]).map(item => {
          const key = item as Group;
          const Icon = key === "shooting" ? Camera : key === "visual" ? Palette : Clapperboard;
          const text = key === "shooting" ? settings.shootingEnabled ? summary(["camera", "lens", "composition", "aperture", ...(media === "video" ? ["movement" as const] : [])]) : t("off") : key === "visual" ? summary(["palette", "lighting", "artStyle"]) : summary(["genre", "rhythm"]);
          return <AppDialogTrigger key={key} asChild><AppButton type="button" variant="ghost" size="sm" className={styles.trigger} disabled={blocked} onClick={() => setGroup(key)} aria-label={`${t(key)}: ${text}`}><Icon size={15} /><span>{t(key)}</span><small>{text}</small><ChevronDown size={12} /></AppButton></AppDialogTrigger>;
        })}
      </div>
      {unsupported && <AppPromptMessage className={styles.notice}><span>{t("unsupported")}</span><AppButton type="button" size="sm" variant="surface" disabled={disabled} onClick={() => onChange(defaultCinemaSettings())}>{t("reset")}</AppButton></AppPromptMessage>}
      {!supportsPrompt && <AppPromptMessage className={styles.notice}><span>{t("promptUnsupported")}</span>{!unsupported && hasCinemaGuidance(settings, media) && <AppButton type="button" size="sm" variant="surface" disabled={disabled} onClick={() => onChange(defaultCinemaSettings())}>{t("reset")}</AppButton>}</AppPromptMessage>}
      {conflict && <AppPromptMessage className={styles.notice} role="status"><span>{t("presetConflict")}</span><AppButton type="button" size="sm" variant="surface" disabled={disabled} onClick={() => onChange({ ...settings, shootingEnabled: false })}>{t("disableShooting")}</AppButton></AppPromptMessage>}
    </div>
    <AppDialogContent size="xl" padding="none" showCloseButton={false} className={`${styles.dialog} nodrag nopan nowheel`}>
      <AppDialogHeader className={styles.header}>
        <AppDialogTitle className={styles.title}>{t(selectedGroup)}</AppDialogTitle>
        <div className={styles.headerActions}><AppButton type="button" variant="ghost" size="sm" disabled={disabled || !supportsPrompt} onClick={() => onChange(defaultCinemaSettings())}><RotateCcw size={14} />{t("reset")}</AppButton><AppDialogClose asChild><AppCloseButton /></AppDialogClose></div>
      </AppDialogHeader>
      <AppDialogDescription className="sr-only">{t("description")}</AppDialogDescription>
      <div className={styles.tabs} role="tablist" aria-label={t(selectedGroup)}>
        {tabList.map(tab => <button type="button" key={tab} role="tab" id={`${instanceId}-tab-${tab}`} aria-controls={`${instanceId}-panel-${selectedGroup}`} aria-selected={tab === selectedTab} tabIndex={tab === selectedTab ? 0 : -1} onClick={() => selectTab(tab)} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const index = tabList.findIndex(item => item === selectedTab);
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabList.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabList.length) % tabList.length;
          selectTab(tabList[next]);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next].focus();
        }}>{t(tab)}</button>)}
        {selectedGroup === "shooting" && <button type="button" role="switch" aria-checked={settings.shootingEnabled} aria-label={t("enableShooting")} disabled={blocked} className={styles.switch} onClick={() => { if (!blocked) onChange({ ...settings, shootingEnabled: !settings.shootingEnabled }); }}><span />{t(settings.shootingEnabled ? "on" : "off")}</button>}
      </div>
      <AppDialogBody className={styles.body} id={`${instanceId}-panel-${selectedGroup}`} role="tabpanel" aria-labelledby={`${instanceId}-tab-${selectedTab}`}>
        {selectedGroup === "shooting" && shootingTab === "setup" ? <>
          <CinemaPhotoPreview settings={settings} />
          <div className={styles.wheels} aria-disabled={!settings.shootingEnabled}>{(["camera", "lens", "composition", "aperture"] as const).map(category => <SelectionWheel key={category} category={category} value={settings[category]} disabled={blocked || !settings.shootingEnabled} onChange={id => patch(category, id)} />)}</div>
        </> : selectedGroup === "shooting" ? <PhotoGrid category="movement" value={settings.movement} disabled={blocked || !settings.shootingEnabled} onChange={id => patch("movement", id)} />
          : selectedGroup === "visual" && visualTab !== "artStyle" ? <PhotoGrid category={visualTab} value={settings[visualTab]} disabled={blocked} onChange={id => patch(visualTab, id)} />
          : <CinemaCoverflow key={selectedGroup === "visual" ? "artStyle" : narrativeTab} category={selectedGroup === "visual" ? "artStyle" : narrativeTab} value={settings[selectedGroup === "visual" ? "artStyle" : narrativeTab]} disabled={blocked} onChange={id => patch(selectedGroup === "visual" ? "artStyle" : narrativeTab, id)} />}
      </AppDialogBody>
    </AppDialogContent>
  </AppDialog>;
}
