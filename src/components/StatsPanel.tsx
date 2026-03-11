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
  const { harvestsByCrop, goldenHarvests, totalHarvested, totalKeyPresses, cells } = gameState;

  const totalPressesSum = useMemo(
    () => Object.values(totalKeyPresses).reduce((a, b) => a + b, 0),
    [totalKeyPresses],
  );

  // Sort keys by press count descending, filter out gaps
  const sortedKeys = useMemo(() => {
    return Object.entries(totalKeyPresses)
      .filter(([code]) => !code.startsWith('_gap'))
      .sort(([, a], [, b]) => b - a);
  }, [totalKeyPresses]);

  // Find max for bar scaling
  const maxPresses = sortedKeys.length > 0 ? sortedKeys[0][1] : 1;

  // Get label for a keyCode
  const getLabel = (keyCode: string) => cells[keyCode]?.label ?? keyCode;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Farm Stats</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.body}>
          {/* Harvest section */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Harvested — {totalHarvested} total
            </div>
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
                      return (
                        <div key={crop.id} style={styles.fruitItem}>
                          <span style={styles.fruitEmoji}>{crop.emoji}</span>
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

          {/* Key usage section */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Key Presses — {totalPressesSum.toLocaleString()} total
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
  section: {
    padding: '14px 20px',
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 12,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
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
