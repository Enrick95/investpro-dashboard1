"use client";

import React from "react";
import AdminTopTabs from "./AdminTopTabs";

export default function AdminShell({
  children,
  onRevoke,
}: {
  children: React.ReactNode;
  onRevoke: () => void;
}) {
  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="px-6 pt-6">
        <AdminTopTabs onRevoke={onRevoke} />
      </div>
      <div className="max-w-[1600px] mx-auto">{children}</div>
    </div>
  );
}
