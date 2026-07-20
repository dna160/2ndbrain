'use client';
import { Button, Chip } from '../ui/primitives';

export interface Participant {
  speakerKey: string;
  entityId: string | null;
  suggestedName: string | null;
  confirmed: boolean;
  confidence: number;
}

export function SpeakerChip({
  participant,
  onConfirm,
}: {
  participant: Participant;
  onConfirm: (speakerKey: string, name: string) => void;
}) {
  if (participant.confirmed) {
    return <Chip tone="accent">{participant.suggestedName ?? participant.speakerKey}</Chip>;
  }
  if (participant.suggestedName) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s2)' }}>
        <Chip>
          {participant.speakerKey} — suggested: {participant.suggestedName}
        </Chip>
        <Button onClick={() => onConfirm(participant.speakerKey, participant.suggestedName!)}>
          Confirm
        </Button>
      </span>
    );
  }
  return <Chip>{participant.speakerKey}</Chip>;
}
