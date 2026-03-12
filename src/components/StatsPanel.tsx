import { useMemo, useCallback } from 'react';
import type { GameState, Rarity } from '../types/game';
import { CROPS, RARITY_COLORS } from '../data/crops';
import { getCurrentWindow } from '@tauri-apps/api/window';

const RARITY_ORDER: Rarity[] = ['legendary', 'rare', 'uncommon', 'common'];
const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary',
};

// Earthy palette matching the isometric farm
const C = {
  bg: '#1e1a16',
  tile: '#2a2420',
  tileBorder: '#3a332b',
  tileHover: '#322b24',
  text: '#d4c8b8',
  textDim: '#7a6e5e',
  border: '#3a332b',
  empty: '#282220',
};

interface StatsPanelProps {
  gameState: GameState;
  onClose: () => void;
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function StatsPanel({ gameState, onClose }: StatsPanelProps) {
  const { harvestsByCrop, goldenHarvests, totalHarvested, totalKeyPresses, cells, totalPestsRemoved, dailyStats } = gameState;

  const totalPresses = useMemo(
    () => Object.values(totalKeyPresses).reduce((a, b) => a + b, 0),
    [totalKeyPresses],
  );

  const totalGolden = useMemo(
    () => Object.values(goldenHarvests).reduce((a, b) => a + b, 0),
    [goldenHarvests],
  );

  const speciesDiscovered = useMemo(
    () => CROPS.filter(c => (harvestsByCrop[c.id] ?? 0) > 0).length,
    [harvestsByCrop],
  );

  const rarestCrop = useMemo(() => {
    const rarityRank: Record<Rarity, number> = { legendary: 4, rare: 3, uncommon: 2, common: 1 };
    let best: { crop: typeof CROPS[0]; count: number } | null = null;
    for (const crop of CROPS) {
      const count = harvestsByCrop[crop.id] ?? 0;
      if (count > 0) {
        if (!best || rarityRank[crop.rarity] > rarityRank[best.crop.rarity]) {
          best = { crop, count };
        }
      }
    }
    return best;
  }, [harvestsByCrop]);

  const mostHarvested = useMemo(() => {
    let best: { crop: typeof CROPS[0]; count: number } | null = null;
    for (const crop of CROPS) {
      const count = harvestsByCrop[crop.id] ?? 0;
      if (count > 0 && (!best || count > best.count)) {
        best = { crop, count };
      }
    }
    return best;
  }, [harvestsByCrop]);

  const sortedKeys = useMemo(() => {
    return Object.entries(totalKeyPresses)
      .filter(([code]) => !code.startsWith('_gap'))
      .sort(([, a], [, b]) => b - a);
  }, [totalKeyPresses]);

  const maxPresses = sortedKeys.length > 0 ? sortedKeys[0][1] : 1;
  const getLabel = (keyCode: string) => cells[keyCode]?.label ?? keyCode;

  const rarityProgress = useMemo(() => {
    const result: Record<Rarity, { found: number; total: number }> = {
      legendary: { found: 0, total: 0 },
      rare: { found: 0, total: 0 },
      uncommon: { found: 0, total: 0 },
      common: { found: 0, total: 0 },
    };
    for (const crop of CROPS) {
      result[crop.rarity].total++;
      if ((harvestsByCrop[crop.id] ?? 0) > 0) result[crop.rarity].found++;
    }
    return result;
  }, [harvestsByCrop]);

  const today = getToday();

  // GitHub-style contribution grid: 7 rows (Mon–Sun) x N weeks
  const gridData = useMemo(() => {
    const stats = dailyStats ?? [];
    const byDate = new Map(stats.map(s => [s.date, s]));

    // Build day cells from first entry (or 14 weeks ago) to today, padded to full weeks
    const endDate = new Date(today);
    const firstDate = stats.length > 0
      ? new Date(stats[0].date)
      : new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 13 * 7);

    // Pad start to Monday of that week
    const startDay = firstDate.getDay(); // 0=Sun
    const mondayOffset = startDay === 0 ? 6 : startDay - 1;
    const startDate = new Date(firstDate);
    startDate.setDate(startDate.getDate() - mondayOffset);

    const cells: { date: string; keyPresses: number; harvests: number; isToday: boolean; isFuture: boolean }[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const entry = byDate.get(key);
      const isFuture = d > endDate;
      cells.push({
        date: key,
        keyPresses: entry?.keyPresses ?? 0,
        harvests: entry?.harvests ?? 0,
        isToday: key === today,
        isFuture,
      });
    }

    // Pad end to fill the last week (Sunday)
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 0; i < remaining; i++) {
      const d = new Date(endDate);
      d.setDate(d.getDate() + i + 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      cells.push({ date: key, keyPresses: 0, harvests: 0, isToday: false, isFuture: true });
    }

    const maxKeys = Math.max(1, ...cells.map(c => c.keyPresses));
    const weeks = cells.length / 7;

    // Month labels: find the first cell of each month
    const monthLabels: { label: string; weekIdx: number }[] = [];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lastMonth = -1;
    for (let i = 0; i < cells.length; i++) {
      const m = parseInt(cells[i].date.split('-')[1], 10) - 1;
      if (m !== lastMonth) {
        lastMonth = m;
        monthLabels.push({ label: MONTHS[m], weekIdx: Math.floor(i / 7) });
      }
    }

    return { cells, maxKeys, weeks, monthLabels };
  }, [dailyStats, today]);

