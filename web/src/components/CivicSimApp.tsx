"use client";

import dynamic from "next/dynamic";
import {
  Accessibility,
  ArrowUpRight,
  BadgeInfo,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CloudSun,
  Flame,
  Info,
  Layers3,
  MapPin,
  Pause,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Users,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { GroupId, LayerState, SiteId } from "@/lib/types";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <span className="map-loading__pulse" />
      Loading neighborhood model…
    </div>
  ),
});

const sites = {
  a: {
    id: "a" as const,
    name: "Site A",
    place: "South Park Rec Center",
    population: 11130,
    vulnerable: 4020,
    wheelchair: 68,
    exposure: 15.7,
    capacity: 64,
    cost: "$310K",
  },
  b: {
    id: "b" as const,
    name: "Site B",
    place: "The Beehive",
    population: 12980,
    vulnerable: 5340,
    wheelchair: 82,
    exposure: 12.9,
    capacity: 93,
    cost: "$470K",
  },
  c: {
    id: "c" as const,
    name: "Site C",
    place: "Florence Library",
    population: 13410,
    vulnerable: 5110,
    wheelchair: 71,
    exposure: 14.1,
    capacity: 122,
    cost: "$390K",
  },
};

const groups: { id: GroupId; label: string; icon: typeof Users }[] = [
  { id: "all", label: "All residents", icon: Users },
  { id: "heat", label: "Heat-vulnerable", icon: Flame },
  { id: "mobility", label: "Mobility devices", icon: Accessibility },
];

const layerOptions: {
  id: keyof LayerState;
  label: string;
  icon: typeof Flame;
  color: string;
}[] = [
  { id: "heat", label: "Heat vulnerability", icon: Flame, color: "#ef8055" },
  { id: "residents", label: "Synthetic residents", icon: Users, color: "#326fce" },
  { id: "routes", label: "Modeled routes", icon: Route, color: "#05a989" },
  { id: "facilities", label: "Candidate facilities", icon: Building2, color: "#7257c7" },
];

