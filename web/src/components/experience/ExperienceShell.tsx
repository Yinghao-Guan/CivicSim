"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useExperience } from "@/components/experience/ExperienceProvider";
import SceneErrorBoundary from "@/components/experience/SceneErrorBoundary";
import SceneFallback from "@/components/scene/SceneFallback";
import type { VisualStage } from "@/lib/experience-types";

const TwinCanvas = dynamic(() => import("@/components/scene/TwinCanvas"), {
  ssr: false,
  loading: () => <SceneFallback loading />,
});

const stageByPath: Record<string, VisualStage> = {
  "/": "hero",
  "/setup": "setup",
  "/simulate": "simulate",
  "/results": "results",
};

export default function ExperienceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { visualStage, setVisualStage } = useExperience();

  useEffect(() => {
    const nextStage = stageByPath[pathname];
    const isHeroExit = pathname === "/" && visualStage === "entering";
    if (nextStage && visualStage !== nextStage && !isHeroExit) setVisualStage(nextStage);
  }, [pathname, setVisualStage, visualStage]);

  // The studio and the /lab workbench draw the real map themselves, without the twin.
  if (pathname.startsWith("/lab") || pathname.startsWith("/studio")) return children;

  return (
    <div className={`experience-shell stage-${visualStage}`}>
      <div className="atmosphere" aria-hidden="true"><span /><span /><span /></div>
      <SceneErrorBoundary><TwinCanvas /></SceneErrorBoundary>
      <div className="scanlines" aria-hidden="true" />
      <div className="route-layer">{children}</div>
    </div>
  );
}
