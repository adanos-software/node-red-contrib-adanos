"use strict";

const STOCK_PLATFORMS = new Set(["reddit", "news", "x", "polymarket"]);
const ALL_MARKETS = new Set([...STOCK_PLATFORMS, "crypto"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

function present(value) {
  return value !== undefined && value !== null && value !== "";
}

function overridesFrom(msg) {
  if (!present(msg.adanos)) {
    return {};
  }
  if (typeof msg.adanos !== "object" || Array.isArray(msg.adanos)) {
    throw new InputError("msg.adanos must be an object");
  }
  return msg.adanos;
}

function configuredOrOverride(configValue, overrideValue) {
  return present(overrideValue) ? overrideValue : configValue;
}

function positiveInteger(value, field, { allowZero = false, maximum } = {}) {
  if (!present(value)) {
    return undefined;
  }
  const parsed = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new InputError(`${field} must be an integer of at least ${minimum}`);
  }
  if (maximum !== undefined && parsed > maximum) {
    throw new InputError(`${field} must not exceed ${maximum}`);
  }
  return parsed;
}

function isoDate(value, field) {
  if (!present(value)) {
    return undefined;
  }
  const normalized = String(value).trim();
  if (!DATE_PATTERN.test(normalized)) {
    throw new InputError(`${field} must use YYYY-MM-DD`);
  }
  return normalized;
}

function periodOptions(config, msg) {
  const overrides = overridesFrom(msg);
  const from = isoDate(configuredOrOverride(config.from, overrides.from), "from");
  const to = isoDate(configuredOrOverride(config.to, overrides.to), "to");
  const days = positiveInteger(
    configuredOrOverride(config.days, overrides.days),
    "days",
  );

  if (from && days !== undefined) {
    throw new InputError("Use from/to or days, not from and days together");
  }

  return withoutUndefined({ from, to, days });
}

function trendingOptions(config, msg) {
  const overrides = overridesFrom(msg);
  return withoutUndefined({
    ...periodOptions(config, msg),
    limit: positiveInteger(
      configuredOrOverride(config.limit, overrides.limit),
      "limit",
    ),
    offset: positiveInteger(
      configuredOrOverride(config.offset, overrides.offset),
      "offset",
      { allowZero: true },
    ),
    source: present(overrides.source) ? String(overrides.source).trim() : undefined,
    type: present(overrides.type) ? String(overrides.type).trim() : undefined,
  });
}

function withoutUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function resolveTypedValue(RED, node, msg, value, valueType, field) {
  let resolved;
  try {
    resolved = RED.util.evaluateNodeProperty(
      value,
      valueType || "str",
      node,
      msg,
    );
  } catch (error) {
    throw new InputError(`Unable to read ${field}: ${error.message}`);
  }
  if (!present(resolved)) {
    throw new InputError(`${field} is required`);
  }
  return resolved;
}

function normalizeAsset(value, field) {
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) {
    throw new InputError(`${field} is required`);
  }
  return normalized;
}

function parseAssets(value) {
  const rawAssets = Array.isArray(value) ? value : String(value).split(",");
  const assets = rawAssets
    .map((asset) => String(asset).trim().toUpperCase())
    .filter(Boolean);

  if (assets.length === 0) {
    throw new InputError("At least one asset is required");
  }
  if (assets.length > 10) {
    throw new InputError("Compare accepts at most 10 assets");
  }
  return assets;
}

function requirePlatform(platform, supported) {
  if (!supported.has(platform)) {
    throw new InputError(`Unsupported market: ${platform}`);
  }
  return platform;
}

function clientFor(RED, node) {
  const connection = RED.nodes.getNode(node.connection);
  if (!connection) {
    throw new InputError("Select an Adanos API configuration");
  }
  return connection.getClient();
}

function errorLabel(error) {
  const message = error instanceof Error ? error.message : "Request failed";
  return message.length > 32 ? `${message.slice(0, 29)}...` : message;
}

function withInputHandler(node, operation) {
  node.on("input", async (msg, send, done) => {
    const output = send || node.send.bind(node);
    node.status({ fill: "blue", shape: "dot", text: "requesting" });
    try {
      const { payload, topic } = await operation(msg);
      msg.payload = payload;
      if (!present(msg.topic)) {
        msg.topic = topic;
      }
      node.status({ fill: "green", shape: "dot", text: "received" });
      output(msg);
      if (done) {
        done();
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      node.status({ fill: "red", shape: "ring", text: errorLabel(normalized) });
      if (done) {
        done(normalized);
      } else {
        node.error(normalized, msg);
      }
    }
  });
}

function registerAdanosNodes(RED, createClient) {
  function AdanosConfigNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    let client;

    this.getClient = () => {
      const apiKey = this.credentials && this.credentials.apiKey;
      if (!present(apiKey)) {
        throw new InputError("Add an API key to the Adanos API configuration");
      }
      if (!client) {
        client = createClient({ apiKey });
      }
      return client;
    };
  }

  RED.nodes.registerType("adanos-config", AdanosConfigNode, {
    credentials: {
      apiKey: { type: "password", required: true },
    },
  });

  function AdanosStockNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.connection = config.connection;
    this.platform = requirePlatform(config.platform, STOCK_PLATFORMS);

    withInputHandler(this, async (msg) => {
      const ticker = normalizeAsset(
        resolveTypedValue(
          RED,
          this,
          msg,
          config.ticker,
          config.tickerType,
          "ticker",
        ),
        "ticker",
      );
      const payload = await clientFor(RED, this)[this.platform].stock(
        ticker,
        periodOptions(config, msg),
      );
      return {
        payload,
        topic: `adanos/${this.platform}/stock/${ticker}`,
      };
    });
  }
  RED.nodes.registerType("adanos-stock", AdanosStockNode);

  function AdanosCryptoNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.connection = config.connection;

    withInputHandler(this, async (msg) => {
      const symbol = normalizeAsset(
        resolveTypedValue(
          RED,
          this,
          msg,
          config.symbol,
          config.symbolType,
          "symbol",
        ),
        "symbol",
      );
      const payload = await clientFor(RED, this).crypto.token(
        symbol,
        periodOptions(config, msg),
      );
      return { payload, topic: `adanos/crypto/token/${symbol}` };
    });
  }
  RED.nodes.registerType("adanos-crypto", AdanosCryptoNode);

  function AdanosTrendingNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.connection = config.connection;
    this.market = requirePlatform(config.market, ALL_MARKETS);

    withInputHandler(this, async (msg) => {
      const payload = await clientFor(RED, this)[this.market].trending(
        trendingOptions(config, msg),
      );
      return { payload, topic: `adanos/${this.market}/trending` };
    });
  }
  RED.nodes.registerType("adanos-trending", AdanosTrendingNode);

  function AdanosCompareNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.connection = config.connection;
    this.market = requirePlatform(config.market, ALL_MARKETS);

    withInputHandler(this, async (msg) => {
      const assets = parseAssets(
        resolveTypedValue(
          RED,
          this,
          msg,
          config.assets,
          config.assetsType,
          "assets",
        ),
      );
      const payload = await clientFor(RED, this)[this.market].compare(
        assets,
        periodOptions(config, msg),
      );
      return { payload, topic: `adanos/${this.market}/compare` };
    });
  }
  RED.nodes.registerType("adanos-compare", AdanosCompareNode);
}

module.exports = {
  InputError,
  parseAssets,
  periodOptions,
  registerAdanosNodes,
  trendingOptions,
};
