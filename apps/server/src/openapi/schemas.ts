import type { FastifyInstance, FastifySchema } from "fastify";
import { gameTableColumnIds } from "@ps2-challenge/shared";

type SecurityRequirement = Record<string, never[]>;
type OpenApiRouteSchema = FastifySchema & {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  security?: SecurityRequirement[];
  consumes?: string[];
  produces?: string[];
};

const docsKey = "x-openapi-docs" as const;
type OpenApiDocs = Pick<FastifySchema, "body" | "params" | "querystring" | "response">;
type DocumentedFastifySchema = FastifySchema & { [docsKey]?: OpenApiDocs };
const authenticatedSecurity: SecurityRequirement[] = [{ ApiKey: [] }, { Cookie: [] }];
const adminSecurity = authenticatedSecurity;

export const openApiRefResolver = {
  buildLocalReference(json: Record<string, unknown>, _baseUri: Record<string, unknown>, _fragment: string, index: number) {
    return typeof json.$id === "string" ? json.$id : `def-${index}`;
  }
};

export function openApiTransform({ schema, url }: { schema?: FastifySchema; url: string }) {
  if (!schema) {
    return { schema: {}, url };
  }

  const documentedSchema = schema as DocumentedFastifySchema;
  const docs = documentedSchema[docsKey];
  const metadata = { ...documentedSchema };
  delete metadata[docsKey];
  return {
    schema: docs ? { ...metadata, ...docs } : metadata,
    url
  };
}

const stringNullable = { type: "string", nullable: true } as const;
const dateOnly = { type: "string", format: "date", pattern: String.raw`^\d{4}-\d{2}-\d{2}$` } as const;
const dateOnlyNullable = { ...dateOnly, nullable: true } as const;
const dateTime = { type: "string", format: "date-time" } as const;
const dateTimeNullable = { ...dateTime, nullable: true } as const;
const positiveId = { type: "integer", minimum: 1 } as const;
const count = { type: "integer", minimum: 0 } as const;

function ref($id: string) {
  return { $ref: `${$id}#` };
}

function arrayOf($id: string) {
  return { type: "array", items: ref($id) };
}

function recordOf(valueSchema: object) {
  return { type: "object", additionalProperties: valueSchema };
}

function route(schema: OpenApiRouteSchema): OpenApiRouteSchema {
  const { body, params, querystring, response, ...metadata } = schema;
  const docs = { body, params, querystring, response };
  return {
    ...metadata,
    [docsKey]: docs
  } as OpenApiRouteSchema;
}

export function registerOpenApiSchemas(app: FastifyInstance): void {
  for (const schema of openApiSchemas) {
    if (!app.getSchema(schema.$id)) {
      app.addSchema(schema);
    }
  }
}