const runStages = [
  "Sampling resident journeys",
  "Applying mobility constraints",
  "Routing residents",
  "Calculating equity metrics",
  "Comparison ready",
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function CivicSimApp() {
  const [activeMode, setActiveMode] = useState("Compare");
  const [selectedSite, setSelectedSite] = useState<SiteId>("b");
  const [activeGroup, setActiveGroup] = useState<GroupId>("all");
  const [layers, setLayers] = useState<LayerState>({ heat: true, residents: true, routes: true, facilities: true });
  const [running, setRunning] = useState(false);
  const [runStage, setRunStage] = useState(4);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setRunStage((current) => {
        if (current >= runStages.length - 1) {
          window.clearInterval(timer);
          setRunning(false);
          return runStages.length - 1;
        }
        return current + 1;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [running]);

  const selected = sites[selectedSite];
  const primaryValue = useMemo(() => {
    if (activeGroup === "heat") return selected.vulnerable;
    if (activeGroup === "mobility") return selected.wheelchair;
    return selected.population;
  }, [activeGroup, selected]);

  const runSimulation = () => {
    setRunStage(0);
    setRunning(true);
    setPlaying(true);
  };

  const toggleLayer = (id: keyof LayerState) => {
    setLayers((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><div className="brand-name">CivicSim</div><div className="brand-kicker">Neighborhood decision studio</div></div>
        </div>
        <div className="location-chip"><MapPin size={14} /><span>South LA · The Beehive</span><ChevronDown size={14} /></div>
        <nav className="mode-tabs" aria-label="Workspace modes">
          {["Explore", "Design", "Compare"].map((mode) => (
            <button className={activeMode === mode ? "active" : ""} key={mode} onClick={() => setActiveMode(mode)}>{mode}</button>
          ))}
        </nav>
        <div className="topbar-actions">
          <button className="data-chip"><span className="status-dot" />Data current · Aug 2026</button>
          <button className="icon-button" aria-label="About this model"><Info size={18} /></button>
          <div className="avatar">GY</div>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-panel">
          <div className="panel-scroll">
            <section className="eyebrow-section">
              <p className="eyebrow">Active question</p>
              <h1>Where should we open one new cooling center?</h1>
              <div className="constraint-row"><CircleDollarSign size={15} /><span>Budget under $500K</span></div>
            </section>

            <section className="control-section">
              <div className="section-heading"><span>Priority group</span><BadgeInfo size={14} /></div>
              <div className="segmented-list">
                {groups.map((group) => {
                  const Icon = group.icon;
                  return (
                    <button key={group.id} className={activeGroup === group.id ? "active" : ""} onClick={() => setActiveGroup(group.id)}>
                      <Icon size={16} /><span>{group.label}</span>{activeGroup === group.id && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="control-section">
              <div className="section-heading"><span>Map layers</span><Layers3 size={14} /></div>
              <div className="layer-list">
                {layerOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button key={option.id} onClick={() => toggleLayer(option.id)}>
                      <span className="layer-icon" style={{ "--layer-color": option.color } as React.CSSProperties}><Icon size={15} /></span>
                      <span>{option.label}</span>
                      <span className={`switch ${layers[option.id] ? "on" : ""}`}><span /></span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="model-note">
              <Sparkles size={16} /><div><strong>2,500 synthetic journeys</strong><p>Illustrative population · fixed seed 24791</p></div><ArrowUpRight size={15} />
            </section>
          </div>
        </aside>

        <section className="map-stage" aria-label="South Los Angeles simulation map">
          <MapCanvas layers={layers} selectedSite={selectedSite} onSelectSite={setSelectedSite} playing={playing} />
          <div className="map-context-card">
            <div className="map-context-icon"><SunMedium size={17} /></div>
            <div><span>Extreme heat scenario</span><strong>98°F · Tuesday, 2:00 PM</strong></div><ChevronDown size={15} />
          </div>
          <div className="map-legend">
            <span><i className="legend-line" /> Modeled journey</span><span><i className="legend-dot" /> Synthetic resident</span><span><i className="legend-heat" /> Higher heat exposure</span>
          </div>
          <div className="selected-site-label">
            <span className="selected-site-letter">{selected.name.slice(-1)}</span>
            <div><small>Selected proposal</small><strong>{selected.place}</strong></div>
          </div>
        </section>

        <aside className="right-panel">
          <div className="results-header">
            <div><p className="eyebrow">Scenario comparison</p><h2>Three viable sites</h2></div>
            <button className="icon-button soft" aria-label="View assumptions"><ShieldCheck size={17} /></button>
          </div>

          <div className="recommendation">
            <div className="recommendation-icon"><WandSparkles size={16} /></div>
            <div><span>Best balance for selected priorities</span><strong>Site B serves more vulnerable residents without exceeding capacity.</strong></div>
          </div>

          <div className="site-tabs" role="tablist" aria-label="Candidate sites">
            {(Object.values(sites) as (typeof sites)[SiteId][]).map((site) => (
              <button role="tab" aria-selected={selectedSite === site.id} className={selectedSite === site.id ? "active" : ""} key={site.id} onClick={() => setSelectedSite(site.id)}>
                <span>{site.name}</span>{site.id === "b" && <em>Balanced</em>}
              </button>
            ))}
          </div>

          <div className="primary-metric">
            <div className="metric-label">
              {activeGroup === "all" && <Users size={16} />}{activeGroup === "heat" && <Flame size={16} />}{activeGroup === "mobility" && <Accessibility size={16} />}
              <span>{activeGroup === "all" && "Residents within 15 minutes"}{activeGroup === "heat" && "Heat-vulnerable residents reached"}{activeGroup === "mobility" && "Wheelchair-accessible reach"}</span>
            </div>
            <div className="metric-value-row">
              <strong>{activeGroup === "mobility" ? `${primaryValue}%` : formatNumber(primaryValue)}</strong>
              <span className="delta">+{activeGroup === "mobility" ? "21 pts" : "54%"}</span>
            </div>
            <p>Compared with the current neighborhood baseline</p>
            <div className="comparison-bars">
              <div><span>Baseline</span><i><b style={{ width: "48%" }} /></i><small>{activeGroup === "mobility" ? "61%" : "8,420"}</small></div>
              <div><span>{selected.name}</span><i><b className="proposal" style={{ width: `${Math.min(94, 70 + (selected.id === "c" ? 8 : selected.id === "b" ? 5 : 0))}%` }} /></i><small>{activeGroup === "mobility" ? `${selected.wheelchair}%` : formatNumber(primaryValue)}</small></div>
            </div>
          </div>

          <div className="metric-grid">
            <article><span className="mini-icon orange"><CloudSun size={15} /></span><div><small>Heat exposure</small><strong>{selected.exposure} min</strong></div><em>−5.5 min</em></article>
            <article><span className="mini-icon blue"><Accessibility size={15} /></span><div><small>Accessible reach</small><strong>{selected.wheelchair}%</strong></div><em>+21 pts</em></article>
            <article><span className="mini-icon violet"><Users size={15} /></span><div><small>Demand / capacity</small><strong>{selected.capacity}%</strong></div><em className={selected.capacity > 100 ? "warning" : ""}>{selected.capacity > 100 ? "Over" : "Within"}</em></article>
            <article><span className="mini-icon green"><CircleDollarSign size={15} /></span><div><small>Setup cost</small><strong>{selected.cost}</strong></div><em>Estimate</em></article>
          </div>

          <button className="underserved-card">
            <span className="underserved-marker"><MapPin size={16} /></span><div><strong>2 blocks remain underserved</strong><small>View residents outside the 15-minute threshold</small></div><ArrowUpRight size={16} />
          </button>
          <div className="confidence-row"><Info size={14} /><span>Illustrative model · 30 sensitivity runs</span><button>Assumptions</button></div>
        </aside>
      </div>

      <footer className="simulation-dock">
        <div className="dock-status">
          <span className={`run-indicator ${running ? "running" : ""}`}>{running ? <Clock3 size={16} /> : <Check size={16} />}</span>
          <div><strong>{running ? runStages[runStage] : "Simulation complete"}</strong><small>{running ? `Step ${runStage + 1} of ${runStages.length}` : "2,500 agents · 30 runs · 3.2 sec"}</small></div>
        </div>
        <div className="progress-rail" aria-label="Simulation progress">
          {runStages.map((stage, index) => (
            <div className={index <= runStage ? "complete" : ""} key={stage}><span>{index + 1}</span><small>{stage.replace(" resident journeys", " journeys").replace(" residents", "")}</small></div>
          ))}
        </div>
        <div className="dock-actions">
          <button className="play-button" onClick={() => setPlaying((current) => !current)} aria-label={playing ? "Pause animation" : "Play animation"}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <button className="run-button" onClick={runSimulation} disabled={running}><Play size={16} fill="currentColor" />{running ? "Running…" : "Run comparison"}</button>
        </div>
      </footer>
    </main>
  );
}
