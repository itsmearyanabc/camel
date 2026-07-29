export default function SkeletonLoader() {
  return (
    <div className="skeleton-wrapper" style={{ padding: '24px' }}>
      <div className="skeleton-header" style={{ marginBottom: '24px' }}>
        <div className="skeleton skeleton-text" style={{ width: '40%', height: '32px', marginBottom: '12px' }}></div>
        <div className="skeleton skeleton-text" style={{ width: '60%', height: '16px' }}></div>
      </div>
      
      <div className="skeleton-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton-card" style={{ border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', background: 'var(--bg-secondary)' }}>
            <div className="skeleton skeleton-image" style={{ width: '100%', height: '180px', borderRadius: '8px', marginBottom: '16px' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '80%', height: '20px', marginBottom: '8px' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '50%', height: '14px', marginBottom: '16px' }}></div>
            <div className="skeleton skeleton-button" style={{ width: '100%', height: '36px', borderRadius: '8px' }}></div>
          </div>
        ))}
      </div>
    </div>
  );
}