const openApiSchemas = [
  {
    $id: "IdParams",
    type: "object",
    required: ["id"],
    properties: { id: positiveId }
  },
  {
    $id: "SerialNumberParams",
    type: "object",
    required: ["id", "serialId"],
    properties: { id: positiveId, serialId: positiveId }
  },
  {
    $id: "AlternateTitleParams",
    type: "object",
    required: ["id", "alternateTitleId"],
    properties: { id: positiveId, alternateTitleId: positiveId }
  },
  {
    $id: "UserRoleParams",
    type: "object",
    required: ["userId"],
    properties: { userId: positiveId }
  },
  {
    $id: "GameTitleParams",
    type: "object",
    required: ["gameTitle"],
    properties: { gameTitle: { type: "string" } }
  },
  {
    $id: "GameListQuery",
    type: "object",
    properties: { title: { type: "string" } }
  },
  {
    $id: "ReturnUrlQuery",
    type: "object",
    properties: { returnUrl: { type: "string" } }
  },
  {
    $id: "AuthCallbackQuery",
    type: "object",
    properties: { code: { type: "string" }, state: { type: "string" } }
  },
  {
    $id: "MessageResponse",
    type: "object",
    required: ["message"],
    properties: { message: { type: "string" } }
  },
  {
    $id: "ErrorResponse",
    type: "object",
    properties: {
      message: { type: "string" },
      error: { type: "string" }
    }
  },
  {
    $id: "ValidationErrorsResponse",
    type: "object",
    required: ["errors"],
    properties: { errors: { type: "array", items: { type: "string" } } }
  },
  {
    $id: "ChallengeRunnerInput",
    type: "object",
    additionalProperties: false,
    required: ["name", "description", "twitchUrl", "youtubeUrl"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", minLength: 1, maxLength: 1000 },
      twitchUrl: { type: "string", format: "uri", maxLength: 500, nullable: true },
      youtubeUrl: { type: "string", format: "uri", maxLength: 500, nullable: true }
    }
  },
  {
    $id: "ChallengeRunner",
    type: "object",
    required: ["id", "name", "description", "twitchUrl", "youtubeUrl", "logoUrl"],
    properties: {
      id: positiveId,
      name: { type: "string" },
      description: { type: "string" },
      twitchUrl: stringNullable,
      youtubeUrl: stringNullable,
      logoUrl: stringNullable
    }
  },
  {
    $id: "SubPickSettings",
    type: "object",
    required: ["tier1Entries", "tier2Entries", "tier3Entries", "spinDurationSeconds", "overlayMessage"],
    properties: {
      tier1Entries: { type: "integer", minimum: 0, maximum: 100 },
      tier2Entries: { type: "integer", minimum: 0, maximum: 100 },
      tier3Entries: { type: "integer", minimum: 0, maximum: 100 },
      spinDurationSeconds: { type: "integer", minimum: 1, maximum: 120 },
      overlayMessage: { type: "string", maxLength: 300 }
    }
  },
  {
    $id: "UpdateSubPickSettingsRequest",
    type: "object",
    additionalProperties: false,
    properties: {
      tier1Entries: { type: "integer", minimum: 0, maximum: 100 },
      tier2Entries: { type: "integer", minimum: 0, maximum: 100 },
      tier3Entries: { type: "integer", minimum: 0, maximum: 100 },
      spinDurationSeconds: { type: "integer", minimum: 1, maximum: 120 },
      overlayMessage: { type: "string", minLength: 1, maxLength: 300 }
    }
  },
  {
    $id: "TwitchUserLookupRequest",
    type: "object",
    additionalProperties: false,
    required: ["login"],
    properties: { login: { type: "string", pattern: String.raw`^\w{1,25}$` } }
  },
  {
    $id: "TwitchUserLookup",
    type: "object",
    required: ["twitchUserId", "login", "displayName", "profileImageUrl"],
    properties: { twitchUserId: { type: "string" }, login: { type: "string" }, displayName: { type: "string" }, profileImageUrl: stringNullable }
  },
  {
    $id: "CreateSubGrantRequest",
    type: "object",
    additionalProperties: false,
    required: ["twitchUserId", "twitchLogin", "twitchDisplayName", "tier", "grantType"],
    properties: {
      twitchUserId: { type: "string", pattern: String.raw`^\d{1,20}$` },
      twitchLogin: { type: "string", pattern: String.raw`^\w{1,25}$` },
      twitchDisplayName: { type: "string", minLength: 1, maxLength: 255 },
      tier: { type: "string", enum: ["prime", "1000", "2000", "3000"] },
      grantType: { type: "string", enum: ["new", "resub", "gift"] },
      giftCount: { type: "integer", minimum: 1, maximum: 1000 },
      entryCount: { type: "integer", minimum: 0, maximum: 5000, description: "Overrides the entry count calculated from the tier values" },
      notes: { type: "string", maxLength: 500, nullable: true }
    }
  },
  {
    $id: "UpdateSubGrantRequest",
    type: "object",
    additionalProperties: false,
    properties: {
      tier: { type: "string", enum: ["prime", "1000", "2000", "3000"] },
      grantType: { type: "string", enum: ["new", "resub", "gift"] },
      giftCount: { type: "integer", minimum: 1, maximum: 1000 },
      entryCount: { type: "integer", minimum: 0, maximum: 5000 },
      notes: { type: "string", maxLength: 500, nullable: true }
    }
  },
  {
    $id: "SetSubEntryPickRequest",
    type: "object",
    additionalProperties: false,
    required: ["gameId"],
    properties: { gameId: { ...positiveId, nullable: true } }
  },
  {
    $id: "SubEntry",
    type: "object",
    required: ["id", "grantId", "twitchUserId", "twitchDisplayName", "gameId", "gameTitle", "status", "pool", "canChangePick", "playedGameNumber", "createdAt"],
    properties: {
      id: positiveId,
      grantId: positiveId,
      twitchUserId: stringNullable,
      twitchDisplayName: stringNullable,
      gameId: { type: "integer", nullable: true },
      gameTitle: stringNullable,
      status: { type: "string", enum: ["undrawn", "in_100s_pool", "won", "lost", "removed_played", "voided"] },
      pool: { type: "string", enum: ["awaiting_pick", "needs_new_pick", "next_draw", "100s_pool", "finished"] },
      canChangePick: { type: "boolean" },
      playedGameNumber: { type: "integer", nullable: true },
      createdAt: dateTime
    }
  },
  {
    $id: "SubGrant",
    type: "object",
    required: ["id", "twitchUserId", "twitchLogin", "twitchDisplayName", "tier", "grantType", "giftCount", "entryCount", "source", "notes", "createdBy", "createdAt", "entries"],
    properties: {
      id: positiveId,
      twitchUserId: stringNullable,
      twitchLogin: stringNullable,
      twitchDisplayName: stringNullable,
      tier: { type: "string", enum: ["prime", "1000", "2000", "3000"] },
      grantType: { type: "string", enum: ["new", "resub", "gift"] },
      giftCount: count,
      entryCount: count,
      source: { type: "string", enum: ["eventsub", "manual"] },
      notes: stringNullable,
      createdBy: stringNullable,
      createdAt: dateTime,
      entries: arrayOf("SubEntry")
    }
  },
  {
    $id: "SubPool",
    type: "object",
    required: ["totalEntries", "games"],
    properties: {
      totalEntries: count,
      games: {
        type: "array",
        items: {
          type: "object",
          required: ["gameId", "gameTitle", "imageUrl", "entries", "odds"],
          properties: { gameId: positiveId, gameTitle: { type: "string" }, imageUrl: stringNullable, entries: count, odds: { type: "number" } }
        }
      }
    }
  },
  {
    $id: "SubPicksSummary",
    type: "object",
    required: ["schedule", "nextDrawPool", "tensPool", "hundredsPool", "overlayMessage", "tierEntries"],
    properties: {
      schedule: {
        type: "object",
        required: ["nextGameNumber", "nextDrawGameNumber", "nextDrawKind", "gamesUntilNextDraw", "nextHundredDrawGameNumber", "gamesUntilNextHundredDraw"],
        properties: {
          nextGameNumber: positiveId,
          nextDrawGameNumber: positiveId,
          nextDrawKind: { type: "string", enum: ["10s", "100s"] },
          gamesUntilNextDraw: count,
          nextHundredDrawGameNumber: positiveId,
          gamesUntilNextHundredDraw: count
        }
      },
      nextDrawPool: ref("SubPool"),
      tensPool: ref("SubPool"),
      hundredsPool: ref("SubPool"),
      overlayMessage: { type: "string" },
      tierEntries: { type: "object", properties: { tier1: count, tier2: count, tier3: count } }
    }
  },
  {
    $id: "SubWheelSlice",
    type: "object",
    required: ["entryId", "gameId", "gameTitle", "twitchDisplayName"],
    properties: {
      entryId: positiveId,
      gameId: { ...positiveId, nullable: true },
      gameTitle: { type: "string" },
      twitchDisplayName: stringNullable
    }
  },
  {
    $id: "SubDrawOdds",
    type: "object",
    required: ["gameId", "gameTitle", "entries", "odds"],
    properties: {
      gameId: { ...positiveId, nullable: true },
      gameTitle: { type: "string" },
      entries: positiveId,
      odds: { type: "number", minimum: 0, maximum: 1 }
    }
  },
  {
    $id: "SubSpinResult",
    type: "object",
    required: ["entryId", "gameId", "gameTitle", "twitchDisplayName", "entries", "odds"],
    properties: {
      entryId: positiveId,
      gameId: { ...positiveId, nullable: true },
      gameTitle: { type: "string" },
      twitchDisplayName: stringNullable,
      entries: positiveId,
      odds: { type: "number", minimum: 0, maximum: 1 }
    }
  },
  {
    $id: "SubDraw",
    type: "object",
    required: ["id", "kind", "gameNumber", "state", "locked", "slices", "odds", "shuffleCount", "spinCount", "spin", "winner", "createdAt", "finishedAt"],
    properties: {
      id: positiveId,
      kind: { type: "string", enum: ["10s", "100s"] },
      gameNumber: positiveId,
      state: { type: "string", enum: ["ready", "spinning", "awaiting_decision", "accepted", "cancelled"] },
      locked: { type: "boolean", description: "True once the wheel has been spun; the entries on it are then fixed until the draw finishes." },
      slices: arrayOf("SubWheelSlice"),
      odds: arrayOf("SubDrawOdds"),
      shuffleCount: count,
      spinCount: count,
      spin: {
        type: "object",
        nullable: true,
        description: "The latest spin. The result stays null until the wheel has stopped.",
        required: ["spinNumber", "startedAt", "durationMs", "revealAt", "sliceCount", "winningSliceIndex", "stopOffset", "decision", "result"],
        properties: {
          spinNumber: positiveId,
          startedAt: dateTime,
          durationMs: positiveId,
          revealAt: dateTime,
          sliceCount: positiveId,
          winningSliceIndex: count,
          stopOffset: { type: "number", minimum: 0, maximum: 1 },
          decision: { type: "string", enum: ["pending", "accepted", "respun", "cancelled"] },
          result: { ...ref("SubSpinResult"), nullable: true }
        }
      },
      winner: { ...ref("SubSpinResult"), nullable: true },
      createdAt: dateTime,
      finishedAt: dateTimeNullable
    }
  },
  {
    $id: "SubDrawHistory",
    type: "object",
    required: ["id", "kind", "gameNumber", "status", "createdAt", "finishedAt", "winner", "odds", "entries", "spins"],
    properties: {
      id: positiveId,
      kind: { type: "string", enum: ["10s", "100s"] },
      gameNumber: positiveId,
      status: { type: "string", enum: ["accepted", "cancelled"] },
      createdAt: dateTime,
      finishedAt: dateTimeNullable,
      winner: { ...ref("SubSpinResult"), nullable: true },
      odds: arrayOf("SubDrawOdds"),
      entries: {
        type: "array",
        items: {
          type: "object",
          required: ["entryId", "gameId", "gameTitle", "twitchDisplayName", "outcome", "playedGameNumber", "currentStatus", "currentPlayedGameNumber"],
          properties: {
            entryId: positiveId,
            gameId: { ...positiveId, nullable: true },
            gameTitle: { type: "string" },
            twitchDisplayName: stringNullable,
            outcome: { type: "string", enum: ["won", "moved_to_100s", "lost", "removed_played"], nullable: true },
            playedGameNumber: { ...positiveId, nullable: true },
            currentStatus: { type: "string", enum: ["undrawn", "in_100s_pool", "won", "lost", "removed_played", "voided"] },
            currentPlayedGameNumber: { ...positiveId, nullable: true }
          }
        }
      },
      spins: {
        type: "array",
        items: {
          type: "object",
          required: ["spinNumber", "startedAt", "decision", "result"],
          properties: {
            spinNumber: positiveId,
            startedAt: dateTime,
            decision: { type: "string", enum: ["pending", "accepted", "respun", "cancelled"] },
            result: ref("SubSpinResult")
          }
        }
      }
    }
  },
  {
    $id: "SubPickGameCount",
    type: "object",
    required: ["gameId", "gameTitle", "entries"],
    properties: { gameId: positiveId, gameTitle: { type: "string" }, entries: positiveId }
  },
  {
    $id: "SubPickedGame",
    type: "object",
    required: ["drawId", "gameNumber", "kind", "gameId", "gameTitle", "twitchDisplayName", "entries", "totalEntries", "odds", "spins", "progress"],
    properties: {
      drawId: positiveId,
      gameNumber: positiveId,
      kind: { type: "string", enum: ["10s", "100s"] },
      gameId: { ...positiveId, nullable: true },
      gameTitle: { type: "string" },
      twitchDisplayName: stringNullable,
      entries: positiveId,
      totalEntries: count,
      odds: { type: "number", minimum: 0, maximum: 1 },
      spins: count,
      progress: { ...ref("GameProgress"), nullable: true }
    }
  },
  {
    $id: "SubPickStats",
    type: "object",
    required: ["totals", "mostPickedNow", "mostPickedAllTime", "longestShot", "subPickedGames"],
    properties: {
      totals: {
        type: "object",
        required: ["draws", "cancelledDraws", "spins", "respins", "entries", "viewers"],
        properties: { draws: count, cancelledDraws: count, spins: count, respins: count, entries: count, viewers: count }
      },
      mostPickedNow: arrayOf("SubPickGameCount"),
      mostPickedAllTime: arrayOf("SubPickGameCount"),
      longestShot: { ...ref("SubPickedGame"), nullable: true },
      subPickedGames: arrayOf("SubPickedGame")
    }
  },
  {
    $id: "SubWheel",
    type: "object",
    required: ["draw", "due", "spinDurationSeconds", "serverNow"],
    properties: {
      draw: { ...ref("SubDraw"), nullable: true },
      due: {
        type: "object",
        nullable: true,
        required: ["gameNumber", "kind", "entryCount"],
        properties: { gameNumber: positiveId, kind: { type: "string", enum: ["10s", "100s"] }, entryCount: positiveId }
      },
      spinDurationSeconds: positiveId,
      serverNow: dateTime
    }
  },
  {
    $id: "MySubPicks",
    type: "object",
    required: ["entries", "stats"],
    properties: {
      entries: arrayOf("SubEntry"),
      stats: {
        type: "object",
        required: ["entriesEarned", "picksMade", "wins", "drawsEntered", "nextDrawOdds"],
        properties: { entriesEarned: count, picksMade: count, wins: count, drawsEntered: count, nextDrawOdds: { type: "number" } }
      }
    }
  },
  {
    $id: "EligibleGame",
    type: "object",
    required: ["id", "title", "imageUrl"],
    properties: { id: positiveId, title: { type: "string" }, imageUrl: stringNullable }
  },
  {
    $id: "SubGrantDeleteResult",
    type: "object",
    required: ["deleted", "voidedEntries"],
    properties: { deleted: { type: "boolean" }, voidedEntries: count }
  },
  {
    $id: "SubEntryDeleteResult",
    type: "object",
    required: ["deleted"],
    properties: { deleted: { type: "boolean", description: "False when the entry was voided to keep draw history" } }
  },
  {
    $id: "SubPickAudit",
    type: "object",
    required: ["id", "actor", "action", "targetType", "targetId", "details", "createdAt"],
    properties: {
      id: positiveId,
      actor: stringNullable,
      action: { type: "string" },
      targetType: { type: "string" },
      targetId: { type: "integer", nullable: true },
      details: { type: "object", additionalProperties: true },
      createdAt: dateTime
    }
  },
  {
    $id: "ChallengeRunnerLogoRefreshResult",
    type: "object",
    required: ["message", "total", "updated", "unchanged", "errors"],
    properties: {
      message: { type: "string" },
      total: { type: "integer" },
      updated: { type: "integer" },
      unchanged: { type: "integer" },
      errors: { type: "integer" }
    }
  },
  {
    $id: "SerialNumberConflictResponse",
    type: "object",
    required: ["error", "serialNumber"],
    properties: {
      error: { type: "string" },
      existingGameId: { type: "integer" },
      existingGameTitle: { type: "string" },
      serialNumber: { type: "string" }
    }
  },
  {
    $id: "Game",
    type: "object",
    required: ["id", "title", "releasedInEuPalOrNa", "isExcluded", "isOwned"],
    properties: {
      id: { type: "integer" },
      title: { type: "string" },
      developer: stringNullable,
      publisher: stringNullable,
      firstReleased: dateOnlyNullable,
      regionFirstReleasedIn: stringNullable,
      releasedInEuPalOrNa: { type: "boolean" },
      imageUrl: stringNullable,
      isExcluded: { type: "boolean" },
      isOwned: { type: "boolean" },
      howLongToBeatId: { type: "integer", nullable: true },
      howLongToBeatMainStorySeconds: { type: "integer", nullable: true },
      howLongToBeatMainExtraSeconds: { type: "integer", nullable: true },
      howLongToBeatCompletionistSeconds: { type: "integer", nullable: true }
    }
  },
  {
    $id: "CreateGameRequest",
    type: "object",
    required: ["title", "developer", "publisher", "regionFirstReleasedIn"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 150 },
      developer: { type: "string", minLength: 1, maxLength: 100 },
      publisher: { type: "string", minLength: 1, maxLength: 100 },
      firstReleased: dateOnlyNullable,
      regionFirstReleasedIn: { type: "string", minLength: 1, maxLength: 100 },
      releasedInEuPalOrNa: { type: "boolean", default: false },
      imageUrl: stringNullable
    }
  },
  {
    $id: "ExcludeGameRequest",
    type: "object",
    required: ["title", "reason"],
    properties: {
      title: { type: "string", minLength: 1 },
      reason: { type: "string", minLength: 1 }
    }
  },
  {
    $id: "UpdateExclusionRequest",
    type: "object",
    properties: {
      isExcluded: { type: "boolean" },
      exclude: { type: "boolean" },
      reason: stringNullable
    }
  },
  {
    $id: "AddGameOwnedRequest",
    type: "object",
    required: ["title", "ownPhysicalCopy"],
    properties: {
      title: { type: "string", minLength: 1 },
      ownPhysicalCopy: { type: "boolean" },
      typeOwned: stringNullable
    }
  },
  {
    $id: "UpdateOwnershipRequest",
    type: "object",
    required: ["ownPhysicalCopy"],
    properties: {
      ownPhysicalCopy: { type: "boolean" },
      typeOwned: stringNullable
    }
  },
  {
    $id: "UpdateProgressRequest",
    type: "object",
    required: ["title", "dateStarted", "platform"],
    properties: {
      title: { type: "string", minLength: 1 },
      dateStarted: dateOnly,
      dateFinished: dateOnlyNullable,
      completionTime: stringNullable,
      beatenCriteria: stringNullable,
      review: stringNullable,
      platform: { type: "string", minLength: 1 },
      deaths: { ...count, description: "Omit to keep the existing count" },
      deathLabel: { type: "string", maxLength: 50, nullable: true, description: "What the counter tracks, e.g. Crashes; defaults to Deaths" },
      overrideSubDraw: { type: "boolean", description: "Start the game even though a sub pick draw is due for this game number. The override is audit-logged." }
    }
  },
  {
    $id: "GameProgress",
    type: "object",
    required: ["progressId", "gameId", "gameTitle", "dateStarted", "platform"],
    properties: {
      progressId: { type: "integer" },
      gameId: { type: "integer" },
      gameTitle: { type: "string" },
      imageUrl: stringNullable,
      dateStarted: dateOnly,
      dateFinished: dateOnlyNullable,
      completionTime: stringNullable,
      beatenCriteria: stringNullable,
      review: stringNullable,
      platform: { type: "string" },
      deaths: count,
      deathLabel: stringNullable
    }
  },
  {
    $id: "DeathCounter",
    type: "object",
    required: ["progressId", "gameId", "gameTitle", "deaths", "deathLabel"],
    properties: {
      progressId: { type: "integer" },
      gameId: { type: "integer" },
      gameTitle: { type: "string" },
      imageUrl: stringNullable,
      deaths: count,
      deathLabel: { type: "string" }
    }
  },
  {
    $id: "SetDeathsRequest",
    type: "object",
    required: ["deaths"],
    properties: { deaths: count }
  },
  {
    $id: "AddSerialNumberRequest",
    type: "object",
    required: ["title", "serialNumber"],
    properties: {
      title: { type: "string", minLength: 1 },
      serialNumber: { type: "string", minLength: 1, maxLength: 50 },
      region: stringNullable,
      notes: stringNullable
    }
  },
  {
    $id: "SerialNumber",
    type: "object",
    required: ["serialId", "gameId", "serialNumber"],
    properties: {
      serialId: { type: "integer" },
      gameId: { type: "integer" },
      gameTitle: { type: "string" },
      serialNumber: { type: "string" },
      region: stringNullable,
      notes: stringNullable,
      message: { type: "string" }
    }
  },
  {
    $id: "AddAlternateTitleRequest",
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 150 },
      notes: stringNullable
    }
  },
  {
    $id: "AlternateTitle",
    type: "object",
    required: ["alternateTitleId", "gameId", "title"],
    properties: {
      alternateTitleId: { type: "integer" },
      gameId: { type: "integer" },
      title: { type: "string" },
      notes: stringNullable,
      message: { type: "string" }
    }
  },
  {
    $id: "GamesPageData",
    type: "object",
    required: ["games", "ownedTypes", "exclusionReasons", "completionStatus", "alternateTitles"],
    properties: {
      games: arrayOf("Game"),
      ownedTypes: recordOf({ type: "string" }),
      exclusionReasons: recordOf({ type: "string" }),
      completionStatus: recordOf({ type: "string" }),
      alternateTitles: recordOf(arrayOf("AlternateTitle"))
    }
  },
  {
    $id: "OwnershipType",
    type: "object",
    required: ["typeOwned"],
    properties: { typeOwned: { type: "string" } }
  },
  {
    $id: "ExclusionResponse",
    type: "object",
    required: ["message", "isExcluded"],
    properties: {
      message: { type: "string" },
      isExcluded: { type: "boolean" },
      reason: stringNullable
    }
  },
  {
    $id: "LegacyExclusionResponse",
    type: "object",
    required: ["exclusionId", "gameId", "reason", "message"],
    properties: {
      exclusionId: { type: "integer" },
      gameId: { type: "integer" },
      reason: { type: "string" },
      message: { type: "string" }
    }
  },
  {
    $id: "OwnershipResponse",
    type: "object",
    required: ["message", "isOwned", "ownPhysicalCopy"],
    properties: {
      message: { type: "string" },
      isOwned: { type: "boolean" },
      ownPhysicalCopy: { type: "boolean" },
      typeOwned: { type: "string" }
    }
  },
  {
    $id: "LegacyOwnershipResponse",
    type: "object",
    required: ["ownershipId", "gameId", "ownPhysicalCopy", "typeOwned", "message"],
    properties: {
      ownershipId: { type: "integer" },
      gameId: { type: "integer" },
      ownPhysicalCopy: { type: "boolean" },
      typeOwned: { type: "string" },
      message: { type: "string" }
    }
  },
  {
    $id: "CurrentVote",
    type: "object",
    required: ["gameId", "gameTitle", "voteCount", "gameNumber"],
    properties: {
      gameId: { type: "integer" },
      gameTitle: { type: "string" },
      voteCount: count,
      gameNumber: { type: "integer", minimum: 1, maximum: 3 }
    }
  },
  {
    $id: "UploadGameVote",
    type: "object",
    required: ["gameTitle", "count"],
    properties: {
      gameTitle: { type: "string", minLength: 1 },
      count,
      position: { type: "integer", minimum: 1, maximum: 3, nullable: true }
    }
  },
  {
    $id: "UploadRound",
    type: "object",
    required: ["voteRound", "votes"],
    properties: {
      voteRound: { type: "integer", minimum: 1 },
      votes: arrayOf("UploadGameVote"),
      notes: stringNullable
    }
  },
  {
    $id: "VoteRound",
    type: "object",
    required: ["voteRound", "topGameTitle", "topVotes", "secondGameTitle", "secondVotes", "lastGameTitle", "lastVotes"],
    properties: {
      voteRound: { type: "integer" },
      topGameId: { type: "integer", nullable: true },
      topGameTitle: { type: "string" },
      topVotes: count,
      topPosition: { type: "integer", nullable: true },
      secondGameId: { type: "integer", nullable: true },
      secondGameTitle: { type: "string" },
      secondVotes: count,
      secondPosition: { type: "integer", nullable: true },
      lastGameId: { type: "integer", nullable: true },
      lastGameTitle: { type: "string" },
      lastVotes: count,
      lastPosition: { type: "integer", nullable: true },
      notes: stringNullable
    }
  },
  {
    $id: "MutationCountResponse",
    type: "object",
    required: ["inserted", "updated"],
    properties: {
      inserted: { type: "integer" },
      updated: { type: "integer" }
    }
  },
  {
    $id: "ArchiveVotesRequest",
    type: "object",
    properties: {
      notes: stringNullable,
      manualPositions: recordOf({ type: "integer", minimum: 1, maximum: 3 }),
      overrideSubDraw: { type: "boolean", description: "Start the game even though a sub pick draw is due for this game number. The override is audit-logged." }
    }
  },
  {
    $id: "SubDrawDueResponse",
    type: "object",
    required: ["message", "code", "subDraw"],
    properties: {
      message: { type: "string" },
      code: { type: "string", enum: ["sub_draw_due"] },
      subDraw: {
        type: "object",
        required: ["gameNumber", "kind", "entryCount"],
        properties: {
          gameNumber: { type: "integer" },
          kind: { type: "string", enum: ["10s", "100s"] },
          entryCount: { type: "integer" }
        }
      }
    }
  },
  {
    $id: "ArchiveVotesResponse",
    type: "object",
    required: ["message", "round", "archivedCount"],
    properties: {
      message: { type: "string" },
      round: { type: "integer" },
      archivedCount: { type: "integer" }
    }
  },
  {
    $id: "UpdateVoteByGameNumberRequest",
    type: "object",
    required: ["gameNumber", "voteCount"],
    properties: {
      gameNumber: { type: "integer", minimum: 1, maximum: 3 },
      voteCount: count
    }
  },
  {
    $id: "UpdateVoteByGameNumberResponse",
    type: "object",
    required: ["message", "gameNumber", "gameTitle", "gameId", "voteCount"],
    properties: {
      message: { type: "string" },
      gameNumber: { type: "integer", minimum: 1, maximum: 3 },
      gameTitle: { type: "string" },
      gameId: { type: "integer" },
      voteCount: count
    }
  },
  {
    $id: "FillRandomVotesRequest",
    type: "object",
    required: ["count"],
    properties: { count: { type: "integer", minimum: 1, default: 1 } }
  },
  {
    $id: "FillRandomVotesResponse",
    type: "object",
    required: ["message", "addedGames"],
    properties: {
      message: { type: "string" },
      addedGames: arrayOf("CurrentVote")
    }
  },
  {
    $id: "GameTablePreferences",
    type: "object",
    additionalProperties: false,
    required: ["order", "hidden"],
    properties: {
      order: {
        type: "array",
        minItems: 2,
        maxItems: gameTableColumnIds.length,
        uniqueItems: true,
        items: { type: "string", enum: gameTableColumnIds }
      },
      hidden: {
        type: "array",
        maxItems: gameTableColumnIds.length,
        uniqueItems: true,
        items: { type: "string", enum: gameTableColumnIds }
      }
    }
  },
  {
    $id: "GameTablePreferencesResponse",
    type: "object",
    required: ["preferences"],
    properties: {
      preferences: { nullable: true, allOf: [ref("GameTablePreferences")] }
    }
  },
  {
    $id: "UserProfile",
    type: "object",
    required: ["isAuthenticated"],
    properties: {
      isAuthenticated: { type: "boolean" },
      username: stringNullable,
      twitchId: stringNullable,
      role: stringNullable,
      profileImageUrl: stringNullable,
      createdAt: dateTimeNullable,
      lastLoginAt: dateTimeNullable,
      apiKey: stringNullable
    }
  },
  {
    $id: "ApiKeyResponse",
    type: "object",
    required: ["apiKey"],
    properties: { apiKey: { type: "string" } }
  },
  {
    $id: "Role",
    type: "object",
    required: ["id", "name"],
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      description: stringNullable
    }
  },
  {
    $id: "AdminUser",
    type: "object",
    required: ["id", "twitchId", "username", "roleId", "createdAt", "lastLoginAt"],
    properties: {
      id: { type: "integer" },
      twitchId: { type: "string" },
      username: { type: "string" },
      profileImageUrl: stringNullable,
      roleId: { type: "integer" },
      role: stringNullable,
      createdAt: dateTime,
      lastLoginAt: dateTime
    }
  },
  {
    $id: "UpdateRoleRequest",
    type: "object",
    required: ["roleId"],
    properties: { roleId: positiveId }
  },
  {
    $id: "UpdateRoleResponse",
    type: "object",
    required: ["id", "username", "role", "message"],
    properties: {
      id: { type: "integer" },
      username: { type: "string" },
      role: { type: "string" },
      message: { type: "string" }
    }
  },
  {
    $id: "CoverImageRefreshResult",
    type: "object",
    required: ["message", "total", "updated", "skipped", "errors"],
    properties: {
      message: { type: "string" },
      total: { type: "integer" },
      updated: { type: "integer" },
      skipped: { type: "integer" },
      errors: { type: "integer" }
    }
  },
  {
    $id: "HowLongToBeatRefreshResult",
    type: "object",
    required: ["message", "total", "updated", "unchanged", "notFound", "errors"],
    properties: {
      message: { type: "string" },
      total: { type: "integer" },
      updated: { type: "integer" },
      unchanged: { type: "integer" },
      notFound: { type: "integer" },
      errors: { type: "integer" }
    }
  },
  {
    $id: "TwitchStreamStats",
    type: "object",
    required: ["channelLogin", "rangeStart", "rangeEnd", "rangeWeeks", "totalStreamSeconds", "averageWeeklyStreamSeconds", "vodCount"],
    properties: {
      channelLogin: { type: "string" },
      rangeStart: dateTime,
      rangeEnd: dateTime,
      rangeWeeks: { type: "number", minimum: 0, description: "Fixed 8-week aggregation window." },
      totalStreamSeconds: { type: "number", minimum: 0 },
      averageWeeklyStreamSeconds: { type: "number", minimum: 0, description: "Average weekly stream time over the last 8 weeks, excluding VODs shorter than 20 minutes." },
      vodCount: { ...count, description: "Number of VODs included in the aggregate after excluding streams shorter than 20 minutes." }
    }
  },
  {
    $id: "TwitchStreamSyncResult",
    type: "object",
    required: ["message", "channelLogin", "checked", "upserted", "skipped"],
    properties: {
      message: { type: "string" },
      channelLogin: { type: "string" },
      checked: { type: "integer" },
      upserted: { type: "integer" },
      skipped: { type: "integer" }
    }
  },
  {
    $id: "HealthCheckEntry",
    type: "object",
    required: ["name", "status", "duration"],
    properties: {
      name: { type: "string" },
      status: { type: "string" },
      description: stringNullable,
      duration: { type: "string" },
      tags: { type: "array", items: { type: "string" } }
    }
  },
  {
    $id: "HealthCheckResponse",
    type: "object",
    required: ["status", "totalDuration", "checks"],
    properties: {
      status: { type: "string" },
      totalDuration: { type: "string" },
      checks: arrayOf("HealthCheckEntry")
    }
  },
  {
    $id: "PingResponse",
    type: "object",
    required: ["status", "timestamp", "message"],
    properties: {
      status: { type: "string" },
      timestamp: dateTime,
      message: { type: "string" }
    }
  }
] as const;

