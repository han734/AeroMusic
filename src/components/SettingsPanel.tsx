import React, { useState, useEffect } from "react";
import { Sliders, Volume2, Download, Zap, Radio, Layers, Check, RefreshCw, Link2 } from "lucide-react";
import { getApiBaseUrl, saveApiBaseUrl } from "../lib/api";
import AuthPanel from "./AuthPanel";

interface SettingsPanelProps {
  currentUser: { username: string; avatar: string } | null;
  onLoginSuccess: (user: { username: string; avatar: string }) => void;
  onLogout: () => void;
}

interface EQSliders {
  hz60: number;
  hz230: number;
  hz910: number;
  hz4k: number;
  hz14k: number;
}

const PRESETS: Record<string, EQSliders> = {
  flat: { hz60: 0, hz230: 0, hz910: 0, hz4k: 0, hz14k: 0 },
  bass: { hz60: 8, hz230: 5, hz910: 1, hz4k: 0, hz14k: -2 },
  acoustic: { hz60: 2, hz230: 1, hz910: 3, hz4k: 4, hz14k: 5 },
  electronic: { hz60: 6, hz230: 2, hz910: -1, hz4k: 3, hz14k: 6 },
  classical: { hz60: 4, hz230: 3, hz910: 1, hz4k: 2, hz14k: 4 },
  vocal: { hz60: -3, hz230: -1, hz910: 4, hz4k: 5, hz14k: 2 }
};

