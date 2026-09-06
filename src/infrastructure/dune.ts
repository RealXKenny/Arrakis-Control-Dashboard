import { URL } from "node:url";
import { logger } from "../lib/logger";

/**
 * Dune Console API Client
 *
 * Handles:
 * - Console login/session cookies
 * - CSRF tokens
 * - Automatic re-authentication
 * - Retryable HTTP failures
 * - Blueprint uploads
 * - Discord Adapter requests
 */

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const MAX_BLUEPRINT_BYTES = 32 * 1024 * 1024;

class DuneConsoleApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);

    this.name = "DuneConsoleApiError";
    this.status = status;
    this.details = details;

    Object.setPrototypeOf(this, DuneConsoleApiError.prototype);
  }
}

class DiscordAdapterApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);

    this.name = "DiscordAdapterApiError";
    this.status = status;
    this.details = details;

    Object.setPrototypeOf(this, DiscordAdapterApiError.prototype);
  }
}

class DuneConsoleClient {
  constructor(baseUrl, adapterToken = null) {
    if (!baseUrl) {
      throw new Error("CONSOLE_URL is required to create a Dune console client.");
    }

    this.baseUrl = new URL(baseUrl).toString();

    this.adapterToken = adapterToken || process.env.ADAPTER_TOKEN || null;

    this.sessionCookie = null;
    this.csrfToken = null;
    this.password = null;
    this.reauthPromise = null;
    this.initialAuthPromise = null;
  }

  /**
   * --------------------------------------------------------------------------
   * CONSOLE AUTH
   * --------------------------------------------------------------------------
   */

  async getAuthState() {
    const response = await this.request("GET", "/api/auth/state", {
      waitForReady: false,
    });

    if (isRecord(response)) {
      const token = getString(response.csrfToken) || getString(response.csrf) || getString(response.token);

      if (token) {
        this.csrfToken = token;
      }
    }

    return response;
  }

  async login(password) {
    if (!password) {
      throw new Error("A Dune console password is required to log in.");
    }

    this.password = password;

    const response = await this.request("POST", "/api/auth/login", {
      authenticate: false,
      body: {
        password,
      },
      includeCsrf: false,
      captureSession: true,
      retryAuth: false,
    });

    if (!this.sessionCookie) {
      throw new Error("Login succeeded without returning an asc_session cookie.");
    }

    await this.getAuthState();

    if (!this.csrfToken) {
      throw new Error("The console did not provide a CSRF token after login.");
    }

    return response;
  }

  async logout() {
    try {
      return await this.request("POST", "/api/auth/logout", {
        body: {},
        retryAuth: false,
      });
    } finally {
      this.sessionCookie = null;
      this.csrfToken = null;
    }
  }

  /**
   * --------------------------------------------------------------------------
   * DISCORD ADAPTER
   * --------------------------------------------------------------------------
   *
   * The Discord Adapter uses the same Console URL, but authenticates with
   * ADAPTER_TOKEN instead of the browser session cookie.
   */

  async discordAdapterRequest(route, body = {}, options = {}) {
    const { retry = true, timeout = 30000 } = options;

    if (!this.adapterToken) {
      throw new DiscordAdapterApiError("ADAPTER_TOKEN is not configured.", 0);
    }

    const url = new URL(route, this.baseUrl);

    const startedAt = Date.now();

    let response;

    for (let attempt = 1; attempt <= (retry ? 3 : 1); attempt += 1) {
      try {
        response = await fetch(url, {
          method: "POST",

          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",

            Authorization: `Bearer ${this.adapterToken}`,
          },

          body: JSON.stringify(body),

          cache: "no-store",

          signal: AbortSignal.timeout(timeout),
        });

        /*
         * Retry temporary failures.
         *
         * IMPORTANT:
         * 403 is intentionally NOT retryable.
         * A 403 almost always means the adapter token/authorization
         * configuration is wrong and retrying cannot fix it.
         */
        if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === (retry ? 3 : 1)) {
          break;
        }

        logger.warn(`Discord Adapter ${route} returned temporary HTTP ${response.status}; ` + `retrying (${attempt}/3).`);
      } catch (error) {
        if (attempt === (retry ? 3 : 1)) {
          logger.error(`Discord Adapter ${route} network request failed ` + `after ${Date.now() - startedAt}ms.`, error);

          throw new DiscordAdapterApiError(`Discord Adapter network request failed: ${getErrorMessage(error)}`, 0, {
            cause: getErrorCause(error),
          });
        }

        logger.warn(`Discord Adapter ${route} network hiccup; ` + `retrying (${attempt}/3).`);

        await sleep(attempt * 1000);
      }