  // Build segmented bar data: each segment = 1 species, colored by rarity
  const collectionSegments = useMemo(() => {
    const segments: { rarity: Rarity; discovered: boolean }[] = [];
    for (const rarity of RARITY_ORDER) {
      const crops = CROPS.filter(c => c.rarity === rarity);
      for (const crop of crops) {
        segments.push({ rarity, discovered: (harvestsByCrop[crop.id] ?? 0) > 0 });
      }
    }
    return segments;
  }, [harvestsByCrop]);

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from the overlay background, not the panel
    if (e.target === e.currentTarget) {
      e.preventDefault();
      getCurrentWindow().startDragging();
    }
  }, []);

  return (
    <div style={styles.overlay} onClick={onClose} onMouseDown={handleOverlayMouseDown}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Farm Stats</span>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div style={styles.body}>
          {/* === HERO STATS === */}
          <div style={styles.heroSection}>
            <div style={styles.heroGrid}>
              {[
                { value: totalPresses.toLocaleString(), label: 'Keystrokes', color: C.text },
                { value: totalHarvested.toLocaleString(), label: 'Harvested', color: C.text },
                { value: (totalPestsRemoved ?? 0).toLocaleString(), label: 'Pests Squashed', color: '#4ADE80' },
                { value: String(totalGolden), label: 'Golden', color: '#FFD700' },
              ].map((stat, i) => (
                <div key={i} style={styles.heroTile}>
                  <div style={{ ...styles.heroNumber, color: stat.color }}>{stat.value}</div>
                  <div style={styles.heroLabel}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* === ACTIVITY GRID (GitHub-style) === */}
          {(
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Activity</div>
              <div style={styles.gridOuter}>
                {/* Month labels row */}
                <div style={{ display: 'flex', paddingLeft: 28 }}>
                  {gridData.monthLabels.map((m, i) => (
                    <div key={i} style={{
                      position: 'absolute' as const,
                      left: 28 + m.weekIdx * 13,
                      fontSize: 8,
                      color: C.textDim,
                      fontFamily: 'monospace',
                    }}>
                      {m.label}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', marginTop: 14 }}>
                  {/* Day-of-week labels */}
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2, marginRight: 4 }}>
                    {['Mon', '', 'Wed', '', 'Fri', '', ''].map((label, i) => (
                      <div key={i} style={{ height: 10, fontSize: 8, lineHeight: '10px', color: C.textDim, fontFamily: 'monospace', textAlign: 'right' as const, width: 20 }}>
                        {label}
                      </div>
                    ))}
                  </div>
                  {/* Grid columns (weeks) */}
                  <div style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: gridData.weeks }, (_, weekIdx) => (
                      <div key={weekIdx} style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
                        {Array.from({ length: 7 }, (_, dayIdx) => {
                          const cell = gridData.cells[weekIdx * 7 + dayIdx];
                          if (!cell) return <div key={dayIdx} style={{ width: 10, height: 10 }} />;
                          const level = cell.isFuture ? -1
                            : cell.keyPresses === 0 ? 0
                            : cell.keyPresses <= gridData.maxKeys * 0.25 ? 1
                            : cell.keyPresses <= gridData.maxKeys * 0.5 ? 2
                            : cell.keyPresses <= gridData.maxKeys * 0.75 ? 3
                            : 4;
                          const colors = ['#3a332b', '#4d3f2a', '#5c4a30', '#7a6235', '#9a7b3a'];
                          return (
                            <div
                              key={dayIdx}
                              title={cell.isFuture ? '' : `${cell.date}: ${cell.keyPresses} keys, ${cell.harvests} harvests`}
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                background: level < 0 ? 'transparent' : colors[level],
                                outline: cell.isToday ? '1.5px solid #d4c8b8' : 'none',
                                outlineOffset: -0.5,
                              }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 8, color: C.textDim, fontFamily: 'monospace' }}>Less</span>
                  {['#3a332b', '#4d3f2a', '#5c4a30', '#7a6235', '#9a7b3a'].map((color, i) => (
                    <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  ))}
                  <span style={{ fontSize: 8, color: C.textDim, fontFamily: 'monospace' }}>More</span>
                </div>
              </div>
            </div>
          )}

          {/* === COLLECTION PROGRESS === */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Collection &mdash; {speciesDiscovered}/{CROPS.length}
            </div>
            {/* Segmented block bar */}
            <div style={styles.segmentedBar}>
              {collectionSegments.map((seg, i) => (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: 10,
                    background: seg.discovered ? RARITY_COLORS[seg.rarity] : C.empty,
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
            <div style={styles.rarityRow}>
              {RARITY_ORDER.map(rarity => {
                const p = rarityProgress[rarity];
                return (
                  <div key={rarity} style={styles.rarityItem}>
                    <span style={{ color: RARITY_COLORS[rarity], fontSize: 10, fontWeight: 700 }}>
                      {RARITY_LABELS[rarity]}
                    </span>
                    <span style={styles.rarityCount}>{p.found}/{p.total}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* === HIGHLIGHTS === */}
          {(rarestCrop || mostHarvested) && (
            <div style={styles.section}>
              <div style={styles.highlightRow}>
                {rarestCrop && (
                  <div style={styles.highlightTile}>
                    <span style={styles.highlightEmoji}>{rarestCrop.crop.emoji}</span>
                    <div>
                      <div style={{ color: RARITY_COLORS[rarestCrop.crop.rarity], fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                        Rarest Find
                      </div>
                      <div style={styles.highlightName}>{rarestCrop.crop.id}</div>
                    </div>
                  </div>
                )}
                {mostHarvested && (
                  <div style={styles.highlightTile}>
                    <span style={styles.highlightEmoji}>{mostHarvested.crop.emoji}</span>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                        Most Harvested
                      </div>
                      <div style={styles.highlightName}>{mostHarvested.crop.id} x{mostHarvested.count}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* === CROP COLLECTION === */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Crops</div>
            {RARITY_ORDER.map(rarity => {
              const crops = CROPS.filter(c => c.rarity === rarity);
              return (
                <div key={rarity} style={{ marginBottom: 10 }}>
                  <div style={{
                    color: RARITY_COLORS[rarity],
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em',
                    marginBottom: 4,
                  }}>
                    {RARITY_LABELS[rarity]}
                  </div>
                  <div style={styles.cropGrid}>
                    {crops.map(crop => {
                      const count = harvestsByCrop[crop.id] ?? 0;
                      const golden = goldenHarvests[crop.id] ?? 0;
                      const discovered = count > 0;
                      const hasGolden = golden > 0;
                      return (
                        <div key={crop.id} style={{
                          ...styles.cropTile,
                          opacity: discovered ? 1 : 0.35,
                          ...(hasGolden ? {
                            border: '2px solid #FFD700',
                            background: 'rgba(255, 215, 0, 0.08)',
                          } : {}),
                        }}>
                          <span style={{ fontSize: 22, lineHeight: '1' }}>{discovered ? crop.emoji : '?'}</span>
                          <span style={styles.cropCount}>
                            {count}
                            {hasGolden && (
                              <span style={{ color: '#FFD700', marginLeft: 2, fontSize: 14 }}>
                                {' '}✨{golden}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* === KEY PRESSES === */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Keys &mdash; {totalPresses.toLocaleString()}
            </div>
            <div style={styles.keyList}>
              {sortedKeys.length === 0 && (
                <div style={{ color: C.textDim, fontSize: 12, textAlign: 'center' as const, padding: 16 }}>
                  Start typing to see stats
                </div>
              )}
              {sortedKeys.map(([keyCode, count]) => {
                const ratio = count / maxPresses;
                // Number of filled blocks out of 20
                const blocks = 20;
                const filled = Math.round(ratio * blocks);
                return (
                  <div key={keyCode} style={styles.keyRow}>
                    <span style={styles.keyLabel}>{getLabel(keyCode)}</span>
                    <div style={styles.blockBar}>
                      {Array.from({ length: blocks }, (_, i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: 8,
                            background: i < filled
                              ? `hsl(${100 - ratio * 60}, 55%, ${40 + ratio * 10}%)`
                              : C.empty,
                            borderRadius: 1,
                          }}
                        />
                      ))}
                    </div>
                    <span style={styles.keyCount}>{count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  panel: {
    background: C.bg,
    borderRadius: 4,
    border: `2px solid ${C.border}`,
    width: 620,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px 10px',
    borderBottom: `2px solid ${C.border}`,
    background: C.tile,
  },
  title: {
    color: C.text,
    fontSize: 16,
    fontWeight: 700,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    letterSpacing: '-0.01em',
  },
  closeBtn: {
    background: 'none',
    border: `1px solid ${C.tileBorder}`,
    color: C.textDim,
    fontSize: 16,
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: 2,
    lineHeight: 1,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    minHeight: 0,
  },

  // Hero stats
  heroSection: {
    padding: '12px 16px 4px',
  },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
  },
  heroTile: {
    textAlign: 'center' as const,
    padding: '10px 4px',
    borderRadius: 3,
    background: C.tile,
    border: `1px solid ${C.tileBorder}`,
  },
  heroNumber: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: 'system-ui, monospace',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
  },
  heroLabel: {
    color: C.textDim,
    fontSize: 9,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginTop: 4,
    fontFamily: 'system-ui, sans-serif',
  },

  // Collection
  section: {
    padding: '10px 16px',
  },
  sectionTitle: {
    color: C.textDim,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    marginBottom: 8,
    fontFamily: 'system-ui, sans-serif',
  },
  segmentedBar: {
    display: 'flex',
    gap: 1,
    marginBottom: 6,
    padding: 3,
    background: C.tile,
    border: `1px solid ${C.tileBorder}`,
    borderRadius: 2,
  },
  rarityRow: {
    display: 'flex',
    gap: 12,
  },
  rarityItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  rarityCount: {
    color: C.textDim,
    fontSize: 10,
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
  },

  // Highlights
  highlightRow: {
    display: 'flex',
    gap: 6,
  },
  highlightTile: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 3,
    background: C.tile,
    border: `1px solid ${C.tileBorder}`,
  },
  highlightEmoji: {
    fontSize: 26,
    lineHeight: 1,
  },
  highlightName: {
    color: C.text,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'capitalize' as const,
    fontFamily: 'system-ui, sans-serif',
  },

  // Activity grid
  gridOuter: {
    position: 'relative' as const,
    padding: '8px 10px 6px',
    background: C.tile,
    border: `1px solid ${C.tileBorder}`,
    borderRadius: 3,
    overflowX: 'auto' as const,
  },

  // Crop grid
  cropGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))',
    gap: 4,
  },
  cropTile: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
    padding: '8px 0 6px',
    borderRadius: 3,
    background: C.tile,
    border: `1px solid ${C.tileBorder}`,
  },
  cropCount: {
    color: C.text,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
  },

  // Key presses
  keyList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  keyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 22,
  },
  keyLabel: {
    color: C.text,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'monospace',
    width: 44,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  blockBar: {
    flex: 1,
    display: 'flex',
    gap: 1,
  },
  keyCount: {
    color: C.textDim,
    fontSize: 10,
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
    width: 44,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
};
