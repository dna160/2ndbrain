import { Chip } from '../ui/primitives';

export function RecommendationCard({ speakerKey, advice }: { speakerKey: string; advice: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--s3)',
        marginBottom: 'var(--s2)',
        background: 'var(--surface)',
      }}
    >
      <Chip>{speakerKey}</Chip>
      <p style={{ marginTop: 'var(--s2)' }}>{advice}</p>
    </div>
  );
}
