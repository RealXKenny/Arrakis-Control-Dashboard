'use client';

type GridLine = { x1: number; y1: number; x2: number; y2: number; edge?: boolean };
type GridLabel = { text: string; px: number; py: number };
type GridOverlay = { lines?: GridLine[]; labels?: GridLabel[] };

export default function SectorGridOverlay({
  overlay,
  width,
  height,
  zoom,
}: {
  overlay: GridOverlay | null;
  width: number;
  height: number;
  zoom: number;
}) {
  if (!overlay || !Array.isArray(overlay.lines) || !Array.isArray(overlay.labels)) return null;

  return (
    <svg
      data-sector-grid="deep-desert"
      viewBox={`0 0 ${width} ${height}`}
      width={width * zoom}
      height={height * zoom}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', overflow: 'visible' }}
    >
      <g>
        {overlay.lines.map((line, index) => (
          <line
            key={`${line.x1}-${line.y1}-${index}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.edge ? 'rgba(16, 11, 4, .96)' : 'rgba(16, 11, 4, .8)'}
            strokeWidth={line.edge ? 2 : 1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      <g>
        {overlay.labels.map((label) => (
          <text
            key={label.text}
            x={label.px}
            y={label.py}
            fontSize={15 / Math.max(zoom, 0.01)}
            fill="rgba(28, 21, 12, .82)"
            stroke="rgba(255, 246, 230, .62)"
            strokeWidth={3}
            paintOrder="stroke"
            vectorEffect="non-scaling-stroke"
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 700 }}
          >
            {label.text}
          </text>
        ))}
      </g>
    </svg>
  );
}