const badRequest = { 400: ref("ErrorResponse") };
const validationBadRequest = { 400: ref("ValidationErrorsResponse") };
const unauthorizedForbidden = { 401: ref("ErrorResponse"), 403: ref("ErrorResponse") };
const notFound = { 404: ref("ErrorResponse") };
const conflict = { 409: ref("ErrorResponse") };
const serverError = { 500: ref("ErrorResponse") };

export const challengeRunnerRouteSchemas = {
  list: route({
    tags: ["Challenge Runners"],
    summary: "List challenge runners",
    operationId: "listChallengeRunners",
    response: { 200: arrayOf("ChallengeRunner"), ...serverError }
  }),
  create: route({
    tags: ["Challenge Runners"],
    summary: "Create a challenge runner",
    operationId: "createChallengeRunner",
    security: adminSecurity,
    body: ref("ChallengeRunnerInput"),
    response: { 201: ref("ChallengeRunner"), ...badRequest, ...unauthorizedForbidden, 502: ref("ErrorResponse"), 503: ref("ErrorResponse"), ...serverError }
  }),
  refreshLogos: route({
    tags: ["Challenge Runners"],
    summary: "Refresh challenge runner profile pictures",
    operationId: "refreshChallengeRunnerProfilePictures",
    security: adminSecurity,
    response: { 200: ref("ChallengeRunnerLogoRefreshResult"), ...unauthorizedForbidden, ...serverError }
  }),
  update: route({
    tags: ["Challenge Runners"],
    summary: "Update a challenge runner",
    operationId: "updateChallengeRunner",
    security: adminSecurity,
    params: ref("IdParams"),
    body: ref("ChallengeRunnerInput"),
    response: { 200: ref("ChallengeRunner"), ...badRequest, ...unauthorizedForbidden, ...notFound, 502: ref("ErrorResponse"), 503: ref("ErrorResponse"), ...serverError }
  }),
  delete: route({
    tags: ["Challenge Runners"],
    summary: "Delete a challenge runner",
    operationId: "deleteChallengeRunner",
    security: adminSecurity,
    params: ref("IdParams"),
    response: { 200: ref("MessageResponse"), ...unauthorizedForbidden, ...notFound, ...serverError }
  })
} as const;

