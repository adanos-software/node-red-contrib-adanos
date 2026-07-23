"use strict";

const assert = require("node:assert/strict");
const { after, afterEach, before, describe, test } = require("node:test");
const helper = require("node-red-node-test-helper");
const { registerAdanosNodes } = require("../lib/register-nodes");

function createFakeClient(calls) {
  function namespace(name, detailMethod) {
    return {
      [detailMethod]: async (asset, options) => {
        calls.push({ operation: detailMethod, market: name, asset, options });
        return { market: name, asset };
      },
      trending: async (options) => {
        calls.push({ operation: "trending", market: name, options });
        return [{ market: name }];
      },
      compare: async (assets, options) => {
        calls.push({ operation: "compare", market: name, assets, options });
        return { market: name, assets };
      },
    };
  }

  return {
    reddit: namespace("reddit", "stock"),
    news: namespace("news", "stock"),
    x: namespace("x", "stock"),
    polymarket: namespace("polymarket", "stock"),
    crypto: namespace("crypto", "token"),
  };
}

function moduleWithClient(calls, clientOptions) {
  return function testModule(RED) {
    registerAdanosNodes(RED, (options) => {
      clientOptions.push(options);
      return createFakeClient(calls);
    });
  };
}

function loadNode(module, node) {
  const flow = [
    { id: "config", type: "adanos-config", name: "Test API" },
    { ...node, id: "node", connection: "config", wires: [["output"]] },
    { id: "output", type: "helper" },
  ];
  return new Promise((resolve, reject) => {
    helper.load(module, flow, { config: { apiKey: "secret-key" } }, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve({ input: helper.getNode("node"), output: helper.getNode("output") });
      }
    });
  });
}

function receive(input, output, msg) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for output")), 1000);
    output.once("input", (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
    input.receive(msg);
  });
}

describe("Adanos Node-RED nodes", () => {
  before(() => new Promise((resolve) => helper.startServer(resolve)));
  afterEach(() => helper.unload());
  after(() => new Promise((resolve) => helper.stopServer(resolve)));

  test("stock resolves a ticker from msg and preserves the message", async () => {
    const calls = [];
    const clientOptions = [];
    const module = moduleWithClient(calls, clientOptions);
    const { input, output } = await loadNode(module, {
      type: "adanos-stock",
      platform: "reddit",
      ticker: "ticker",
      tickerType: "msg",
      from: "",
      to: "",
      days: "7",
    });

    const result = await receive(input, output, { ticker: "tsla", traceId: "abc" });

    assert.deepEqual(calls, [{
      operation: "stock",
      market: "reddit",
      asset: "TSLA",
      options: { days: 7 },
    }]);
    assert.deepEqual(clientOptions, [{ apiKey: "secret-key" }]);
    assert.deepEqual(result.payload, { market: "reddit", asset: "TSLA" });
    assert.equal(result.traceId, "abc");
    assert.equal(result.topic, "adanos/reddit/stock/TSLA");
  });

  test("crypto uses explicit dates from msg.adanos", async () => {
    const calls = [];
    const module = moduleWithClient(calls, []);
    const { input, output } = await loadNode(module, {
      type: "adanos-crypto",
      symbol: "symbol",
      symbolType: "msg",
      from: "",
      to: "",
      days: "",
    });

    await receive(input, output, {
      symbol: "btc",
      adanos: { from: "2026-07-01", to: "2026-07-07" },
    });

    assert.deepEqual(calls, [{
      operation: "token",
      market: "crypto",
      asset: "BTC",
      options: { from: "2026-07-01", to: "2026-07-07" },
    }]);
  });

  test("trending forwards pagination and platform-specific overrides", async () => {
    const calls = [];
    const module = moduleWithClient(calls, []);
    const { input, output } = await loadNode(module, {
      type: "adanos-trending",
      market: "news",
      limit: "10",
      offset: "0",
      from: "",
      to: "",
      days: "",
    });

    const result = await receive(input, output, {
      topic: "keep-this-topic",
      adanos: { limit: 5, offset: 10, source: "reuters" },
    });

    assert.deepEqual(calls, [{
      operation: "trending",
      market: "news",
      options: { limit: 5, offset: 10, source: "reuters" },
    }]);
    assert.equal(result.topic, "keep-this-topic");
  });

  test("compare accepts an array and normalizes assets", async () => {
    const calls = [];
    const module = moduleWithClient(calls, []);
    const { input, output } = await loadNode(module, {
      type: "adanos-compare",
      market: "crypto",
      assets: "assets",
      assetsType: "msg",
      from: "",
      to: "",
      days: "",
    });

    await receive(input, output, { assets: ["btc", " eth "] });

    assert.deepEqual(calls, [{
      operation: "compare",
      market: "crypto",
      assets: ["BTC", "ETH"],
      options: {},
    }]);
  });

  test("invalid period reports an error without calling the SDK", async () => {
    const calls = [];
    const module = moduleWithClient(calls, []);
    const { input } = await loadNode(module, {
      type: "adanos-stock",
      platform: "reddit",
      ticker: "TSLA",
      tickerType: "str",
      from: "2026-07-01",
      to: "",
      days: "7",
    });

    const error = await new Promise((resolve) => {
      input.once("call:error", (call) => resolve(call.args[0]));
      input.receive({});
    });

    assert.match(error.message, /from\/to or days/);
    assert.deepEqual(calls, []);
  });
});
