/** Shared artwork for the app icons: a simple radar/scan mark. */
export function IconArt({ size }: { size: number }) {
  const ring = (d: number, w: number, o: number) => ({
    position: 'absolute' as const,
    width: d,
    height: d,
    borderRadius: '50%',
    border: `${w}px solid rgba(61,220,132,${o})`,
  });
  return (
    <div style={{ width: size, height: size, background: '#0b0d10', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={ring(size * 0.74, Math.max(1, size * 0.035), 0.35)} />
      <div style={ring(size * 0.5, Math.max(1, size * 0.04), 0.6)} />
      <div style={{ position: 'absolute', width: size * 0.18, height: size * 0.18, borderRadius: '50%', background: '#3ddc84' }} />
    </div>
  );
}