export const eventSubRouteSchemas = {
  webhook: route({
    tags: ["Twitch EventSub"],
    summary: "Receive Twitch EventSub webhook messages",
    description:
      "Called by Twitch. Messages must carry a valid Twitch-Eventsub-Message-Signature for the configured secret and a timestamp within 10 minutes. Verification challenges are echoed back as text/plain.",
    operationId: "receiveEventSubWebhook",
    response: {
      200: { type: "string", description: "The verification challenge" },
      204: { type: "null", description: "Notification or revocation accepted" },
      ...badRequest,
      403: ref("ErrorResponse"),
      503: ref("ErrorResponse")
    }
  })
} as const;

const eventSubSubscription = {
  type: "object",
  required: ["id", "type", "status", "callback", "createdAt", "healthy"],
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    status: { type: "string" },
    callback: stringNullable,
    createdAt: dateTimeNullable,
    healthy: { type: "boolean", description: "Enabled (or pending verification) and pointing at this site's webhook" }
  }
} as const;

const eventSubStatus = {
  type: "object",
  required: [
    "secretConfigured",
    "secretChanged",
    "channelLogin",
    "broadcasterUserId",
    "callbackUrl",
    "authorizedAt",
    "authorizedBy",
    "revokedAt",
    "revokedReason",
    "subscriptions",
    "missingTypes",
    "subscriptionsError"
  ],
  properties: {
    secretConfigured: { type: "boolean" },
    secretChanged: { type: "boolean", description: "True when the Twitch client secret has changed since the subscriptions were created, so they need replacing." },
    channelLogin: { type: "string" },
    broadcasterUserId: stringNullable,
    callbackUrl: { type: "string" },
    authorizedAt: dateTimeNullable,
    authorizedBy: stringNullable,
    revokedAt: dateTimeNullable,
    revokedReason: stringNullable,
    subscriptions: { type: "array", items: eventSubSubscription },
    missingTypes: { type: "array", items: { type: "string" } },
    subscriptionsError: stringNullable
  }
} as const;

