"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PhaseId, PhaseStatus } from "@/lib/setup-state";

interface PhaseInfo {
  id: PhaseId;
  label: string;
  description: string;
  status: PhaseStatus;
  tool: "setup" | "homepage-admin";
  isCurrent: boolean;
  isUnlocked: boolean;
}

const STATUS_ICONS: Record<PhaseStatus, string> = {
  completed: "✓",
  "in-progress": "●",
  "not-started": "",
};

export function Sidebar() {
  const pathname = usePathname();
  const [phases, setPhases] = useState<PhaseInfo[]>([]);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data: { phases: PhaseInfo[] }) => {
        setPhases(data.phases);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <nav className="w-64 shrink-0 bg-white border-r min-h-[calc(100vh-57px)] p-4">
      <ul className="space-y-1">
        {phases.map((phase) => {
          const href = `/${phase.id}`;
          const isActive = pathname === href || pathname === `/${phase.id}/`;
          const isHomepageAdmin = phase.tool === "homepage-admin";

          return (
            <li key={phase.id}>
              {phase.isUnlocked ? (
                <Link
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : phase.status === "completed"
                      ? "text-green-700 hover:bg-green-50"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span
                    className={`w-5 h-5 flex items-center justify-center rounded-full text-xs shrink-0 ${
                      phase.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : phase.status === "in-progress"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {STATUS_ICONS[phase.status] ||
                      String(
                        ["setup0", "setup1a", "setup1b", "setup1c", "setup1c-iam", "setup2a", "setup2b", "setup3"].indexOf(phase.id) + 1
                      )}
                  </span>
                  <span className="leading-tight">
                    {phase.label}
                    {isHomepageAdmin && (
                      <span className="block text-xs text-gray-400 mt-0.5">
                        管理画面で設定
                      </span>
                    )}
                  </span>
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 cursor-not-allowed">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full text-xs bg-gray-50 shrink-0">
                    {String(
                      ["setup0", "setup1a", "setup1b", "setup1c", "setup1c-iam", "setup2a", "setup2b", "setup3"].indexOf(phase.id) + 1
                    )}
                  </span>
                  <span className="leading-tight">
                    {phase.label}
                    {isHomepageAdmin && (
                      <span className="block text-xs text-gray-200 mt-0.5">
                        管理画面で設定
                      </span>
                    )}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/*
        why: 運用メニュー (/ops) はセットアップフェーズの順序に依存しない
             「便利機能」のため、フェーズリストとは分離して下部に固定配置する。
             setup1b は初回セットアップ専用、再デプロイ・WAF 変更はここから行う。
      */}
      <div className="mt-6 border-t pt-4">
        <p className="px-3 text-xs uppercase text-gray-400 tracking-wider mb-1">
          運用メニュー
        </p>
        <Link
          href="/ops"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname === "/ops" || pathname === "/ops/"
              ? "bg-blue-50 text-blue-700 font-medium"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <span className="w-5 h-5 flex items-center justify-center rounded-full text-xs shrink-0 bg-gray-100 text-gray-500">
            ⚙
          </span>
          <span className="leading-tight">アプリ再デプロイ / WAF 変更</span>
        </Link>
      </div>
    </nav>
  );
}
