"use client";

import React, { useMemo } from "react";

import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminWorldVisitorsMap from "@/components/admin/AdminWorldVisitorsMap";
import AdminActivityLog from "@/components/admin/AdminActivityLog";

function fmt(n: number) {
  return n.toLocaleString("fr-FR");
}

export default function AdminOverviewPage() {
  // mock (branchera plus tard sur vraie data)
  const stats = useMemo(
    () => ({
      usersLastHour: 652,
      newUsers: 275000,
      avgSession: "3m 12s",
      subscribers: 3720000,
      pageViews: 523000,
      revenueWeek: 1240,
      revenueMonth: 8920,
      revenueYear: 64210,
    }),
    []
  );

  return (
    <div className="w-full">
      {/* Row KPI -> 1 ligne */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
        <AdminStatCard
          label="Users (last hour)"
          value={fmt(stats.usersLastHour)}
        />

        <AdminStatCard
          label="New users"
          value={fmt(stats.newUsers)}
        />

        <AdminStatCard
          label="Avg. session"
          value={stats.avgSession}
        />

        <AdminStatCard
          label="Subscribers"
          value={fmt(stats.subscribers)}
        />

        <AdminStatCard
          label="Page views"
          value={fmt(stats.pageViews)}
        />
      </div>

      {/* Map + Right column */}
      <div className="mt-4 grid gap-4 grid-cols-1 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AdminWorldVisitorsMap
            title="Répartition visiteurs"
            subtitle="Carte monde (drag + zoom) — tooltip uniquement sur pays dorés"
            pageViews={stats.pageViews}
            highlights={[
              {
                iso2: "FR",
                label: "France",
                visitors: 44123,
                pageViews: stats.pageViews,
              },
              {
                iso2: "JP",
                label: "Japon",
                visitors: 38765,
                pageViews: 210000,
              },
              {
                iso2: "IN",
                label: "Inde",
                visitors: 27112,
                pageViews: 140000,
              },
              {
                iso2: "MX",
                label: "Mexique",
                visitors: 19002,
                pageViews: 90000,
              },
              {
                iso2: "EG",
                label: "Égypte",
                visitors: 13220,
                pageViews: 60000,
              },
            ]}
          />
        </div>

        <div className="xl:col-span-1 flex flex-col gap-4">
          {/* Insights */}
          <div
            className="rounded-2xl border p-4"
            style={{
              borderColor: "rgba(255,255,255,.08)",
              background: "rgba(255,255,255,.03)",
            }}
          >
            <div
              className="font-semibold"
              style={{ color: "var(--text)" }}
            >
              Insights
            </div>

            <div
              className="text-sm mt-1"
              style={{ color: "var(--muted)" }}
            >
              (mock) devices, pages top, sources, conversions...
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--muted)" }}>
                  Top source
                </span>

                <span style={{ color: "var(--text)" }}>
                  Direct
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span style={{ color: "var(--muted)" }}>
                  Device
                </span>

                <span style={{ color: "var(--text)" }}>
                  Mobile
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span style={{ color: "var(--muted)" }}>
                  Conversion
                </span>

                <span style={{ color: "var(--text)" }}>
                  —
                </span>
              </div>
            </div>
          </div>

          {/* Revenus */}
          <div
            className="rounded-2xl border p-4"
            style={{
              borderColor: "rgba(255,255,255,.08)",
              background: "rgba(255,255,255,.03)",
            }}
          >
            <div
              className="font-semibold"
              style={{ color: "var(--text)" }}
            >
              Revenus
            </div>

            <div
              className="text-sm mt-1"
              style={{ color: "var(--muted)" }}
            >
              (mock) semaine / mois / année
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div
                className="rounded-xl border p-3"
                style={{
                  borderColor: "rgba(255,255,255,.08)",
                  background: "rgba(0,0,0,.2)",
                }}
              >
                <div
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  Semaine
                </div>

                <div
                  className="mt-1 font-semibold"
                  style={{ color: "var(--gold)" }}
                >
                  {stats.revenueWeek.toLocaleString("fr-FR")} $
                </div>
              </div>

              <div
                className="rounded-xl border p-3"
                style={{
                  borderColor: "rgba(255,255,255,.08)",
                  background: "rgba(0,0,0,.2)",
                }}
              >
                <div
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  Mois
                </div>

                <div
                  className="mt-1 font-semibold"
                  style={{ color: "var(--gold)" }}
                >
                  {stats.revenueMonth.toLocaleString("fr-FR")} $
                </div>
              </div>

              <div
                className="rounded-xl border p-3"
                style={{
                  borderColor: "rgba(255,255,255,.08)",
                  background: "rgba(0,0,0,.2)",
                }}
              >
                <div
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  Année
                </div>

                <div
                  className="mt-1 font-semibold"
                  style={{ color: "var(--gold)" }}
                >
                  {stats.revenueYear.toLocaleString("fr-FR")} $
                </div>
              </div>
            </div>
          </div>

          {/* Logs */}
          <AdminActivityLog />
        </div>
      </div>
    </div>
  );
}