const eventSubReviewResult = {
  type: "object",
  required: ["messageId", "status", "grantId", "error"],
  properties: {
    messageId: { type: "string" },
    status: { type: "string", enum: ["processed", "ignored", "failed", "needs_review", "resolved", "dismissed"] },
    grantId: { type: "integer", nullable: true },
    error: stringNullable
  }
} as const;

export const eventSubAdminRouteSchemas = {
  status: route({
    tags: ["Twitch EventSub"],
    summary: "Get the Twitch EventSub connection status",
    operationId: "getEventSubStatus",
    security: adminSecurity,
    response: { 200: eventSubStatus, ...unauthorizedForbidden, ...serverError }
  }),
  sync: route({
    tags: ["Twitch EventSub"],
    summary: "Create or repair the Twitch EventSub subscriptions",
    description: "Removes subscriptions that have failed or point at another callback, then creates any that are missing.",
    operationId: "syncEventSubSubscriptions",
    security: adminSecurity,
    response: {
      200: {
        type: "object",
        required: ["created", "removed", "errors", "status"],
        properties: { created: { type: "array", items: { type: "string" } }, removed: count, errors: { type: "array", items: { type: "string" } }, status: eventSubStatus }
      },
      ...badRequest,
      ...unauthorizedForbidden,
      502: ref("ErrorResponse"),
      ...serverError
    }
  }),
  reviewQueue: route({
    tags: ["Twitch EventSub"],
    summary: "List EventSub events waiting for review",
    description: "Anonymous gifts and events that failed to process.",
    operationId: "listEventSubReviewQueue",
    security: adminSecurity,
    response: {
      200: {
        type: "array",
        items: {
          type: "object",
          required: ["messageId", "subscriptionType", "status", "reason", "receivedAt", "tier", "total", "twitchDisplayName"],
          properties: {
            messageId: { type: "string" },
            subscriptionType: { type: "string" },
            status: { type: "string", enum: ["needs_review", "failed"] },
            reason: stringNullable,
            receivedAt: dateTime,
            tier: stringNullable,
            total: { type: "integer", nullable: true },
            twitchDisplayName: stringNullable
          }
        }
      },
      ...unauthorizedForbidden,
      ...serverError
    }
  }),
  assignReview: route({
    tags: ["Twitch EventSub"],
    summary: "Give an anonymous gift's entries to a viewer",
    operationId: "assignEventSubReview",
    security: adminSecurity,
    params: { type: "object", required: ["messageId"], properties: { messageId: { type: "string" } } },
    body: {
      type: "object",
      additionalProperties: false,
      required: ["twitchUserId", "twitchLogin", "twitchDisplayName"],
      properties: {
        twitchUserId: { type: "string", pattern: String.raw`^\d{1,20}$` },
        twitchLogin: { type: "string", pattern: String.raw`^\w{1,25}$` },
        twitchDisplayName: { type: "string", minLength: 1, maxLength: 255 }
      }
    },
    response: { 200: eventSubReviewResult, ...badRequest, ...unauthorizedForbidden, ...notFound, ...conflict, ...serverError }
  }),
  dismissReview: route({
    tags: ["Twitch EventSub"],
    summary: "Dismiss an EventSub event without creating entries",
    operationId: "dismissEventSubReview",
    security: adminSecurity,
    params: { type: "object", required: ["messageId"], properties: { messageId: { type: "string" } } },
    response: { 200: eventSubReviewResult, ...unauthorizedForbidden, ...notFound, ...conflict, ...serverError }
  }),
  retryReview: route({
    tags: ["Twitch EventSub"],
    summary: "Process a failed EventSub event again",
    operationId: "retryEventSubReview",
    security: adminSecurity,
    params: { type: "object", required: ["messageId"], properties: { messageId: { type: "string" } } },
    response: { 200: eventSubReviewResult, ...unauthorizedForbidden, ...notFound, ...conflict, ...serverError }
  }),
  authorize: route({
    tags: ["Twitch EventSub"],
    summary: "Start authorising subscription access for the channel",
    description: "Redirects an admin to Twitch to grant channel:read:subscriptions. Complete it while signed in to Twitch as the channel account.",
    operationId: "authorizeEventSub",
    security: adminSecurity,
    response: { 302: { type: "null", description: "Redirect to Twitch" }, ...unauthorizedForbidden, ...notFound }
  })
} as const;