      if (response && RETRYABLE_STATUS_CODES.has(response.status)) {
        await sleep(attempt * 1000);
      }
    }

    if (!response) {
      throw new DiscordAdapterApiError(`Discord Adapter request failed without a response: POST ${route}`, 0);
    }

    const data = await this.readResponse(response);

    if (!response.ok) {
      const message = getResponseMessage(data) || `Discord Adapter request failed with status: ${response.status}`;

      logger.warn(`Discord Adapter POST ${route} failed with HTTP ${response.status} ` + `after ${Date.now() - startedAt}ms.`, {
        response: data,
      });

      /*
       * Give the caller enough information to distinguish:
       *
       * 401 = token missing/invalid
       * 403 = token exists but is forbidden
       * 404 = route missing
       * 5xx = server-side problem
       */
      throw new DiscordAdapterApiError(message, response.status, data);
    }

    return data;
  }

  async linkPlayer(actor, characterName) {
    return this.discordAdapterRequest("/api/integrations/discord/players/link", {
      actor,
      characterName,
    });
  }

  async verifyPlayerLink(actor, code) {
    return this.discordAdapterRequest("/api/integrations/discord/players/link/verify", {
      actor,
      code,
    });
  }

  async unlinkPlayer(actor) {
    return this.discordAdapterRequest("/api/integrations/discord/players/unlink", {
      actor,
    });
  }

  async getCurrentPlayer(actor) {
    return this.discordAdapterRequest("/api/integrations/discord/players/me", {
      actor,
    });
  }

  /**
   * --------------------------------------------------------------------------
   * BLUEPRINT UPLOAD
   * --------------------------------------------------------------------------
   */

  async uploadBlueprint(playerId, attachment) {
    if (!attachment || !attachment.url || !attachment.name) {
      throw new Error("A valid blueprint attachment is required.");
    }

    if (!Number.isFinite(Number(playerId)) || Number(playerId) <= 0) {
      throw new Error("A valid linked player ID is required.");
    }

    if (attachment.size !== undefined && attachment.size > MAX_BLUEPRINT_BYTES) {
      throw new Error("Blueprint files must be 32 MB or smaller.");
    }

    const attachmentUrl = new URL(attachment.url);
    if (attachmentUrl.protocol !== "https:") {
      throw new Error("Blueprint attachment URLs must use HTTPS.");
    }

    const fileResponse = await fetch(attachmentUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!fileResponse.ok) {
      throw new Error(`Unable to download the uploaded blueprint (HTTP ${fileResponse.status}).`);
    }

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    if (fileBuffer.length > MAX_BLUEPRINT_BYTES) {
      throw new Error("Blueprint files must be 32 MB or smaller.");
    }

    const form = new FormData();

    form.set("player_id", String(playerId));

    form.set(
      "file",
      new Blob([fileBuffer], {
        type: "application/json",
      }),
      attachment.name,
    );

    return this.requestMultipart("POST", "/api/blueprints/import", form);
  }

  /**
   * --------------------------------------------------------------------------
   * STANDARD CONSOLE REQUEST
   * --------------------------------------------------------------------------
   */

  async request(method, route, options = {}) {
    const {
      authenticate = true,

      includeCsrf = method !== "GET" && method !== "HEAD",

      query,

      body,

      captureSession = false,

      retryAuth = true,

      waitForReady = true,
    } = options;

    if (authenticate && waitForReady && this.initialAuthPromise) {
      await this.initialAuthPromise;
    }

    const url = new URL(route, this.baseUrl);

    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (authenticate && this.sessionCookie) {
      headers.Cookie = this.sessionCookie;
    }

    if (includeCsrf && this.csrfToken) {
      headers["x-csrf-token"] = this.csrfToken;
    }

    const startedAt = Date.now();

    let response;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await fetch(url, {
          method,
          headers,

          body: body === undefined ? undefined : JSON.stringify(body),

          signal: AbortSignal.timeout(30000),
        });

        if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === 3) {
          break;
        }

        logger.warn(`${method} ${route} returned temporary HTTP ${response.status}; ` + `retrying (${attempt}/3).`);
      } catch (error) {
        if (attempt === 3) {
          logger.error(`${method} ${route} network request failed ` + `after ${Date.now() - startedAt}ms.`, error);

          throw new DuneConsoleApiError(`Console API network request failed: ${getErrorMessage(error)}`, 0, {
            cause: getErrorCause(error),
          });
        }

        logger.warn(`${method} ${route} network hiccup; ` + `retrying (${attempt}/3).`);

        await sleep(attempt * 1000);
      }

      if (response && RETRYABLE_STATUS_CODES.has(response.status)) {
        await sleep(attempt * 1000);
      }
    }

    if (!response) {
      throw new DuneConsoleApiError(`Console API request failed without a response: ${method} ${route}`, 0);
    }

    if (captureSession) {
      this.captureSessionCookie(response);
    }

    const data = await this.readResponse(response);

    /*
     * Automatically re-login if the Console session expired.
     */
    if ((response.status === 401 || response.status === 403) && authenticate && retryAuth && this.password) {
      logger.warn(`${method} ${route} lost its Console session; ` + `re-authenticating and retrying once.`);

      await this.reauthenticate();

      return this.request(method, route, {
        ...options,
        retryAuth: false,
      });
    }

    if (!response.ok) {
      const message = getResponseMessage(data) || `Request failed with HTTP ${response.status}.`;

      logger.warn(`${method} ${route} failed with HTTP ${response.status} ` + `after ${Date.now() - startedAt}ms.`);

      throw new DuneConsoleApiError(message, response.status, data);
    }

    return data;
  }

  /**
   * --------------------------------------------------------------------------
   * RE-AUTHENTICATION
   * --------------------------------------------------------------------------
   */

  async reauthenticate() {
    if (!this.password) {
      throw new Error("Cannot re-authenticate without the configured console password.");
    }

    if (!this.reauthPromise) {
      this.reauthPromise = this.login(this.password).finally(() => {
        this.reauthPromise = null;
      });
    }

    return this.reauthPromise;
  }

  /**
   * --------------------------------------------------------------------------
   * MULTIPART REQUEST
   * --------------------------------------------------------------------------
   */

  async requestMultipart(method, route, form, retryAuth = true) {
    const url = new URL(route, this.baseUrl);

    const headers = {
      Accept: "application/json",
    };

    if (this.sessionCookie) {
      headers.Cookie = this.sessionCookie;
    }

    if (this.csrfToken) {
      headers["x-csrf-token"] = this.csrfToken;
    }

    const startedAt = Date.now();

    let response;

    try {
      response = await fetch(url, {
        method,
        headers,
        body: form,

        signal: AbortSignal.timeout(60000),
      });
    } catch (error) {
      logger.error(`${method} ${route} multipart request failed ` + `after ${Date.now() - startedAt}ms.`, error);

      throw new DuneConsoleApiError(`Console API upload failed: ${getErrorMessage(error)}`, 0, {
        cause: getErrorCause(error),
      });
    }

    const data = await this.readResponse(response);

    if ((response.status === 401 || response.status === 403) && retryAuth && this.password) {
      logger.warn(`${method} ${route} lost its Console session during multipart upload; ` + `re-authenticating and retrying once.`);

      await this.reauthenticate();

      return this.requestMultipart(method, route, form, false);
    }

    if (!response.ok || isFailedResponse(data)) {
      const message = getResponseMessage(data) || `Request failed with HTTP ${response.status}.`;

      throw new DuneConsoleApiError(message, response.status, data);
    }

    return data;
  }

  /**
   * --------------------------------------------------------------------------
   * SESSION COOKIE
   * --------------------------------------------------------------------------
   */

  captureSessionCookie(response) {
    const getSetCookie = response.headers.getSetCookie;

    const cookies = typeof getSetCookie === "function" ? getSetCookie.call(response.headers) : [response.headers.get("set-cookie")].filter(Boolean);

    const session = cookies.find((cookie) => cookie.startsWith("asc_session="));

    if (session) {
      this.sessionCookie = session.split(";", 1)[0];
    }
  }

  /**
   * --------------------------------------------------------------------------
   * RESPONSE PARSING
   * --------------------------------------------------------------------------
   */

  async readResponse(response) {
    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  }
}

