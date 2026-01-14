import { useEffect, useState } from "react";

interface UseApiDocsNavigationOptions {
  sectionIds: string[];
  offset?: number;
  bottomOffset?: number;
}

export function useApiDocsNavigation({
  sectionIds,
  offset = 140,
  bottomOffset = 80,
}: UseApiDocsNavigationOptions) {
  const [activeSectionId, setActiveSectionId] = useState(
    sectionIds[0] ?? "introduction",
  );

  useEffect(() => {
    if (sectionIds.length === 0) return;
    if (!sectionIds.includes(activeSectionId)) {
      setActiveSectionId(sectionIds[0]);
    }
  }, [activeSectionId, sectionIds]);

  useEffect(() => {
    if (sectionIds.length === 0) return;

    const elements = sectionIds
      .map((id) => window.document.getElementById(id))
      .filter((value): value is HTMLElement => Boolean(value));

    if (elements.length === 0) return;

    const updateActiveSection = () => {
      const lastElement = elements[elements.length - 1];
      const pageHeight = document.documentElement.scrollHeight;
      const scrollPosition = window.scrollY + window.innerHeight;
      if (lastElement && scrollPosition >= pageHeight - bottomOffset) {
        setActiveSectionId(lastElement.id);
        return;
      }

      let current = elements[0]?.id ?? "introduction";
      for (const element of elements) {
        const top = element.getBoundingClientRect().top - offset;
        if (top <= 0) {
          current = element.id;
        } else {
          break;
        }
      }
      setActiveSectionId(current);
    };

    updateActiveSection();

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        updateActiveSection();
        ticking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [bottomOffset, offset, sectionIds]);

  return { activeSectionId };
}