export const subPickRouteSchemas = {
  summary: route({
    tags: ["Sub Picks"],
    summary: "Get the draw schedule and current sub pick pools",
    operationId: "getSubPicksSummary",
    response: { 200: ref("SubPicksSummary"), ...serverError }
  }),
  eligibleGames: route({
    tags: ["Sub Picks"],
    summary: "List games that can be picked",
    description: "Games that are owned, included in the challenge and not started.",
    operationId: "listSubPickEligibleGames",
    response: { 200: arrayOf("EligibleGame"), ...serverError }
  }),
  mine: route({
    tags: ["Sub Picks"],
    summary: "Get the signed-in viewer's sub pick entries",
    operationId: "getMySubPicks",
    security: authenticatedSecurity,
    response: { 200: ref("MySubPicks"), 401: ref("ErrorResponse"), ...serverError }
  }),
  setMyPick: route({
    tags: ["Sub Picks"],
    summary: "Pick or change the game on one of your entries",
    operationId: "setMySubPick",
    security: authenticatedSecurity,
    params: ref("IdParams"),
    body: ref("SetSubEntryPickRequest"),
    response: { 200: ref("SubEntry"), ...badRequest, 401: ref("ErrorResponse"), ...notFound, ...conflict, ...serverError }
  })
} as const;

export const subDrawRouteSchemas = {
  wheel: route({
    tags: ["Sub Picks"],
    summary: "Get the sub pick wheel",
    description: "The open draw (or the last finished one), whether a draw is due, and the server time for syncing the spin animation.",
    operationId: "getSubPickWheel",
    response: { 200: ref("SubWheel"), ...serverError }
  }),
  history: route({
    tags: ["Sub Picks"],
    summary: "List finished sub pick draws",
    description: "Accepted and cancelled draws, newest first, with every spin and what happened to each entry. Open draws are left out so no result shows early.",
    operationId: "listSubDrawHistory",
    response: { 200: arrayOf("SubDrawHistory"), ...serverError }
  }),
  stats: route({
    tags: ["Sub Picks"],
    summary: "Get sub pick stats",
    description: "Totals, the most picked games now and of all time, the biggest long shot, and how every sub-picked game went.",
    operationId: "getSubPickStats",
    response: { 200: ref("SubPickStats"), ...serverError }
  }),
  open: route({
    tags: ["Sub Picks Admin"],
    summary: "Open the sub pick draw that's due",
    operationId: "openSubDraw",
    security: adminSecurity,
    response: { 200: ref("SubDraw"), ...unauthorizedForbidden, ...conflict, ...serverError }
  }),
  shuffle: drawAction("Shuffle the wheel", "shuffleSubDraw"),
  spin: drawAction("Spin the wheel", "spinSubDraw", "Picks the winner on the server. The result is hidden from every endpoint until the wheel stops."),
  respin: drawAction("Reject the result and get the wheel ready to spin again", "respinSubDraw"),
  accept: drawAction("Accept the result and start the winning game", "acceptSubDraw"),
  cancel: drawAction("Cancel the draw without a result", "cancelSubDraw")
};

function drawAction(summary: string, operationId: string, description?: string) {
  return route({
    tags: ["Sub Picks Admin"],
    summary,
    ...(description ? { description } : {}),
    operationId,
    security: adminSecurity,
    params: ref("IdParams"),
    response: { 200: ref("SubDraw"), ...unauthorizedForbidden, ...notFound, ...conflict, ...serverError }
  });
}

export const subPickAdminRouteSchemas = {
  settings: route({
    tags: ["Sub Picks Admin"],
    summary: "Get sub pick settings",
    operationId: "getSubPickSettings",
    security: adminSecurity,
    response: { 200: ref("SubPickSettings"), ...unauthorizedForbidden, ...serverError }
  }),
  updateSettings: route({
    tags: ["Sub Picks Admin"],
    summary: "Update sub pick settings",
    operationId: "updateSubPickSettings",
    security: adminSecurity,
    body: ref("UpdateSubPickSettingsRequest"),
    response: { 200: ref("SubPickSettings"), ...badRequest, ...unauthorizedForbidden, ...serverError }
  }),
  twitchLookup: route({
    tags: ["Sub Picks Admin"],
    summary: "Look up a Twitch user ID by username",
    operationId: "lookupTwitchUser",
    security: adminSecurity,
    body: ref("TwitchUserLookupRequest"),
    response: { 200: ref("TwitchUserLookup"), ...badRequest, ...unauthorizedForbidden, ...notFound, 502: ref("ErrorResponse") }
  }),
  listGrants: route({
    tags: ["Sub Picks Admin"],
    summary: "List sub entry grants and their entries",
    operationId: "listSubGrants",
    security: adminSecurity,
    response: { 200: arrayOf("SubGrant"), ...unauthorizedForbidden, ...serverError }
  }),
  createGrant: route({
    tags: ["Sub Picks Admin"],
    summary: "Add sub entries by hand",
    operationId: "createSubGrant",
    security: adminSecurity,
    body: ref("CreateSubGrantRequest"),
    response: { 201: ref("SubGrant"), ...badRequest, ...unauthorizedForbidden, ...serverError }
  }),
  updateGrant: route({
    tags: ["Sub Picks Admin"],
    summary: "Edit a sub entry grant",
    operationId: "updateSubGrant",
    security: adminSecurity,
    params: ref("IdParams"),
    body: ref("UpdateSubGrantRequest"),
    response: { 200: ref("SubGrant"), ...badRequest, ...unauthorizedForbidden, ...notFound, ...conflict, ...serverError }
  }),
  deleteGrant: route({
    tags: ["Sub Picks Admin"],
    summary: "Remove a sub entry grant",
    description: "Deletes the grant when none of its entries have been drawn, otherwise voids its remaining entries.",
    operationId: "deleteSubGrant",
    security: adminSecurity,
    params: ref("IdParams"),
    response: { 200: ref("SubGrantDeleteResult"), ...unauthorizedForbidden, ...notFound, ...serverError }
  }),
  setPick: route({
    tags: ["Sub Picks Admin"],
    summary: "Set the pick on a viewer's entry",
    operationId: "setSubPickForViewer",
    security: adminSecurity,
    params: ref("IdParams"),
    body: ref("SetSubEntryPickRequest"),
    response: { 200: ref("SubEntry"), ...badRequest, ...unauthorizedForbidden, ...notFound, ...conflict, ...serverError }
  }),
  removeEntry: route({
    tags: ["Sub Picks Admin"],
    summary: "Remove a single sub entry",
    operationId: "deleteSubEntry",
    security: adminSecurity,
    params: ref("IdParams"),
    response: { 200: ref("SubEntryDeleteResult"), ...unauthorizedForbidden, ...notFound, ...conflict, ...serverError }
  }),
  audit: route({
    tags: ["Sub Picks Admin"],
    summary: "List recent sub pick admin and viewer changes",
    operationId: "listSubPickAudit",
    security: adminSecurity,
    response: { 200: arrayOf("SubPickAudit"), ...unauthorizedForbidden, ...serverError }
  })
} as const;