/**
 * --------------------------------------------------------------------------
 * HELPERS
 * --------------------------------------------------------------------------
 */

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getString(value) {
  return typeof value === "string" ? value : undefined;
}

function getResponseMessage(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.error === "string") {
    return value.error;
  }

  if (typeof value.reason === "string") {
    return value.reason;
  }

  if (typeof value.message === "string") {
    return value.message;
  }

  return undefined;
}

function isFailedResponse(value) {
  return isRecord(value) && value.ok === false;
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getErrorCause(error) {
  if (isRecord(error)) {
    if (typeof error.code === "string") {
      return error.code;
    }

    if (typeof error.name === "string") {
      return error.name;
    }
  }

  return error instanceof Error ? error.name : "UnknownError";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * --------------------------------------------------------------------------
 * SINGLETON
 * --------------------------------------------------------------------------
 */

let duneConsoleClientInstance = null;

function getDuneClient() {
  const consoleUrl = process.env.CONSOLE_URL;

  const consolePassword = process.env.CONSOLE_PASSWORD;

  const adapterToken = process.env.ADAPTER_TOKEN;

  if (!consoleUrl) {
    throw new Error("CONSOLE_URL is not configured.");
  }

  if (!consolePassword) {
    throw new Error("CONSOLE_PASSWORD is not configured.");
  }

  if (!adapterToken) {
    throw new Error("ADAPTER_TOKEN is not configured.");
  }

  if (!duneConsoleClientInstance) {
    duneConsoleClientInstance = new DuneConsoleClient(consoleUrl, adapterToken);

    /*
     * Start authentication.
     *
     * Do not make requests wait for this promise here.
     * login() is responsible for creating the Console session.
     */
    duneConsoleClientInstance.initialAuthPromise = duneConsoleClientInstance.login(consolePassword).catch((error) => {
      logger.error("Initial Dune console login failed.", error);

      duneConsoleClientInstance.initialAuthPromise = null;
      throw error;
    });
  }

  return duneConsoleClientInstance;
}

async function warmupDuneClient() {
  const client = getDuneClient();

  if (client.initialAuthPromise) {
    await client.initialAuthPromise;
  }

  return client;
}

/**
 * --------------------------------------------------------------------------
 * NEXT.JS TEST ROUTE
 * --------------------------------------------------------------------------
 *
 * GET /api/dune
 *
 * This verifies the Console authentication state.
 */

export async function GET() {
  try {
    const client = getDuneClient();

    const result = await client.getAuthState();

    return Response.json(result);
  } catch (error) {
    if (error instanceof DuneConsoleApiError) {
      return Response.json(
        {
          error: error.message,
          status: error.status,
          details: error.details,
        },
        {
          status: error.status >= 400 ? error.status : 500,
        },
      );
    }

    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
      },
    );
  }
}

export { DuneConsoleClient, DuneConsoleApiError, DiscordAdapterApiError, getDuneClient, warmupDuneClient };
