'use client';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { RecommendationCard } from '../../../../components/meetings/RecommendationCard';
import { SpeakerChip } from '../../../../components/meetings/SpeakerChip';
import { TopicScrubber } from '../../../../components/meetings/TopicScrubber';
import { TranscriptViewer } from '../../../../components/meetings/TranscriptViewer';
import { useToast } from '../../../../components/shell/Toasts';
import { useKeyMap } from '../../../../lib/keyboard';
import { useConfirmSpeaker, useMeeting } from '../../../../lib/queries';
import { dateWIB } from '../../../../lib/time';

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: meeting, isLoading } = useMeeting(id);
  const confirm = useConfirmSpeaker(id);
  const toast = useToast();
  const [topicIdx, setTopicIdx] = useState(0);
  const [seekMs, setSeekMs] = useState<number | null>(null);

  const totalMs = useMemo(
    () => meeting?.segments.at(-1)?.endMs ?? (meeting?.durationSec ?? 0) * 1000,
    [meeting],
  );

  const selectTopic = (i: number) => {
    const topic = meeting?.topics[i];
    if (!topic) return;
    setTopicIdx(i);
    setSeekMs(topic.startMs);
  };

  useKeyMap(
    {
      '[': () => selectTopic(Math.max(0, topicIdx - 1)),
      ']': () => selectTopic(Math.min((meeting?.topics.length ?? 1) - 1, topicIdx + 1)),
    },
    [meeting, topicIdx],
  );

  if (isLoading)
    return (
      <section className="pane detail">
        <div className="detail-body">Loading…</div>
      </section>
    );
  if (!meeting)
    return (
      <section className="pane detail">
        <div className="empty">Meeting not found.</div>
      </section>
    );

  return (
    <section className="pane detail">
      <div className="toolbar">
        <strong style={{ flex: 1 }}>{meeting.title}</strong>
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          {dateWIB(meeting.occurredAt)}
        </span>
      </div>
      <div className="detail-body">
        <TopicScrubber
          topics={meeting.topics}
          totalMs={totalMs}
          currentIndex={topicIdx}
          onSelect={selectTopic}
        />

        <h3 className="section-h">Summary</h3>
        <p>{meeting.summary ?? '—'}</p>

        {meeting.decisions.length > 0 && (
          <>
            <h3 className="section-h">Decisions</h3>
            <ul style={{ paddingLeft: 18 }}>
              {meeting.decisions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </>
        )}

        {meeting.openQuestions.length > 0 && (
          <>
            <h3 className="section-h">Open questions</h3>
            <ul style={{ paddingLeft: 18 }}>
              {meeting.openQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </>
        )}

        {meeting.recommendations.length > 0 && (
          <>
            <h3 className="section-h">Recommendations</h3>
            {meeting.recommendations.map((r, i) => (
              <RecommendationCard key={i} speakerKey={r.speakerKey} advice={r.advice} />
            ))}
          </>
        )}

        <h3 className="section-h">Speakers</h3>
        <div style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap' }}>
          {meeting.participants.map((p) => (
            <SpeakerChip
              key={p.speakerKey}
              participant={p}
              onConfirm={(speakerKey, name) =>
                confirm.mutate(
                  { speakerKey, body: { newEntityName: name } },
                  { onSuccess: () => toast.push(`Confirmed ${name}`) },
                )
              }
            />
          ))}
        </div>

        <h3 className="section-h">Transcript</h3>
        <TranscriptViewer segments={meeting.segments} seekMs={seekMs} />
      </div>
    </section>
  );
}