export const gameRouteSchemas = {
  list: route({
    tags: ["Games"],
    summary: "List games",
    operationId: "listGames",
    querystring: ref("GameListQuery"),
    response: { 200: arrayOf("Game") }
  }),
  ownershipTypes: route({
    tags: ["Games"],
    summary: "List ownership types",
    operationId: "listOwnershipTypes",
    response: { 200: arrayOf("OwnershipType") }
  }),
  ownedTypes: route({
    tags: ["Games"],
    summary: "Get owned type map",
    operationId: "getOwnedTypesMap",
    response: { 200: recordOf({ type: "string" }) }
  }),
  pageData: route({
    tags: ["Games"],
    summary: "Get games page data",
    operationId: "getGamesPageData",
    response: { 200: ref("GamesPageData") }
  }),
  progress: route({
    tags: ["Games"],
    summary: "List game progress",
    operationId: "listGameProgress",
    response: { 200: arrayOf("GameProgress") }
  }),
  currentDeaths: route({
    tags: ["Death Counter"],
    summary: "Get the current game's death counter",
    description: "The current game is the unfinished progress entry with the latest start date.",
    operationId: "getCurrentDeaths",
    response: { 200: ref("DeathCounter"), ...notFound }
  }),
  listDeaths: route({
    tags: ["Death Counter"],
    summary: "List death counters for every progress entry",
    description: "Ordered by progress ID (the game number on the progress page). Entries without a recorded count return 0.",
    operationId: "listDeaths",
    response: { 200: arrayOf("DeathCounter") }
  }),
  progressDeaths: route({
    tags: ["Death Counter"],
    summary: "Get the death counter for a progress entry",
    operationId: "getProgressDeaths",
    params: ref("IdParams"),
    response: { 200: ref("DeathCounter"), ...notFound }
  }),
  incrementCurrentDeaths: route({
    tags: ["Death Counter"],
    summary: "Add one to the current game's death counter",
    operationId: "incrementCurrentDeaths",
    security: adminSecurity,
    response: { 200: ref("DeathCounter"), ...unauthorizedForbidden, ...notFound }
  }),
  decrementCurrentDeaths: route({
    tags: ["Death Counter"],
    summary: "Remove one from the current game's death counter",
    description: "The counter never goes below zero.",
    operationId: "decrementCurrentDeaths",
    security: adminSecurity,
    response: { 200: ref("DeathCounter"), ...unauthorizedForbidden, ...notFound }
  }),
  setCurrentDeaths: route({
    tags: ["Death Counter"],
    summary: "Set the current game's death counter",
    operationId: "setCurrentDeaths",
    security: adminSecurity,
    body: ref("SetDeathsRequest"),
    response: { 200: ref("DeathCounter"), ...validationBadRequest, ...unauthorizedForbidden, ...notFound }
  }),
  getById: route({
    tags: ["Games"],
    summary: "Get a game",
    operationId: "getGameById",
    params: ref("IdParams"),
    response: { 200: ref("Game"), ...notFound }
  }),
  create: route({
    tags: ["Games"],
    summary: "Create a game",
    operationId: "createGame",
    security: adminSecurity,
    body: ref("CreateGameRequest"),
    response: { 201: ref("Game"), ...validationBadRequest, ...unauthorizedForbidden, ...conflict }
  }),
  update: route({
    tags: ["Games"],
    summary: "Update a game",
    operationId: "updateGame",
    security: adminSecurity,
    params: ref("IdParams"),
    body: ref("CreateGameRequest"),
    response: { 200: ref("Game"), ...validationBadRequest, ...unauthorizedForbidden, ...notFound, ...conflict }
  }),
  delete: route({
    tags: ["Games"],
    summary: "Delete a game",
    operationId: "deleteGame",
    security: adminSecurity,
    params: ref("IdParams"),
    response: { 200: ref("MessageResponse"), ...unauthorizedForbidden, ...notFound, ...serverError }
  }),
  excludeLegacy: route({
    tags: ["Games"],
    summary: "Exclude a game by title",
    operationId: "excludeGameByTitle",
    security: adminSecurity,
    body: ref("ExcludeGameRequest"),
    response: { 200: ref("LegacyExclusionResponse"), ...validationBadRequest, ...unauthorizedForbidden, ...conflict }
  }),
  updateExclusion: route({
    tags: ["Games"],
    summary: "Update game exclusion",
    operationId: "updateGameExclusion",
    security: adminSecurity,
    params: ref("IdParams"),
    body: ref("UpdateExclusionRequest"),
    response: { 200: ref("ExclusionResponse"), ...badRequest, ...unauthorizedForbidden, ...notFound }
  }),
  ownedLegacy: route({
    tags: ["Games"],
    summary: "Mark a game as owned by title",
    operationId: "markGameOwnedByTitle",
    security: adminSecurity,
    body: ref("AddGameOwnedRequest"),
    response: { 200: ref("LegacyOwnershipResponse"), ...validationBadRequest, ...unauthorizedForbidden, ...conflict }
  }),
  updateOwnership: route({
    tags: ["Games"],
    summary: "Update game ownership",
    operationId: "updateGameOwnership",
    security: adminSecurity,
    params: ref("IdParams"),
    body: ref("UpdateOwnershipRequest"),
    response: { 200: ref("OwnershipResponse"), ...badRequest, ...unauthorizedForbidden, ...notFound }
  }),
  updateProgress: route({
    tags: ["Games"],
    summary: "Update game progress",
    operationId: "updateGameProgress",
    security: adminSecurity,
    body: ref("UpdateProgressRequest"),
    response: { 200: ref("GameProgress"), ...validationBadRequest, ...unauthorizedForbidden, ...notFound, 409: ref("SubDrawDueResponse") }
  }),
  addSerialNumber: route({
    tags: ["Games"],
    summary: "Add a serial number",
    operationId: "addSerialNumber",
    security: adminSecurity,
    body: ref("AddSerialNumberRequest"),
    response: { 200: ref("SerialNumber"), ...validationBadRequest, ...unauthorizedForbidden, 409: ref("SerialNumberConflictResponse"), ...notFound }
  }),
  listSerialNumbers: route({
    tags: ["Games"],
    summary: "List serial numbers for a game",
    operationId: "listSerialNumbers",
    security: adminSecurity,
    params: ref("IdParams"),
    response: { 200: arrayOf("SerialNumber"), ...unauthorizedForbidden, ...notFound }
  }),
  deleteSerialNumber: route({
    tags: ["Games"],
    summary: "Delete a serial number",
    operationId: "deleteSerialNumber",
    security: adminSecurity,
    params: ref("SerialNumberParams"),
    response: { 200: ref("MessageResponse"), ...unauthorizedForbidden, ...notFound }
  }),
  listAlternateTitles: route({
    tags: ["Games"],
    summary: "List alternate titles for a game",
    operationId: "listAlternateTitles",
    params: ref("IdParams"),
    response: { 200: arrayOf("AlternateTitle"), ...notFound }
  }),
  addAlternateTitle: route({
    tags: ["Games"],
    summary: "Add an alternate title",
    operationId: "addAlternateTitle",
    security: adminSecurity,
    params: ref("IdParams"),
    body: ref("AddAlternateTitleRequest"),
    response: { 200: ref("AlternateTitle"), ...validationBadRequest, ...unauthorizedForbidden, ...notFound, ...conflict }
  }),
  deleteAlternateTitle: route({
    tags: ["Games"],
    summary: "Delete an alternate title",
    operationId: "deleteAlternateTitle",
    security: adminSecurity,
    params: ref("AlternateTitleParams"),
    response: { 200: ref("MessageResponse"), ...unauthorizedForbidden, ...notFound }
  }),
  refreshCovers: route({
    tags: ["Admin"],
    summary: "Refresh game cover images",
    operationId: "refreshGameCoverImages",
    security: adminSecurity,
    response: { 200: ref("CoverImageRefreshResult"), ...unauthorizedForbidden }
  }),
  refreshCoversStream: route({
    tags: ["Admin"],
    summary: "Stream game cover image refresh progress",
    description: "Returns newline-delimited JSON progress events for the admin cover refresh UI.",
    operationId: "streamGameCoverImageRefresh",
    security: adminSecurity,
    produces: ["application/x-ndjson"],
    response: { 200: { type: "string", description: "NDJSON stream of progress, completion, or error events" }, ...unauthorizedForbidden }
  }),
  refreshHowLongToBeat: route({
    tags: ["Admin"],
    summary: "Refresh HowLongToBeat game times",
    operationId: "refreshHowLongToBeatTimes",
    security: adminSecurity,
    response: { 200: ref("HowLongToBeatRefreshResult"), ...unauthorizedForbidden }
  }),
  refreshHowLongToBeatStream: route({
    tags: ["Admin"],
    summary: "Stream HowLongToBeat refresh progress",
    description: "Returns newline-delimited JSON progress events for the admin HowLongToBeat refresh UI.",
    operationId: "streamHowLongToBeatRefresh",
    security: adminSecurity,
    produces: ["application/x-ndjson"],
    response: { 200: { type: "string", description: "NDJSON stream of progress, completion, or error events" }, ...unauthorizedForbidden }
  })
} as const;

