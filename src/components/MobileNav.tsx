import { Home, Search, Sparkles, Music, Link2, Radio, FolderHeart } from "lucide-react";

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedPlaylistId: string | null;
  onClearPlaylist: () => void;
}

export default function MobileNav({
  activeTab,
  setActiveTab,
  selectedPlaylistId,
  onClearPlaylist,
}: MobileNavProps) {
  return (
    <nav
      id="mobile-bottom-nav"
      className="md:hidden h-16 bg-zinc-950 border-t border-zinc-900 flex items-center justify-around px-4 select-none text-zinc-400 font-sans z-30 shrink-0"
    >
      <button
        onClick={() => {
          setActiveTab("home");
          onClearPlaylist();
        }}
        className={`flex flex-col items-center gap-1 cursor-pointer transition ${
          activeTab === "home" && !selectedPlaylistId ? "text-violet-400 font-bold" : "hover:text-white"
        }`}
      >
        <Home size={18} />
        <span className="text-[10px]">Home</span>
      </button>

      <button
        onClick={() => {
          setActiveTab("search");
          onClearPlaylist();
        }}
        className={`flex flex-col items-center gap-1 cursor-pointer transition ${
          activeTab === "search" ? "text-violet-400 font-bold" : "hover:text-white"
        }`}
      >
        <Search size={18} />
        <span className="text-[10px]">Search</span>
      </button>

      <button
        onClick={() => {
          setActiveTab("library");
          onClearPlaylist();
        }}
        className={`flex flex-col items-center gap-1 cursor-pointer transition ${
          activeTab === "library" ? "text-violet-400 font-bold" : "hover:text-white"
        }`}
      >
        <FolderHeart size={18} />
        <span className="text-[10px]">Library</span>
      </button>



      <button
        onClick={() => {
          setActiveTab("lyrics");
          onClearPlaylist();
        }}
        className={`flex flex-col items-center gap-1 cursor-pointer transition ${
          activeTab === "lyrics" ? "text-violet-400 font-bold" : "hover:text-white"
        }`}
      >
        <Music size={18} />
        <span className="text-[10px]">Lyrics</span>
      </button>

      <button
        onClick={() => {
          setActiveTab("listening-room");
          onClearPlaylist();
        }}
        className={`flex flex-col items-center gap-1 cursor-pointer transition ${
          activeTab === "listening-room" ? "text-violet-400 font-bold" : "hover:text-white"
        }`}
      >
        <Radio size={18} />
        <span className="text-[10px]">Room</span>
      </button>

      <button
        onClick={() => {
          setActiveTab("spotify-import");
          onClearPlaylist();
        }}
        className={`flex flex-col items-center gap-1 cursor-pointer transition ${
          activeTab === "spotify-import" ? "text-violet-400 font-bold" : "hover:text-white"
        }`}
      >
        <Link2 size={18} />
        <span className="text-[10px]">Spotify</span>
      </button>
    </nav>
  );
}
