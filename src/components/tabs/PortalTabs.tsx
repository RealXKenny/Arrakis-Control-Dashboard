"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PortalTabs() {
  const pathname = usePathname();

  const tabs = [
    {
      name: "Character",
      href: "/",
    },
    {
      name: "Live Map",
      href: "/map",
    },
  ];

  return (
    <nav
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        padding: "0 16px",
        marginBottom: "30px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          display: "flex",
          gap: "6px",
          padding: "6px",
          background: "rgba(29, 18, 12, 0.92)",
          border: "1px solid #3c2415",
          borderRadius: "14px",
          boxSizing: "border-box",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {tabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                flex: "1 0 auto",
                minWidth: "120px",
                textAlign: "center",
                padding: "11px 18px",
                borderRadius: "9px",
                textDecoration: "none",
                fontSize: "0.85rem",
                fontWeight: "800",
                letterSpacing: "0.5px",
                color: active ? "#1b0e07" : "#cda26b",
                background: active ? "linear-gradient(135deg, #d9a35b, #b97936)" : "transparent",
                border: active ? "1px solid #e5b873" : "1px solid transparent",
                boxShadow: active ? "0 0 18px rgba(197, 139, 69, 0.18)" : "none",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
                boxSizing: "border-box",
              }}
            >
              {tab.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