export default function SettingsPanel({ currentUser, onLoginSuccess, onLogout }: SettingsPanelProps) {
  const [eqEnabled, setEqEnabled] = useState<boolean>(true);
  const [eqPreset, setEqPreset] = useState<string>("flat");
  const [sliders, setSliders] = useState<EQSliders>({
    hz60: 0,
    hz230: 0,
    hz910: 0,
    hz4k: 0,
    hz14k: 0
  });

  const [crossfade, setCrossfade] = useState<number>(4);
  const [audioQuality, setAudioQuality] = useState<string>("high");
  const [downloadQuality, setDownloadQuality] = useState<string>("ultra");
  const [apiEndpoint, setApiEndpoint] = useState<string>("");
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI;
  const [showDevTools, setShowDevTools] = useState<boolean>(() => {
    return localStorage.getItem("aero-show-devtools") === "true";
  });
  const [localLogs, setLocalLogs] = useState<string[]>([]);


  useEffect(() => {
    if ((window as any).appLogs) {
      setLocalLogs([...(window as any).appLogs]);
    }
  }, []);

  useEffect(() => {
    try {
      const storedEqEnabled = localStorage.getItem("setting-eq-enabled");
      if (storedEqEnabled !== null) setEqEnabled(storedEqEnabled === "true");

      const storedEqPreset = localStorage.getItem("setting-eq-preset");
      if (storedEqPreset) setEqPreset(storedEqPreset);

      const storedSliders = localStorage.getItem("setting-eq-sliders");
      if (storedSliders) setSliders(JSON.parse(storedSliders));

      const storedCrossfade = localStorage.getItem("setting-crossfade");
      if (storedCrossfade) setCrossfade(parseInt(storedCrossfade, 10));

      const storedAudioQ = localStorage.getItem("setting-audio-quality");
      if (storedAudioQ) setAudioQuality(storedAudioQ);

      const storedDownloadQ = localStorage.getItem("setting-download-quality");
      if (storedDownloadQ) setDownloadQuality(storedDownloadQ);

      const currentEndpoint = getApiBaseUrl();
      setApiEndpoint(currentEndpoint);
    } catch (e) {
      console.warn("Could not load setting preferences:", e);
    }
  }, []);

  const refreshLogs = () => {
    if ((window as any).appLogs) {
      setLocalLogs([...(window as any).appLogs]);
    }
  };

  const clearLogs = () => {
    if ((window as any).appLogs) {
      (window as any).appLogs.length = 0;
      setLocalLogs([]);
    }
  };

  const handleDevToolsToggle = () => {
    const newVal = !showDevTools;
    setShowDevTools(newVal);
    saveSetting("aero-show-devtools", newVal);
    if (isElectron) {
      (window as any).electronAPI.toggleDevTools(newVal);
    }
  };

  const copyLogs = () => {
    const text = localLogs.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      alert("Logs copied to clipboard!");
    }).catch(err => {
      console.error("Failed to copy logs:", err);
    });
  };

  const handleSaveEndpoint = () => {
    saveApiBaseUrl(apiEndpoint);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      window.location.reload();
    }, 1000);
  };

  const handleClearEndpoint = () => {
    saveApiBaseUrl("");
    setApiEndpoint("");
    window.location.reload();
  };

  const saveSetting = (key: string, value: any) => {
    try {
      localStorage.setItem(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    } catch (e) {
      console.error(`Failed to save setting ${key}:`, e);
    }
  };

  const handleEqToggle = () => {
    const newVal = !eqEnabled;
    setEqEnabled(newVal);
    saveSetting("setting-eq-enabled", newVal);
  };

  const handleSliderChange = (band: keyof EQSliders, val: number) => {
    const updatedSliders = { ...sliders, [band]: val };
    setSliders(updatedSliders);
    setEqPreset("custom");
    saveSetting("setting-eq-sliders", updatedSliders);
    saveSetting("setting-eq-preset", "custom");
  };

  const applyPreset = (presetName: string) => {
    if (PRESETS[presetName]) {
      setEqPreset(presetName);
      setSliders(PRESETS[presetName]);
      saveSetting("setting-eq-preset", presetName);
      saveSetting("setting-eq-sliders", PRESETS[presetName]);
    }
  };

  const handleCrossfadeChange = (val: number) => {
    setCrossfade(val);
    saveSetting("setting-crossfade", val);
  };

  const handleAudioQualityChange = (val: string) => {
    setAudioQuality(val);
    saveSetting("setting-audio-quality", val);
  };

  const handleDownloadQualityChange = (val: string) => {
    setDownloadQuality(val);
    saveSetting("setting-download-quality", val);
  };

  const resetToDefault = () => {
    setEqEnabled(true);
    setEqPreset("flat");
    setSliders(PRESETS.flat);
    setCrossfade(4);
    setAudioQuality("high");
    setDownloadQuality("ultra");

    saveSetting("setting-eq-enabled", true);
    saveSetting("setting-eq-preset", "flat");
    saveSetting("setting-eq-sliders", PRESETS.flat);
    saveSetting("setting-crossfade", 4);
    saveSetting("setting-audio-quality", "high");
    saveSetting("setting-download-quality", "ultra");
  };

  return (
    <div id="settings-view" className="flex-1 overflow-y-auto px-4 md:px-8 py-6 bg-zinc-950 font-sans custom-scrollbar select-none pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Sliders className="text-violet-400" size={28} />
            Audio & Device Settings
          </h1>
          <p className="text-xs md:text-sm text-zinc-400 mt-1.5 font-medium">
            Customize the AeroMusic high-fidelity playback engine, equalizer nodes, and local downloads.
          </p>
        </div>
        <button
          onClick={resetToDefault}
          className="flex items-center gap-2 self-start md:self-auto px-3.5 py-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg cursor-pointer transition"
        >
          <RefreshCw size={12} />
          Reset to Defaults
        </button>
      </div>

      <div className="mb-8">
        <AuthPanel currentUser={currentUser} onLoginSuccess={onLoginSuccess} onLogout={onLogout} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-xl">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-800/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400">
                <Sliders size={20} />
              </div>
              <div>
                <h2 className="text-md font-bold text-white">Five-Band Parametric Equalizer</h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">Control distinct audio frequency bands & balance.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-400 mr-1">{eqEnabled ? "ON" : "OFF"}</span>
              <button
                onClick={handleEqToggle}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  eqEnabled ? "bg-violet-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    eqEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className={eqEnabled ? "opacity-100 transition-opacity" : "opacity-40 pointer-events-none transition-opacity"}>
            <div className="h-16 w-full bg-zinc-950/80 rounded-xl mb-6 p-4 border border-zinc-900 flex items-end justify-center gap-1.5 relative overflow-hidden">
              <div className="absolute top-2 left-3 text-[9px] font-mono font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-ping"></span>
                AeroDSP Real-time Frequency Spectrum
              </div>

              {Array.from({ length: 42 }).map((_, idx) => {
                let factor = 1;
                if (idx < 8) factor = sliders.hz60;
                else if (idx < 16) factor = sliders.hz230;
                else if (idx < 24) factor = sliders.hz910;
                else if (idx < 32) factor = sliders.hz4k;
                else factor = sliders.hz14k;

                const dbMultiplier = 1 + (factor + 12) / 24;
                const animDuration = 0.6 + (idx % 5) * 0.15;
                const baseHeight = 10 + (idx % 4) * 8;

                return (
                  <div
                    key={idx}
                    className="w-1 rounded-t bg-gradient-to-t from-violet-500/40 via-violet-400 to-teal-300"
                    style={{
                      height: `${Math.max(4, Math.min(48, baseHeight * dbMultiplier))}px`,
                      animation: eqEnabled ? `equalizerWave ${animDuration}s ease-in-out infinite alternate` : "none"
                    }}
                  />
                );
              })}
            </div>

            <div className="mb-6">
              <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-500 block mb-2.5">
                Quick Preset Selection
              </span>
              <div className="flex flex-wrap gap-2">
                {Object.keys(PRESETS).map((p) => (
                  <button
                    key={p}
                    onClick={() => applyPreset(p)}
                    className={`px-3 py-1.5 text-xs font-bold capitalize rounded-lg transition border cursor-pointer ${
                      eqPreset === p
                        ? "bg-violet-500 text-black border-violet-400 shadow-lg shadow-violet-500/10 font-extrabold"
                        : "bg-zinc-800/60 text-zinc-300 border-zinc-700/60 hover:border-zinc-500 hover:text-white"
                    }`}
                  >
                    {p === "flat" ? "Flat (Standard)" : p.replace("-", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-500 block mb-4">
                Parametric Frequency Gain Sliders
              </span>
              <div className="overflow-x-auto -mx-4 px-4 sm:overflow-visible sm:mx-0 sm:px-0">
                <div className="grid grid-cols-5 gap-3 sm:gap-6 bg-zinc-950/40 p-4 rounded-xl border border-zinc-900 min-w-[320px] sm:min-w-0">
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-violet-400 font-mono">
                      {sliders.hz60 > 0 ? `+${sliders.hz60}` : sliders.hz60} dB
                    </span>
                    <div className="h-44 flex items-center justify-center my-3 relative">
                      <div className="absolute inset-y-0 flex flex-col justify-between text-[8px] font-mono text-zinc-600 pointer-events-none pr-8">
                        <span>+12</span>
                        <span>0</span>
                        <span>-12</span>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        value={sliders.hz60}
                        onChange={(e) => handleSliderChange("hz60", parseInt(e.target.value, 10))}
                        className="accent-violet-400 w-1.5 h-36 bg-zinc-800 rounded-lg appearance-none cursor-ns-resize"
                        style={{ writingMode: "vertical-lr" as any, WebkitAppearance: "slider-vertical" }}
                      />
                    </div>
                    <span className="text-xs font-bold text-white">60 Hz</span>
                    <span className="text-[9px] text-zinc-500 mt-0.5 font-medium">Sub-Bass</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-violet-400 font-mono">
                      {sliders.hz230 > 0 ? `+${sliders.hz230}` : sliders.hz230} dB
                    </span>
                    <div className="h-44 flex items-center justify-center my-3">
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        value={sliders.hz230}
                        onChange={(e) => handleSliderChange("hz230", parseInt(e.target.value, 10))}
                        className="accent-violet-400 w-1.5 h-36 bg-zinc-800 rounded-lg appearance-none cursor-ns-resize"
                        style={{ writingMode: "vertical-lr" as any, WebkitAppearance: "slider-vertical" }}
                      />
                    </div>
                    <span className="text-xs font-bold text-white">230 Hz</span>
                    <span className="text-[9px] text-zinc-500 mt-0.5 font-medium">Bass</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-violet-400 font-mono">
                      {sliders.hz910 > 0 ? `+${sliders.hz910}` : sliders.hz910} dB
                    </span>
                    <div className="h-44 flex items-center justify-center my-3">
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        value={sliders.hz910}
                        onChange={(e) => handleSliderChange("hz910", parseInt(e.target.value, 10))}
                        className="accent-violet-400 w-1.5 h-36 bg-zinc-800 rounded-lg appearance-none cursor-ns-resize"
                        style={{ writingMode: "vertical-lr" as any, WebkitAppearance: "slider-vertical" }}
                      />
                    </div>
                    <span className="text-xs font-bold text-white">910 Hz</span>
                    <span className="text-[9px] text-zinc-500 mt-0.5 font-medium">Midrange</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-violet-400 font-mono">
                      {sliders.hz4k > 0 ? `+${sliders.hz4k}` : sliders.hz4k} dB
                    </span>
                    <div className="h-44 flex items-center justify-center my-3">
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        value={sliders.hz4k}
                        onChange={(e) => handleSliderChange("hz4k", parseInt(e.target.value, 10))}
                        className="accent-violet-400 w-1.5 h-36 bg-zinc-800 rounded-lg appearance-none cursor-ns-resize"
                        style={{ writingMode: "vertical-lr" as any, WebkitAppearance: "slider-vertical" }}
                      />
                    </div>
                    <span className="text-xs font-bold text-white">4 kHz</span>
                    <span className="text-[9px] text-zinc-500 mt-0.5 font-medium">Upper-Mids</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-violet-400 font-mono">
                      {sliders.hz14k > 0 ? `+${sliders.hz14k}` : sliders.hz14k} dB
                    </span>
                    <div className="h-44 flex items-center justify-center my-3">
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        value={sliders.hz14k}
                        onChange={(e) => handleSliderChange("hz14k", parseInt(e.target.value, 10))}
                        className="accent-violet-400 w-1.5 h-36 bg-zinc-800 rounded-lg appearance-none cursor-ns-resize"
                        style={{ writingMode: "vertical-lr" as any, WebkitAppearance: "slider-vertical" }}
                      />
                    </div>
                    <span className="text-xs font-bold text-white">14 kHz</span>
                    <span className="text-[9px] text-zinc-500 mt-0.5 font-medium">Treble</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-3 pb-3 mb-4 border-b border-zinc-800/50">
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                <Layers size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Continuous Crossfade</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">Overlap sound transitions between tracks.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-zinc-400">Crossfade Duration</span>
                <span className="text-purple-400 font-mono">{crossfade === 0 ? "Off" : `${crossfade} seconds`}</span>
              </div>

              <input
                type="range"
                min="0"
                max="12"
                value={crossfade}
                onChange={(e) => handleCrossfadeChange(parseInt(e.target.value, 10))}
                className="w-full h-1.5 accent-purple-400 bg-zinc-850 rounded-lg appearance-none cursor-pointer"
              />

              <div className="h-14 bg-zinc-950/60 border border-zinc-900 rounded-xl relative flex items-center justify-between px-4 overflow-hidden select-none">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-violet-500/10 pointer-events-none"></div>
                
                <div className="text-left z-10">
                  <span className="text-[8px] font-mono text-zinc-500 block">TRACK A</span>
                  <span className="text-[10px] font-bold text-zinc-400">Fade Out</span>
                </div>

                <div className="flex flex-col items-center z-10">
                  <div className="h-3 w-12 rounded bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-purple-300 font-mono">{crossfade}s</span>
                  </div>
                  <span className="text-[7px] text-zinc-600 mt-1 uppercase tracking-widest font-bold">Overlap</span>
                </div>

                <div className="text-right z-10">
                  <span className="text-[8px] font-mono text-zinc-500 block">TRACK B</span>
                  <span className="text-[10px] font-bold text-zinc-400">Fade In</span>
                </div>

                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" preserveAspectRatio="none">
                  <path d={`M 0,10 Q 150,10 300,${40 - (crossfade * 2)}`} fill="none" stroke="#10b981" strokeWidth="2" />
                  <path d={`M 0,${40 - (crossfade * 2)} Q 150,10 300,10`} fill="none" stroke="#a855f7" strokeWidth="2" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-3 pb-3 mb-4 border-b border-zinc-800/50">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                <Radio size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Streaming Audio Quality</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">Control live streaming sound fidelity.</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {[
                { id: "high", name: "Aero Hi-Fi Lossless", desc: "320 kbps high-definition sound", badge: "Premium" },
                { id: "standard", name: "Standard Stereo Clear", desc: "192 kbps optimal balance", badge: "Balanced" },
                { id: "saver", name: "Data Saver Balanced", desc: "96 kbps minimal cellular use", badge: "Low Load" }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAudioQualityChange(item.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    audioQuality === item.id
                      ? "bg-blue-500/10 border-blue-500/50 text-white"
                      : "bg-zinc-950/40 border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-100">{item.name}</span>
                      <span className={`text-[8px] px-1 rounded font-bold uppercase tracking-wide ${
                        audioQuality === item.id ? "bg-blue-500 text-black" : "bg-zinc-800 text-zinc-500"
                      }`}>
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</p>
                  </div>
                  {audioQuality === item.id && <Check size={14} className="text-blue-400 stroke-[3]" />}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-3 pb-3 mb-4 border-b border-zinc-800/50">
              <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400">
                <Download size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Local Download Quality</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">Quality of local MP3 outputs.</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {[
                { id: "ultra", name: "Ultra-HD Master MP3", desc: "320 kbps bit depth (Recommended)", badge: "HQ" },
                { id: "high", name: "High-Quality AAC", desc: "256 kbps crisp output profile", badge: "Mid" },
                { id: "standard", name: "Standard Compressed MP3", desc: "128 kbps optimal file footprints", badge: "Low" }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleDownloadQualityChange(item.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    downloadQuality === item.id
                      ? "bg-violet-500/10 border-violet-500/50 text-white"
                      : "bg-zinc-950/40 border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-100">{item.name}</span>
                      <span className={`text-[8px] px-1 rounded font-bold uppercase tracking-wide ${
                        downloadQuality === item.id ? "bg-violet-500 text-black animate-pulse" : "bg-zinc-800 text-zinc-500"
                      }`}>
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</p>
                  </div>
                  {downloadQuality === item.id && <Check size={14} className="text-violet-400 stroke-[3]" />}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-3 pb-3 mb-4 border-b border-zinc-800/50">
              <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400">
                <Link2 size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Standalone Device Sync</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">Route streaming traffic to a remote/PC server.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Server Endpoint URL</label>
                <div className="relative">
                  <input
                    type="text"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    placeholder="e.g. http://192.168.1.100:3000"
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2.5 pl-3 pr-10 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 font-mono transition"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-zinc-600">
                    <Link2 size={14} />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveEndpoint}
                  className="flex-1 bg-violet-500 hover:bg-violet-400 text-black font-bold text-xs py-2.5 px-4 rounded-xl cursor-pointer transition flex items-center justify-center gap-1.5 shadow-lg shadow-violet-500/10"
                >
                  {isSaved ? "Saved & Reloading..." : "Save Endpoint"}
                </button>
                {getApiBaseUrl() && (
                  <button
                    onClick={handleClearEndpoint}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold text-xs py-2.5 px-4 rounded-xl cursor-pointer border border-zinc-700/60 transition"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="p-3 bg-zinc-950/60 border border-zinc-900 rounded-xl text-[10px] text-zinc-500 leading-relaxed font-medium">
                <span className="font-bold text-zinc-400 block mb-1">How to sync:</span>
                1. Run <code className="text-violet-400 font-mono">AeroMusic.exe</code> on your PC.<br />
                2. Find your PC's IP address (e.g. <code className="text-zinc-400 font-mono">192.168.1.100</code>).<br />
                3. Paste the URL here: <code className="text-zinc-400 font-mono">http://[PC_IP]:3000</code>.<br />
                4. Tap Save. Ensure both devices are on the same network.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg text-red-400">
              <Zap size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Diagnostics & System Logs</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">Inspect internal errors and player status logs.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isElectron && (
              <label className="flex items-center gap-2 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-lg cursor-pointer transition font-bold select-none text-zinc-300 mr-1.5">
                <input
                  type="checkbox"
                  checked={showDevTools}
                  onChange={handleDevToolsToggle}
                  className="accent-violet-500 rounded cursor-pointer"
                />
                Show DevTools
              </label>
            )}
            <button
              onClick={refreshLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-lg cursor-pointer transition"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
            <button
              onClick={copyLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-lg cursor-pointer transition"
            >
              Copy Logs
            </button>
            <button
              onClick={clearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-400 hover:text-red-300 bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 rounded-lg cursor-pointer transition"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8">
            <div className="h-64 w-full bg-zinc-950/80 rounded-xl p-3 border border-zinc-900 font-mono text-[10px] text-zinc-300 overflow-y-auto custom-scrollbar select-text selection:bg-zinc-800">
              {localLogs.length === 0 ? (
                <span className="text-zinc-600 italic font-medium">No logs captured yet. Try playing a track or changing settings to generate diagnostics.</span>
              ) : (
                localLogs.map((log, idx) => {
                  let colorClass = "text-zinc-400";
                  if (log.startsWith("[ERROR]")) colorClass = "text-red-400 font-semibold";
                  else if (log.startsWith("[WARN]")) colorClass = "text-amber-400 font-semibold";
                  else if (log.startsWith("[LOG]")) colorClass = "text-zinc-300";
                  return (
                    <div key={idx} className={`${colorClass} py-0.5 border-b border-zinc-900/40 leading-relaxed break-all`}>
                      {log}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-4 bg-zinc-950/40 border border-zinc-900 p-4 rounded-xl text-xs text-zinc-400 space-y-3 font-medium">
            <h4 className="font-bold text-zinc-300 uppercase tracking-wider text-[10px] mb-1">Troubleshooting Tips</h4>
            <ul className="list-disc pl-4 space-y-2 leading-relaxed text-[11px]">
              <li>
                <span className="text-zinc-300 font-semibold">YouTube IFrame Errors:</span> If streams fail to play, toggle <span className="text-violet-400 font-semibold">Show Video</span> in the bottom player bar. YouTube requires the player to be visible on screen.
              </li>
              <li>
                <span className="text-zinc-300 font-semibold">Network Connection:</span> Both standalone builds require a stable internet connection to load the YouTube API and stream audio.
              </li>
              <li>
                <span className="text-zinc-300 font-semibold">Android Cleartext Traffic:</span> If your phone does not connect to your PC, verify they are on the same Wi-Fi network and the firewall allows port 3000.
              </li>
              <li>
                <span className="text-zinc-300 font-semibold">Audio Decryption/CORS:</span> Ensure no proxies or VPNs are blocking <code className="text-zinc-400 font-mono">youtube.com</code> or <code className="text-zinc-400 font-mono">ggpht.com</code> domains.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes equalizerWave {
          0% {
            transform: scaleY(0.75);
          }
          100% {
            transform: scaleY(1.3);
          }
        }
      `}</style>
    </div>
  );
}