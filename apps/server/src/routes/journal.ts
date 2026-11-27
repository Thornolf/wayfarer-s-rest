// What the phone sends back: night reports and character backups, and the journal read from them.

import type { Api } from "../http/api";
import { HttpError } from "../http/errors";
import type { Services } from "../services";

export function journalRoutes(api: Api, { reports, backups }: Services): void {
  api.handle("putReport", ({ params, body, reply }) => {
    const receipt = reports.put(params.reportId, body);
    if (receipt.created) reply.code(201);
    return { id: params.reportId, receivedAt: receipt.receivedAt };
  });

  api.handle("listReports", ({ query }) => reports.list(query));

  api.handle("putBackup", ({ params, body, reply }) => {
    const receipt = backups.put(params.characterId, params.revision, body);
    if (receipt.created) reply.code(201);
    return { characterId: params.characterId, revision: params.revision, receivedAt: receipt.receivedAt };
  });

  api.handle("latestBackup", ({ params }) => {
    const backup = backups.latest(params.characterId);
    if (!backup) throw new HttpError("notFound", `No backup of character ${params.characterId}`);
    return backup;
  });
}
