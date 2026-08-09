/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/speaker.service.ts
 * Role    : Confirm a suggested speaker → person entity mapping (docs/03 Phase 3 task 4).
 *           Creates/links the entity and marks the meeting participant confirmed.
 * Exports : SpeakerService
 */
import { and, eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import { entities, meetings, type MeetingParticipant, plaudRecordings, speakerAliases } from '../db/schema';

export interface ConfirmInput {
  entityId?: string;
  newEntityName?: string;
}

export interface SpeakerDeps {
  db: Database;
  now?: () => Date;
}

export class SpeakerService {
  private readonly now: () => Date;

  constructor(private readonly deps: SpeakerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async confirm(
    tenantId: string,
    meetingId: string,
    speakerKey: string,
    input: ConfirmInput,
  ): Promise<{ entityId: string }> {
    let entityId = input.entityId;
    if (!entityId) {
      const rows = await this.deps.db
        .insert(entities)
        .values({ tenantId, kind: 'person', name: input.newEntityName ?? 'Unknown' })
        .returning({ id: entities.id });
      entityId = rows[0]?.id;
      if (!entityId) throw new Error('speaker confirm: entity insert returned no id');
    }

    const [meeting] = await this.deps.db
      .select({ participants: meetings.participants })
      .from(meetings)
      .where(and(eq(meetings.tenantId, tenantId), eq(meetings.id, meetingId)));
    if (!meeting) throw new Error(`speaker confirm: meeting ${meetingId} not found`);

    const participants: MeetingParticipant[] = meeting.participants.map((p) =>
      p.speakerKey === speakerKey ? { ...p, entityId, confirmed: true } : p,
    );

    await this.deps.db
      .update(meetings)
      .set({ participants, updatedAt: this.now() })
      .where(and(eq(meetings.tenantId, tenantId), eq(meetings.id, meetingId)));

    // Persist the mapping so this speaker auto-resolves on future imports from the same Plaud
    // device (docs/05 §3.6). Only applies to Plaud meetings — matched via the recording's serial.
    const [rec] = await this.deps.db
      .select({ serial: plaudRecordings.serialNumber })
      .from(plaudRecordings)
      .where(and(eq(plaudRecordings.tenantId, tenantId), eq(plaudRecordings.meetingId, meetingId)))
      .limit(1);
    if (rec?.serial) {
      await this.deps.db
        .insert(speakerAliases)
        .values({ tenantId, contactId: entityId, deviceSerial: rec.serial, speakerLabel: speakerKey, confirmedVia: 'dashboard' })
        .onConflictDoUpdate({
          target: [speakerAliases.tenantId, speakerAliases.deviceSerial, speakerAliases.speakerLabel],
          set: { contactId: entityId, confirmedAt: this.now(), updatedAt: this.now() },
        });
    }

    return { entityId };
  }
}
