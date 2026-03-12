import { useMemo } from 'react';
import type { GameState, Rarity } from '../types/game';
import { CROPS, RARITY_COLORS } from '../data/crops';

const RARITY_ORDER: Rarity[] = ['legendary', 'rare', 'uncommon', 'common'];
const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary',
};

interface StatsPanelProps {
  gameState: GameState;
  onClose: () => void;
}

export function StatsPanel({ gameState, onClose }: StatsPanelProps) {
  const { harvestsByCrop, goldenHarvests, totalHarvested, totalKeyPresses, cells, totalPestsRemoved } = gameState;

  const totalPresses = useMemo(
    () => Object.values(totalKeyPresses).reduce((a, b) => a + b, 0),
    [totalKeyPresses],
  );

  const totalGolden = useMemo(
    () => Object.values(goldenHarvests).reduce((a, b) => a + b, 0),
    [goldenHarvests],
  );

  // Unique species discovered (at least 1 harvest)
  const speciesDiscovered = useMemo(
    () => CROPS.filter(c => (harvestsByCrop[c.id] ?? 0) > 0).length,
    [harvestsByCrop],
  );

  // Rarest crop found
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

  // Most harvested crop
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

  // Sort keys by press count descending
  const sortedKeys = useMemo(() => {
    return Object.entries(totalKeyPresses)
      .filter(([code]) => !code.startsWith('_gap'))
      .sort(([, a], [, b]) => b - a);
  }, [totalKeyPresses]);

  const maxPresses = sortedKeys.length > 0 ? sortedKeys[0][1] : 1;
  const getLabel = (keyCode: string) => cells[keyCode]?.label ?? keyCode;

  // Collection progress per rarity
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

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Farm Stats</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.body}>
          {/* === HERO STATS === */}
          <div style={styles.heroSection}>
            <div style={styles.heroGrid}>
              <div style={styles.heroCard}>
                <div style={styles.heroNumber}>{totalPresses.toLocaleString()}</div>
                <div style={styles.heroLabel}>Keystrokes</div>
              </div>
              <div style={styles.heroCard}>
                <div style={styles.heroNumber}>{totalHarvested.toLocaleString()}</div>
                <div style={styles.heroLabel}>Harvested</div>
              </div>
              <div style={styles.heroCard}>
                <div style={{ ...styles.heroNumber, color: '#4ADE80' }}>{(totalPestsRemoved ?? 0).toLocaleString()}</div>
                <div style={styles.heroLabel}>Pests Squashed</div>
              </div>
              <div style={styles.heroCard}>
                <div style={{ ...styles.heroNumber, color: '#FFD700' }}>{totalGolden}</div>
                <div style={styles.heroLabel}>Golden Harvests</div>
              </div>
            </div>
          </div>

          {/* === COLLECTION PROGRESS === */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Collection — {speciesDiscovered}/{CROPS.length} species
            </div>
            <div style={styles.collectionBar}>
              <div style={{
                ...styles.collectionFill,
                width: `${(speciesDiscovered / CROPS.length) * 100}%`,
              }} />
            </div>
            <div style={styles.rarityProgressRow}>
              {RARITY_ORDER.map(rarity => {
                const p = rarityProgress[rarity];
                return (
                  <div key={rarity} style={styles.rarityProgressItem}>
                    <span style={{ color: RARITY_COLORS[rarity], fontSize: 10, fontWeight: 600 }}>
                      {RARITY_LABELS[rarity]}
                    </span>
                    <span style={styles.rarityProgressCount}>
                      {p.found}/{p.total}
                    </span>
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
                  <div style={styles.highlightCard}>
                    <div style={styles.highlightEmoji}>{rarestCrop.crop.emoji}</div>
                    <div style={styles.highlightText}>
                      <span style={{ color: RARITY_COLORS[rarestCrop.crop.rarity], fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const }}>
                        Rarest Find
                      </span>
                      <span style={styles.highlightName}>{rarestCrop.crop.id}</span>
                    </div>
                  </div>
                )}
                {mostHarvested && (
                  <div style={styles.highlightCard}>
                    <div style={styles.highlightEmoji}>{mostHarvested.crop.emoji}</div>
                    <div style={styles.highlightText}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const }}>
                        Most Harvested
                      </span>
                      <span style={styles.highlightName}>{mostHarvested.crop.id} x{mostHarvested.count}</span>
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
                <div key={rarity} style={{ marginBottom: 12 }}>
                  <div style={{
                    color: RARITY_COLORS[rarity],
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                  }}>
                    {RARITY_LABELS[rarity]}
                  </div>
                  <div style={styles.fruitGrid}>
                    {crops.map(crop => {
                      const count = harvestsByCrop[crop.id] ?? 0;
                      const golden = goldenHarvests[crop.id] ?? 0;
                      const discovered = count > 0;
                      return (
                        <div key={crop.id} style={{
                          ...styles.fruitItem,
                          opacity: discovered ? 1 : 0.3,
                        }}>
                          <span style={styles.fruitEmoji}>{discovered ? crop.emoji : '?'}</span>
                          <span style={styles.fruitCount}>{count}</span>
                          {golden > 0 && (
                            <span style={{ fontSize: 10, color: '#FFD700' }}>✨{golden}</span>
                          )}
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
              Key Presses — {totalPresses.toLocaleString()} total
            </div>
            <div style={styles.keyList}>
              {sortedKeys.length === 0 && (
                <div style={styles.emptyHint}>Start typing to see stats</div>
              )}
              {sortedKeys.map(([keyCode, count]) => (
                <div key={keyCode} style={styles.keyRow}>
                  <span style={styles.keyLabel}>{getLabel(keyCode)}</span>
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: `${(count / maxPresses) * 100}%`,
                      }}
                    />
                  </div>
                  <span style={styles.keyCount}>{count.toLocaleString()}</span>
                </div>
              ))}
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
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  panel: {
    background: 'rgba(30, 28, 24, 0.95)',
    borderRadius: 16,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    width: 620,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  title: {
    color: '#e8e0d4',
    fontSize: 18,
    fontWeight: 600,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    letterSpacing: '-0.02em',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
    lineHeight: 1,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    minHeight: 0,
  },

  // Hero stats
  heroSection: {
    padding: '20px 20px 8px',
  },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
  },
  heroCard: {
    textAlign: 'center' as const,
    padding: '14px 8px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  heroNumber: {
    color: '#e8e0d4',
    fontSize: 24,
    fontWeight: 700,
    fontFamily: 'system-ui, -apple-system, monospace',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginTop: 6,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },

  // Collection progress
  section: {
    padding: '14px 20px',
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 10,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  collectionBar: {
    height: 6,
    borderRadius: 3,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  collectionFill: {
    height: '100%',
    borderRadius: 3,
    background: 'linear-gradient(90deg, #7EC850, #F59E0B)',
    transition: 'width 0.3s ease',
  },
  rarityProgressRow: {
    display: 'flex',
    gap: 16,
  },
  rarityProgressItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  rarityProgressCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontFamily: 'system-ui, -apple-system, monospace',
    fontVariantNumeric: 'tabular-nums',
  },

  // Highlights
  highlightRow: {
    display: 'flex',
    gap: 10,
  },
  highlightCard: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  highlightEmoji: {
    fontSize: 28,
    lineHeight: 1,
  },
  highlightText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  highlightName: {
    color: '#e8e0d4',
    fontSize: 13,
    fontWeight: 500,
    textTransform: 'capitalize' as const,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },

  // Fruit grid
  fruitGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
    gap: 6,
  },
  fruitItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
    padding: '10px 0',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.04)',
    transition: 'opacity 0.2s',
  },
  fruitEmoji: {
    fontSize: 24,
  },
  fruitCount: {
    color: '#e8e0d4',
    fontSize: 16,
    fontWeight: 600,
    fontFamily: 'system-ui, -apple-system, monospace',
    fontVariantNumeric: 'tabular-nums',
  },

  // Key presses
  keyList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  keyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    height: 24,
  },
  keyLabel: {
    color: '#e8e0d4',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'system-ui, -apple-system, monospace',
    width: 48,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    background: 'linear-gradient(90deg, #7EC850, #4A90D9)',
    transition: 'width 0.3s ease',
  },
  keyCount: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: 'system-ui, -apple-system, monospace',
    fontVariantNumeric: 'tabular-nums',
    width: 48,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    textAlign: 'center' as const,
    padding: 20,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },

};
