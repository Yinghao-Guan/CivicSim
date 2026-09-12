"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import SceneFallback from "@/components/scene/SceneFallback";

export default class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Twin scene failed", error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <SceneFallback />;
    return this.props.children;
  }
}