export const voteRouteSchemas = {
  history: route({
    tags: ["Votes"],
    summary: "List archived vote rounds",
    operationId: "listVoteHistory",
    response: { 200: arrayOf("VoteRound") }
  }),
  current: route({
    tags: ["Votes"],
    summary: "List current votes",
    operationId: "listCurrentVotes",
    response: { 200: arrayOf("CurrentVote") }
  }),
  upload: route({
    tags: ["Votes"],
    summary: "Upload vote history",
    operationId: "uploadVoteHistory",
    security: adminSecurity,
    body: arrayOf("UploadRound"),
    response: { 200: ref("MutationCountResponse"), ...badRequest, ...unauthorizedForbidden }
  }),
  setCurrent: route({
    tags: ["Votes"],
    summary: "Replace or upsert current votes",
    operationId: "setCurrentVotes",
    security: adminSecurity,
    body: arrayOf("CurrentVote"),
    response: { 200: ref("MutationCountResponse"), ...badRequest, ...unauthorizedForbidden }
  }),
  deleteCurrent: route({
    tags: ["Votes"],
    summary: "Remove a current vote by game title",
    operationId: "removeCurrentVote",
    security: adminSecurity,
    params: ref("GameTitleParams"),
    response: { 200: ref("MessageResponse"), ...badRequest, ...unauthorizedForbidden, ...notFound }
  }),
  archive: route({
    tags: ["Votes"],
    summary: "Archive current votes",
    operationId: "archiveCurrentVotes",
    security: adminSecurity,
    body: ref("ArchiveVotesRequest"),
    response: { 200: ref("ArchiveVotesResponse"), ...badRequest, ...unauthorizedForbidden, 409: ref("SubDrawDueResponse") }
  }),
  updateByGameNumber: route({
    tags: ["Votes"],
    summary: "Update current vote count by game number",
    operationId: "updateVoteCountByGameNumber",
    security: adminSecurity,
    body: ref("UpdateVoteByGameNumberRequest"),
    response: { 200: ref("UpdateVoteByGameNumberResponse"), ...badRequest, ...unauthorizedForbidden, ...notFound }
  }),
  fillRandom: route({
    tags: ["Votes"],
    summary: "Fill current votes with random eligible games",
    operationId: "fillCurrentVotesWithRandomGames",
    security: adminSecurity,
    body: ref("FillRandomVotesRequest"),
    response: { 200: ref("FillRandomVotesResponse"), ...badRequest, ...unauthorizedForbidden }
  })
} as const;

export const authRouteSchemas = {
  login: route({
    tags: ["Auth"],
    summary: "Start Twitch OAuth login",
    operationId: "login",
    querystring: ref("ReturnUrlQuery"),
    response: { 302: { description: "Redirect to Twitch OAuth" } }
  }),
  callback: route({
    tags: ["Auth"],
    summary: "Handle Twitch OAuth callback",
    operationId: "authCallback",
    querystring: ref("AuthCallbackQuery"),
    response: { 302: { description: "Redirect after login" } }
  }),
  logout: route({
    tags: ["Auth"],
    summary: "Clear the auth cookie",
    operationId: "logout",
    querystring: ref("ReturnUrlQuery"),
    response: { 302: { description: "Redirect after logout" } }
  }),
  user: route({
    tags: ["Auth"],
    summary: "Get current auth status",
    operationId: "getAuthUser",
    response: { 200: ref("UserProfile"), ...serverError }
  })
} as const;

export const twitchRouteSchemas = {
  streamStats: route({
    tags: ["Twitch"],
    summary: "Get recent Twitch stream time statistics",
    operationId: "getTwitchStreamStats",
    response: { 200: ref("TwitchStreamStats"), 502: ref("ErrorResponse") }
  })
} as const;

export const userRouteSchemas = {
  profile: route({
    tags: ["User"],
    summary: "Get current user profile",
    operationId: "getUserProfile",
    security: authenticatedSecurity,
    response: { 200: ref("UserProfile"), 401: ref("ErrorResponse") }
  }),
  regenerateApiKey: route({
    tags: ["User"],
    summary: "Generate a new raw API key",
    description: "Returns the raw API key once. The stored value remains hashed.",
    operationId: "generateApiKey",
    security: authenticatedSecurity,
    response: { 200: ref("ApiKeyResponse"), 401: ref("ErrorResponse") }
  }),
  gameTablePreferences: route({
    tags: ["User"],
    summary: "Get game table preferences",
    operationId: "getGameTablePreferences",
    security: authenticatedSecurity,
    response: { 200: ref("GameTablePreferencesResponse"), 401: ref("ErrorResponse") }
  }),
  updateGameTablePreferences: route({
    tags: ["User"],
    summary: "Update game table preferences",
    operationId: "updateGameTablePreferences",
    security: authenticatedSecurity,
    body: ref("GameTablePreferences"),
    response: {
      200: ref("GameTablePreferencesResponse"),
      400: ref("ErrorResponse"),
      401: ref("ErrorResponse")
    }
  })
} as const;

export const adminRouteSchemas = {
  users: route({
    tags: ["Admin"],
    summary: "List users",
    operationId: "listAdminUsers",
    security: adminSecurity,
    response: { 200: arrayOf("AdminUser"), ...unauthorizedForbidden, ...serverError }
  }),
  roles: route({
    tags: ["Admin"],
    summary: "List roles",
    operationId: "listRoles",
    security: adminSecurity,
    response: { 200: arrayOf("Role"), ...unauthorizedForbidden, ...serverError }
  }),
  refreshTwitchStats: route({
    tags: ["Admin"],
    summary: "Update Twitch stream statistics",
    operationId: "updateTwitchStreamStatistics",
    security: adminSecurity,
    response: { 200: ref("TwitchStreamSyncResult"), ...unauthorizedForbidden, ...serverError }
  }),
  updateRole: route({
    tags: ["Admin"],
    summary: "Update a user's role",
    operationId: "updateUserRole",
    security: adminSecurity,
    params: ref("UserRoleParams"),
    body: ref("UpdateRoleRequest"),
    response: { 200: ref("UpdateRoleResponse"), ...badRequest, ...unauthorizedForbidden, ...notFound, ...serverError }
  })
} as const;

export const healthRouteSchemas = {
  health: route({
    tags: ["Health"],
    summary: "Get detailed health status",
    operationId: "getHealth",
    response: { 200: ref("HealthCheckResponse"), 503: ref("HealthCheckResponse") }
  }),
  ping: route({
    tags: ["Health"],
    summary: "Ping the API",
    operationId: "pingHealth",
    response: { 200: ref("PingResponse") }
  })
} as const;
