"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Terminal,
  Plus,
  FileCode2,
  Clock,
  Settings,
  Newspaper,
  BarChart2,
} from "lucide-react";
import { useNews } from "@/hooks/useNews";
import NewsPanel from "@/components/news/NewsPanel";

type PanelType = "scripts" | "history" | "news" | null;

interface SidebarProps {
  currentCode?: string;
}

function Tooltip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-surface-elevated border border-border-subtle rounded-md text-xs text-text whitespace-nowrap z-50 pointer-events-none">
          {text}
        </div>
      )}
    </div>
  );
}

function SidebarButton({
  icon: Icon,
  tooltip,
  active,
  badge,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tooltip: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <Tooltip text={tooltip}>
      <button
        onClick={onClick}
        className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
          active
            ? "bg-surface-elevated text-white"
            : "text-text-dim hover:text-text-secondary"
        }`}
      >
        <Icon size={20} />
        {badge != null && badge > 0 && (
          <span className="absolute top-1 right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-primary text-[9px] font-bold text-black px-0.5">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

function SlidePanel({
  title,
  open,
  onClose,
  children,
  noPadding,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open, onClose]);

  return (
    <div
      ref={panelRef}
      className={`fixed left-[56px] top-0 h-full w-80 bg-surface border-r border-border z-40 transition-transform duration-300 flex flex-col ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="text-sm font-medium text-text">{title}</h2>
        <button
          onClick={onClose}
          className="text-text-dim hover:text-text-secondary text-lg leading-none"
        >
          &times;
        </button>
      </div>
      <div className={`flex-1 overflow-hidden ${noPadding ? "" : "p-4"}`}>
        {children}
      </div>
    </div>
  );
}

export default function Sidebar({ currentCode = "" }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [panel, setPanel] = useState<PanelType>(null);

  const news = useNews(currentCode);

  function togglePanel(p: PanelType) {
    setPanel((prev) => (prev === p ? null : p));
  }

  return (
    <>
      <aside className="fixed left-0 top-0 h-full w-[56px] bg-surface border-r border-border flex flex-col items-center py-4 z-50">
        {/* Logo */}
        <button
          onClick={() => router.push("/")}
          className="w-10 h-10 flex items-center justify-center mb-6"
        >
          <Terminal size={20} className="text-white" />
        </button>

        {/* Nav */}
        <div className="flex flex-col gap-1.5">
          <SidebarButton
            icon={Plus}
            tooltip="New Chat"
            onClick={() => {
              setPanel(null);
              router.push("/chat");
              if (pathname === "/chat") window.location.reload();
            }}
          />
          <SidebarButton
            icon={FileCode2}
            tooltip="Saved Scripts"
            active={panel === "scripts"}
            onClick={() => togglePanel("scripts")}
          />
          <SidebarButton
            icon={Clock}
            tooltip="Chat History"
            active={panel === "history"}
            onClick={() => togglePanel("history")}
          />
          <SidebarButton
            icon={BarChart2}
            tooltip="NGX Dashboard"
            active={pathname === "/ngx"}
            onClick={() => {
              setPanel(null);
              router.push("/ngx");
            }}
          />
          <SidebarButton
            icon={Newspaper}
            tooltip="Market News"
            active={panel === "news"}
            badge={news.detectedTickers.length > 0 && news.articles.length > 0 ? news.articles.length : undefined}
            onClick={() => togglePanel("news")}
          />
        </div>

        {/* Spacer + Settings at bottom */}
        <div className="mt-auto">
          <SidebarButton
            icon={Settings}
            tooltip="Settings"
            active={pathname === "/settings"}
            onClick={() => {
              setPanel(null);
              router.push("/settings");
            }}
          />
        </div>
      </aside>

      {/* Slide-out panels */}
      <SlidePanel
        title="Saved Scripts"
        open={panel === "scripts"}
        onClose={() => setPanel(null)}
      >
        <div className="flex flex-col items-center justify-center h-40 text-text-muted text-sm text-center">
          <FileCode2 size={32} className="mb-3 opacity-50" />
          <p>No saved scripts yet.</p>
          <p className="text-xs mt-1">Generated scripts will appear here.</p>
        </div>
      </SlidePanel>

      <SlidePanel
        title="Chat History"
        open={panel === "history"}
        onClose={() => setPanel(null)}
      >
        <div className="flex flex-col items-center justify-center h-40 text-text-muted text-sm text-center">
          <Clock size={32} className="mb-3 opacity-50" />
          <p>No chat history yet.</p>
          <p className="text-xs mt-1">Past conversations will appear here.</p>
        </div>
      </SlidePanel>

      <SlidePanel
        title="Market News"
        open={panel === "news"}
        onClose={() => setPanel(null)}
        noPadding
      >
        <NewsPanel
          articles={news.articles}
          loading={news.loading}
          error={news.error}
          lastFetched={news.lastFetched}
          detectedTickers={news.detectedTickers}
          onRefresh={news.fetchNews}
        />
      </SlidePanel>
    </>
  );
}
